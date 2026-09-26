"""Overlap engine + analytics that feed the dashboard.

Two methods, both from Sperry's own documents:
  * spec method (default ranking): closest-point distance in UTM 17N, tiers
      touching/crossing | <1.6 km | <8 km | <40 km
  * guide method (Finding_Real_Locations_Guide): haversine between project centers
      (midpoint of the two named endpoints), flagged under 25 mi, with in-service gap in days
Timeline uses real build windows (DESC: spend profile -> in-service; GPC: IRP start -> need date).
"""
from __future__ import annotations

import datetime as dt
import math
import statistics
from collections import defaultdict

from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import nearest_points

from common import INTERIM, PROCESSED, read_json, write_json

TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32617", always_xy=True)
TO_WGS = Transformer.from_crs("EPSG:32617", "EPSG:4326", always_xy=True)

TIERS = [  # (id, max_km, label, what can be shared)
    (1, 0.05, "Must coordinate", "Lines touch or cross: outage timing and crossing structures must be planned together."),
    (2, 1.6, "Share the land", "Within 1 mile: right-of-way, access roads and permits can be shared."),
    (3, 8.0, "Share the site", "Within 5 miles: laydown yards, material deliveries and site logistics can be shared."),
    (4, 40.0, "Share crews", "Within 25 miles (a morning's drive): crews, cranes and contractors can be shared."),
]
CONF_W = {"manual": 1.0, "sample": 1.0, "osm": 1.0, "osm_fuzzy": 0.9, "inferred": 0.8, "town": 0.7, "unlocated": 0.0}
KV_FACTOR = {46: 0.6, 69: 0.7, 115: 1.0, 161: 1.2, 230: 1.45, 500: 2.6}


def d(s):
    return dt.date.fromisoformat(s) if s else None


def utm_geom(p):
    if p.get("route"):
        segs = [[TO_UTM.transform(lon, lat) for lon, lat in seg] for seg in p["route"] if len(seg) >= 2]
        if segs:
            return MultiLineString(segs)
    pts = [TO_UTM.transform(lon, lat) for lon, lat in p["path"]]
    return LineString(pts) if len(pts) >= 2 else Point(pts[0])


def hav_mi(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(h))


def region_of(lat, lon):
    if lat < 32.75 and lon > -81.65:
        return "Savannah"
    if 33.0 < lat < 34.0 and -82.6 < lon < -81.4:
        return "Augusta"
    return "Other"


# ---------------------------------------------------------------- explainable score (spec 3.5)
GEO_CONF = {"manual": 1.0, "sample": 1.0, "osm": 1.0, "osm_fuzzy": 0.9, "inferred": 0.7, "town": 0.5, "unlocated": 0.0}
SCHED_CONF = {"DESC": 0.8, "GA": 1.0}  # DESC start is the first budgeted year; Georgia files an explicit start date


def score_pair(a, b, km, tier, timeline, overlap_days, gap_days, kv_match):
    """Deterministic 100-point score: geography 50, timeline 25, compatibility 15, confidence 10."""
    geo = 50.0 if tier and tier[0] == 1 else max(0.0, 50.0 * (1 - km / 40.0))
    if timeline == "concurrent":
        tl = 15 + 10 * min(1.0, overlap_days / 30.4 / 12)
        tl_why = f"construction windows overlap {round(overlap_days / 30.4)} months"
    elif gap_days is not None and gap_days <= 180:
        tl, tl_why = 12.0, f"completion dates {gap_days} days apart"
    elif gap_days is not None and gap_days <= 365:
        tl, tl_why = 8.0, f"completion dates {gap_days} days apart"
    elif timeline == "back-to-back":
        tl, tl_why = 6.0, "builds run back-to-back"
    else:
        tl, tl_why = 0.0, "builds are years apart"
    both_lines = a["geom_type"] == b["geom_type"] == "line"
    fam = lambda w: "new" if w == "new_line" else "existing" if w in ("rebuild", "reconductor") else "station"
    comp = (8 if kv_match else 0) + (4 if both_lines else 0) + (3 if fam(a["work_type"]) == fam(b["work_type"]) else 0)
    comp_why = ", ".join(x for x in [
        "same voltage" if kv_match else "different voltage",
        "both are lines" if both_lines else None,
        "same kind of work" if fam(a["work_type"]) == fam(b["work_type"]) else None] if x)
    g = min(GEO_CONF[a["confidence"]], GEO_CONF[b["confidence"]])
    sch = min(SCHED_CONF["DESC" if a["utility"] == "DESC" else "GA"], SCHED_CONF["DESC" if b["utility"] == "DESC" else "GA"])
    conf = 10 * (0.7 * g + 0.3 * sch)
    parts = [
        {"key": "geography", "label": "Geographic proximity", "points": round(geo, 1), "max": 50,
         "why": "lines touch or cross" if tier and tier[0] == 1 else f"{km:.1f} km at the closest points"},
        {"key": "timeline", "label": "Timeline alignment", "points": round(tl, 1), "max": 25, "why": tl_why},
        {"key": "compatibility", "label": "Infrastructure compatibility", "points": float(comp), "max": 15, "why": comp_why},
        {"key": "confidence", "label": "Data confidence", "points": round(conf, 1), "max": 10,
         "why": f"location {int(g * 100)}%, schedule {int(sch * 100)}%"},
    ]
    return {"total": round(sum(x["points"] for x in parts), 1), "parts": parts}


# ---------------------------------------------------------------- cost model
def calibrate(desc):
    """$/mile by work type from DESC's own public costs (reported totals / filed miles)."""
    per_mile = defaultdict(list)
    fixed = defaultdict(list)
    for p in desc:
        c, mi = p.get("cost_total"), p.get("miles")
        kvf = KV_FACTOR.get(max(p["kv"]) if p["kv"] else 115, 1.0)
        if not c:
            continue
        if mi and p["work_type"] in ("new_line", "rebuild", "reconductor"):
            per_mile[p["work_type"]].append(c / mi / kvf)
        else:
            fixed[p["work_type"]].append(c)
    cal = {"per_mile_115kv_equiv": {k: {"median": statistics.median(v), "p25": _pct(v, .25), "p75": _pct(v, .75), "n": len(v)}
                                    for k, v in per_mile.items()},
           "per_project": {k: {"median": statistics.median(v), "p25": _pct(v, .25), "p75": _pct(v, .75), "n": len(v)}
                           for k, v in fixed.items()}}
    all_costs = [p["cost_total"] for p in desc if p.get("cost_total")]
    cal["overall"] = {"median": statistics.median(all_costs), "p25": _pct(all_costs, .25), "p75": _pct(all_costs, .75), "n": len(all_costs)}
    return cal


def _pct(v, q):
    v = sorted(v)
    i = (len(v) - 1) * q
    lo, hi = math.floor(i), math.ceil(i)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)


def estimate_cost(p, cal):
    if p.get("cost_total"):
        return {"low": p["cost_total"], "mid": p["cost_total"], "high": p["cost_total"], "basis": "reported (DESC filing)"}
    kvf = KV_FACTOR.get(max(p["kv"]) if p["kv"] else 115, 1.0)
    wt = p["work_type"]
    if p.get("miles") and wt in cal["per_mile_115kv_equiv"]:
        m = cal["per_mile_115kv_equiv"][wt]
        f = p["miles"] * kvf
        return {"low": m["p25"] * f, "mid": m["median"] * f, "high": m["p75"] * f,
                "basis": f"modelled: {p['miles']} mi x DESC {wt.replace('_', ' ')} $/mi (n={m['n']}) x {kvf} kV factor"}
    src = cal["per_project"].get(wt) or cal["overall"]
    return {"low": src["p25"], "mid": src["median"], "high": src["p75"],
            "basis": f"modelled: DESC median {wt.replace('_', ' ')} project cost (n={src['n']})"}


# ---------------------------------------------------------------- main
def main():
    projects = read_json(INTERIM / "projects_geo.json")
    desc = [p for p in projects if p["utility"] == "DESC"]
    cal = calibrate(desc)
    for p in projects:
        p["id"] = f"{p['utility']}-{p['source_id']}".replace(" ", "")
        p["cost_est"] = estimate_cost(p, cal)
        s, e = d(p.get("build_start")), d(p.get("in_service"))
        if s and e and s > e:  # guard against a start later than need date
            s = e
        p["window"] = [s.isoformat() if s else None, e.isoformat() if e else None]
        p["region"] = region_of(*p["center"]) if p.get("center") else None
        eps = [GEO_CONF[e["conf"]] for e in p["endpoints"]] or [0]
        p["geometry_confidence"] = round(min(eps), 2) if p["located"] else 0.0
        p["schedule_confidence"] = SCHED_CONF["DESC" if p["utility"] == "DESC" else "GA"] if p["window"][0] else 0.0
        p["geometry_method"] = ("OpenStreetMap route" if p.get("route") else
                                "Straight line between located endpoints" if p.get("geom_type") == "line" else
                                "Point at located facility" if p["located"] else "Not located")
        p["voltage_kv"] = max(p["kv"]) if p["kv"] else None
        lim = []
        if p.get("geom_type") == "line" and not p.get("route"):
            lim.append("Route is approximate: drawn as a straight line between its endpoints.")
        if any(e["conf"] in ("town", "inferred") for e in p["endpoints"]):
            lim.append("At least one endpoint is located only to a town or inferred from line lengths.")
        if any(e["conf"] == "unlocated" for e in p["endpoints"]):
            lim.append("At least one named endpoint could not be located.")
        if not p.get("cost_total"):
            lim.append("Cost is redacted in the public filing; any cost shown is modelled.")
        if p["utility"] == "DESC":
            lim.append("Construction start is the first year with budgeted spend (month not filed).")
        p["limitations"] = lim
        p["length_mi"] = p.get("miles") or (round(hav_mi((p["path"][0][1], p["path"][0][0]), (p["path"][1][1], p["path"][1][0])), 2)
                                           if p.get("geom_type") == "line" and len(p["path"]) >= 2 else None)

    a_side = [p for p in desc if p["located"]]
    b_side = [p for p in projects if p["utility"] != "DESC" and p["located"]]
    geoms = {p["id"]: utm_geom(p) for p in a_side + b_side}

    pairs, n_checked = [], 0
    for a in a_side:
        for b in b_side:
            n_checked += 1
            ga, gb = geoms[a["id"]], geoms[b["id"]]
            km = ga.distance(gb) / 1000
            center_mi = hav_mi(a["center"], b["center"])
            if km > 40 and center_mi > 25:
                continue
            tier = next((t for t in TIERS if km <= t[1]), None)
            pa, pb = nearest_points(ga, gb)
            (lo1, la1), (lo2, la2) = TO_WGS.transform(pa.x, pa.y), TO_WGS.transform(pb.x, pb.y)
            sa, ea, sb, eb = map(d, (a["window"][0], a["window"][1], b["window"][0], b["window"][1]))
            overlap_days = max(0, (min(ea, eb) - max(sa, sb)).days) if all((sa, ea, sb, eb)) else 0
            gap_days = abs((ea - eb).days) if ea and eb else None
            window_gap = max(0, (max(sa, sb) - min(ea, eb)).days) if all((sa, ea, sb, eb)) else None
            timeline = "concurrent" if overlap_days > 0 else ("back-to-back" if window_gap is not None and window_gap <= 365 else "separate")
            conf = min(CONF_W[a["confidence"]], CONF_W[b["confidence"]])
            kv_match = bool(set(a["kv"]) & set(b["kv"]))
            sc = score_pair(a, b, km, tier, timeline, overlap_days, gap_days, kv_match)
            basis = "route" if a.get("route") and b.get("route") else "estimate"
            pairs.append({
                "id": f"{a['id']}__{b['id']}",
                "a": a["id"], "b": b["id"], "b_utility": b["utility"], "b_sponsor": b["sponsor"],
                "km": round(km, 3), "mi": round(km * 0.621371, 2),
                "tier": tier[0] if tier else None,
                "center_mi": round(center_mi, 2), "guide_flag": center_mi < 25,
                "in_service_gap_days": gap_days, "overlap_days": overlap_days,
                "overlap_window": [max(sa, sb).isoformat(), min(ea, eb).isoformat()] if overlap_days else None,
                "window_gap_days": window_gap, "timeline": timeline,
                "completion_sync": gap_days is not None and gap_days <= 180,
                "kv_match": kv_match, "confidence": round(conf, 2),
                "score": sc["total"], "score_parts": sc["parts"], "override": "crossing" if tier and tier[0] == 1 else None,
                "measurement": basis,
                "connector": [[round(lo1, 6), round(la1, 6)], [round(lo2, 6), round(la2, 6)]],
                "region": region_of((la1 + la2) / 2, (lo1 + lo2) / 2),
            })
    pairs.sort(key=lambda p: -p["score"])
    for i, p in enumerate(pairs, 1):
        p["rank"] = i

    # ---- clusters: union-find over coordination-relevant pairs (within 40 km, not 'separate')
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for pr in pairs:
        if pr["tier"] and pr["timeline"] != "separate":
            parent[find(pr["a"])] = find(pr["b"])
    byid = {p["id"]: p for p in projects}
    groups = defaultdict(set)
    for pr in pairs:
        if pr["tier"] and pr["timeline"] != "separate":
            groups[find(pr["a"])] |= {pr["a"], pr["b"]}
    clusters = []
    for k, members in groups.items():
        ms = [byid[m] for m in members]
        lat = statistics.mean(m["center"][0] for m in ms)
        lon = statistics.mean(m["center"][1] for m in ms)
        months = _months(ms)
        peak_month, peak = max(months.items(), key=lambda kv: kv[1]) if months else (None, 0)
        cpairs = [pr for pr in pairs if pr["a"] in members and pr["b"] in members and pr["tier"]]
        clusters.append({
            "id": f"C{len(clusters) + 1}", "members": sorted(members), "center": [round(lat, 5), round(lon, 5)],
            "region": region_of(lat, lon), "n_desc": sum(1 for m in ms if m["utility"] == "DESC"),
            "n_ga": sum(1 for m in ms if m["utility"] != "DESC"),
            "peak_concurrent": peak, "peak_month": peak_month,
            "crew_share_days": sum(pr["overlap_days"] for pr in cpairs),
            "best_tier": min(pr["tier"] for pr in cpairs) if cpairs else None,
            "best_season": _best_season(ms),
            "pairs": [pr["id"] for pr in cpairs],
        })
    clusters.sort(key=lambda c: (c["best_tier"] or 9, -c["crew_share_days"]))
    for i, c in enumerate(clusters, 1):
        c["id"] = f"C{i}"

    conflicts = [pr["id"] for pr in pairs if pr["tier"] == 1 and pr["timeline"] == "concurrent"]

    # ---- funnel + monthly activity strip
    funnel = {
        "desc_projects": len(desc), "ga_projects": len([p for p in projects if p["utility"] != "DESC"]),
        "located_desc": len(a_side), "located_ga": len(b_side), "pairs_checked": n_checked,
        "within_40km": sum(1 for p in pairs if p["tier"]),
        "within_40km_gpc": sum(1 for p in pairs if p["tier"] and p["b_utility"] == "GPC"),
        "concurrent": sum(1 for p in pairs if p["tier"] and p["timeline"] == "concurrent"),
        "tiers": {t[0]: sum(1 for p in pairs if p["tier"] == t[0]) for t in TIERS},
        "tiers_concurrent": {t[0]: sum(1 for p in pairs if p["tier"] == t[0] and p["timeline"] == "concurrent") for t in TIERS},
        "guide_flagged": sum(1 for p in pairs if p["guide_flag"]),
    }
    activity = {}
    for util in ("DESC", "GPC", "GA_OTHER"):
        ps = [p for p in projects if (p["utility"] == util) or (util == "GA_OTHER" and p["utility"] not in ("DESC", "GPC"))]
        activity[util] = _months(ps)

    write_json(PROCESSED / "projects.json", projects)
    write_json(PROCESSED / "pairs.json", pairs)
    write_json(PROCESSED / "clusters.json", clusters)
    write_json(PROCESSED / "analysis_meta.json", {"funnel": funnel, "conflicts": conflicts, "calibration": cal,
                                                  "activity": activity,
                                                  "tiers": [{"id": t[0], "max_km": t[1], "label": t[2], "shares": t[3]} for t in TIERS]})
    print("funnel", funnel)
    print("clusters", len(clusters), "conflicts", len(conflicts))
    for p in pairs[:15]:
        print(p["rank"], p["score"], p["tier"], p["mi"], "mi", p["timeline"], p["overlap_days"], p["region"], byid[p["a"]]["name"][:40], "<->", byid[p["b"]]["name"][:45])


def _months(ps):
    out = defaultdict(int)
    for p in ps:
        s, e = d(p["window"][0]), d(p["window"][1])
        if not (s and e):
            continue
        y, m = s.year, s.month
        while (y, m) <= (e.year, e.month):
            out[f"{y}-{m:02d}"] += 1
            m += 1
            if m == 13:
                y, m = y + 1, 1
    return dict(sorted(out.items()))


def _best_season(ms):
    """Suggest the shared-mobilization window: the year with the most member projects active."""
    years = defaultdict(int)
    for m in ms:
        s, e = d(m["window"][0]), d(m["window"][1])
        if s and e:
            for y in range(s.year, e.year + 1):
                years[y] += 1
    return max(years.items(), key=lambda kv: (kv[1], -kv[0]))[0] if years else None


if __name__ == "__main__":
    main()
