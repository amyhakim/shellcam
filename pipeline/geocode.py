"""Locate every project on the map.

Sources, in priority order: manual overrides (with evidence) > OpenStreetMap substations/plants
(name + operator + state checks) > Nominatim place search > trilateration from filed line
lengths. Multi-endpoint projects pick the candidate combination whose spacing best matches the
filed line length, which resolves duplicate names (e.g. the two Georgia Power 'Goshen' subs).
When OSM has a named line joining both endpoints, its real route replaces the straight segment.
"""
from __future__ import annotations

import csv
import itertools
import json
import math
import re
import time
import urllib.parse
import urllib.request

from rapidfuzz import fuzz
from shapely.geometry import Point, shape

from common import INTERIM, RAW, ROOT, read_json, write_json

STATE_NAME = {"SC": "South Carolina", "GA": "Georgia"}
FOREIGN_OPS = re.compile(r"duke|jacksonville|tennessee|tva|florida|alabama|powersouth|chattanooga|"
                         r"fayetteville|tallahassee|epb|lumbee|cleveland", re.I)
UTIL_OPS = {"SC": re.compile(r"dominion|scana|south carolina (electric|gas)|sce&g", re.I),
            "GA": re.compile(r"georgia|meag|savannah|dalton|oglethorpe", re.I)}
CONF_RANK = {"manual": 5, "osm": 4, "sample": 4, "osm_fuzzy": 3, "inferred": 2, "town": 1, "unlocated": 0}

states = {f["properties"]["name"]: shape(f["geometry"]) for f in read_json(RAW / "us_states.json")["features"]}
STATE_GEOM = {"SC": states["South Carolina"].buffer(0.02), "GA": states["Georgia"].buffer(0.02)}


def norm(s: str) -> str:
    s = s.upper().replace("&", " AND ")
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(SUBSTATION|SUB|SWITCHING STATION|SWITCHYARD|TRANSMISSION|DISTRIBUTION|TAP|"
               r"GENERATING PLANT|POWER PLANT|STATION|FACILITY)\b", " ", s)
    s = re.sub(r"\bJCT\b", "JUNCTION", s)
    s = re.sub(r"\bFT\b", "FORT", s)
    s = re.sub(r"\bST\b", "SAINT", s)
    s = re.sub(r"\bPRI\b", "PRIMARY", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def hav_mi(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(h))


def load_gazetteer():
    gaz = []
    for f in read_json(RAW / "osm_substations_flat.json"):
        if not f["name"]:
            continue
        st = next((k for k, g in STATE_GEOM.items() if g.contains(Point(f["lon"], f["lat"]))), None)
        gaz.append({**f, "state": st, "n": norm(f["name"]), "source": "osm"})
    return gaz


def load_overrides():
    out = {}
    path = ROOT / "pipeline" / "overrides.csv"
    for r in csv.DictReader(path.open(encoding="utf-8")):
        out[(norm(r["name"]), r["state"])] = {"lat": float(r["lat"]), "lon": float(r["lon"]),
                                             "source": r["source"], "note": r["note"]}
    return out


def candidates(name: str, state: str, gaz) -> list[dict]:
    q = norm(name)
    if not q:
        return []
    out = []
    for g in gaz:
        if g["state"] != state:
            continue
        sc = fuzz.token_set_ratio(q, g["n"]) if len(q) > 3 else (100 if q == g["n"] else 0)
        # token_set_ratio rewards subsets; require the query's tokens to be well covered
        if sc < 86 or fuzz.partial_ratio(q, g["n"]) < 85:
            continue
        # every distinctive query token must appear in the candidate ("NORTH DUBLIN" != "NORTH")
        missing = {t for t in set(q.split()) - set(g["n"].split())
                   if not t.isdigit() and t not in {"PRIMARY", "PRI", "NEW", "DAM", "PLANT", "CC", "USA"}}
        if missing and fuzz.ratio(q, g["n"]) < 90:
            continue
        exact = q == g["n"]
        op = g.get("operator") or ""
        sc += 8 if exact else 0
        sc += 4 if UTIL_OPS[state].search(op) else 0
        sc -= 25 if FOREIGN_OPS.search(op) else 0
        sc += 2 if g["kind"] == "substation" else 0
        out.append({"lat": g["lat"], "lon": g["lon"], "score": sc, "matched": g["name"], "osm": g["osm"],
                    "conf": "osm" if exact or sc >= 100 else "osm_fuzzy", "operator": op})
    out.sort(key=lambda c: -c["score"])
    best = out[0]["score"] if out else 0
    return [c for c in out if c["score"] >= best - 6][:6]


NOMI_CACHE = RAW / "nominatim_cache.json"
_nomi = json.loads(NOMI_CACHE.read_text(encoding="utf-8")) if NOMI_CACHE.exists() else {}


def nominatim(name: str, state: str):
    key = f"{name}|{state}"
    if key not in _nomi:
        qs = urllib.parse.urlencode({"q": f"{name}, {STATE_NAME[state]}", "format": "json", "limit": 3,
                                     "countrycodes": "us"})
        req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{qs}",
                                     headers={"User-Agent": "gridlock-shellhacks/1.0 (hackathon prototype)"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                _nomi[key] = json.loads(r.read())
        except Exception as e:  # network hiccup: remember nothing, try next run
            print("nominatim error", name, e)
            return None
        time.sleep(1.1)  # Nominatim usage policy: <= 1 request / second
        NOMI_CACHE.write_text(json.dumps(_nomi), encoding="utf-8")
    for r in _nomi.get(key) or []:
        lat, lon = float(r["lat"]), float(r["lon"])
        if STATE_GEOM[state].contains(Point(lon, lat)):
            return {"lat": lat, "lon": lon, "score": 60, "matched": r.get("display_name", "")[:80],
                    "osm": f"{r.get('osm_type')}/{r.get('osm_id')}", "conf": "town", "operator": ""}
    return None


def choose(cands_per_ep: list[list[dict]], miles: float | None):
    located = [c for c in cands_per_ep if c]
    if not located:
        return [None] * len(cands_per_ep)
    best, best_val = None, -1e9
    for combo in itertools.product(*[c if c else [None] for c in cands_per_ep]):
        pts = [c for c in combo if c]
        val = sum(c["score"] for c in pts)
        for a, b in zip(pts, pts[1:]):
            d = hav_mi((a["lat"], a["lon"]), (b["lat"], b["lon"]))
            if miles:
                val -= max(0.0, d - miles * 1.1) * 3 + max(0.0, miles * 0.35 - d) * 1
            else:
                val -= max(0.0, d - 40) * 1.5
        if val > best_val:
            best, best_val = combo, val
    return list(best)


def trilaterate(p1, r1, p2, r2, state):
    """Intersect two circles (mi) around lat/lon points; return the solution inside `state`."""
    lat0 = math.radians((p1[0] + p2[0]) / 2)
    kx, ky = 69.17 * math.cos(lat0), 69.05
    x2, y2 = (p2[1] - p1[1]) * kx, (p2[0] - p1[0]) * ky
    d = math.hypot(x2, y2)
    if d == 0 or d > r1 + r2:
        r1, r2 = r1 * d / (r1 + r2) * 1.001, r2 * d / (r1 + r2) * 1.001  # scale to touch
    a = (r1 ** 2 - r2 ** 2 + d ** 2) / (2 * d)
    h = math.sqrt(max(r1 ** 2 - a ** 2, 0))
    xm, ym = a * x2 / d, a * y2 / d
    sols = [(xm + h * y2 / d, ym - h * x2 / d), (xm - h * y2 / d, ym + h * x2 / d)]
    for x, y in sols:
        lat, lon = p1[0] + y / ky, p1[1] + x / kx
        if STATE_GEOM[state].contains(Point(lon, lat)):
            return lat, lon
    x, y = sols[0]
    return p1[0] + y / ky, p1[1] + x / kx


def endpoint_names(p) -> list[str]:
    if p["utility"] == "DESC":
        return p["endpoints_curated"]
    eps = []
    for e in p["endpoints_parsed"]:
        for part in re.split(r"\s+AND\s+", e):
            part = re.sub(r"\b\d{2,3}\s*K?V?\b.*$", "", part).strip()
            if part and part not in {"CC", "NEW"} and len(part) > 2:
                eps.append(part)
    return eps[:3]


def route_from_osm_lines(names: list[str], lines) -> list[list[list[float]]] | None:
    if len(names) < 2:
        return None
    a, b = norm(names[0]), norm(names[1])
    if not a or not b:
        return None
    segs = []
    for e in lines:
        n = norm(e.get("tags", {}).get("name", "") or "")
        if n and a in n and b in n:
            segs.append([[pt["lon"], pt["lat"]] for pt in e["geometry"]])
    return segs or None


def main():
    gaz = load_gazetteer()
    overrides = load_overrides()
    desc = read_json(INTERIM / "desc_projects.json")
    gpc = read_json(INTERIM / "gpc_projects.json")
    curated = {int(r["seq"]): r for r in csv.DictReader((ROOT / "pipeline" / "desc_endpoints.csv").open(encoding="utf-8"))}
    for p in desc:
        c = curated[p["seq"]]
        p["endpoints_curated"] = c["endpoints"].split("|")
        if c["work_type"]:
            p["work_type"] = c["work_type"]
        if c["note"]:
            p["scope_note"] = c["note"]
    lines = read_json(RAW / "osm_lines.json")["elements"]
    named_lines = [e for e in lines if e.get("tags", {}).get("name")]

    projects = desc + gpc
    for p in projects:
        st = p["state"]
        names = endpoint_names(p)
        cands = []
        for n in names:
            ov = overrides.get((norm(n), st))
            if ov:
                cands.append([{"lat": ov["lat"], "lon": ov["lon"], "score": 200, "matched": ov["note"],
                               "osm": None, "conf": "manual" if ov["source"] == "manual" else ov["source"],
                               "operator": ""}])
                continue
            other = "GA" if st == "SC" else "SC"
            bare = re.sub(r"\s*#?\d+\s*$", "", n).strip()
            c = (candidates(n, st, gaz) or (candidates(bare, st, gaz) if bare != n else [])
                 or [dict(x, cross_border=True) for x in candidates(n, other, gaz)
                     if STATE_GEOM[st].distance(Point(x["lon"], x["lat"])) < 0.25])
            if not c:
                nm = nominatim(n, st) or nominatim(n, other)
                c = [nm] if nm else []
            cands.append(c)
        chosen = choose(cands, p.get("miles"))
        anchors = [c for c in chosen if c and c["conf"] != "town"]
        limit = max((p.get("miles") or 0) * 2.5, 30)
        chosen = [None if (c and c["conf"] == "town" and anchors and
                           min(hav_mi((c["lat"], c["lon"]), (a["lat"], a["lon"])) for a in anchors) > limit)
                  else c for c in chosen]
        p["endpoints"] = [{"name": n, **({**{k: ch[k] for k in ("lat", "lon", "matched", "osm", "conf")}, "cross_border": bool(ch.get("cross_border"))} if ch else
                                         {"lat": None, "lon": None, "matched": None, "osm": None, "conf": "unlocated"})}
                          for n, ch in zip(names, chosen)]

    # trilaterate endpoints that are unlocated everywhere but linked by filed line lengths
    unloc = {(e["name"], p["state"]) for p in projects for e in p["endpoints"] if e["conf"] == "unlocated"}
    for name, st in sorted(unloc):
        links = []
        for p in projects:
            names = [e["name"] for e in p["endpoints"]]
            if name in names and len(names) == 2 and p.get("miles"):
                other = p["endpoints"][1 - names.index(name)]
                if other["lat"] is not None:
                    links.append(((other["lat"], other["lon"]), p["miles"], other["name"], p["source_id"]))
        uniq = {l[2]: l for l in sorted(links, key=lambda l: l[1])}
        if len(uniq) >= 2:
            (p1, r1, n1, s1), (p2, r2, n2, s2) = list(uniq.values())[:2]
            lat, lon = trilaterate(p1, r1, p2, r2, st)
            for p in projects:
                for e in p["endpoints"]:
                    if e["name"] == name and e["conf"] == "unlocated" and p["state"] == st:
                        e.update(lat=lat, lon=lon, conf="inferred", osm=None,
                                 matched=f"trilaterated: {r1} mi from {n1} ({s1}) & {r2} mi from {n2} ({s2})")

    for p in projects:
        pts = [(e["lat"], e["lon"]) for e in p["endpoints"] if e["lat"] is not None]
        ranks = [CONF_RANK[e["conf"]] for e in p["endpoints"]] or [0]
        p["located"] = bool(pts)
        p["confidence"] = min((k for k, v in CONF_RANK.items() if v == min(ranks)), key=lambda k: CONF_RANK[k]) if pts else "unlocated"
        if pts:
            p["center"] = [round((pts[0][0] + pts[1][0]) / 2, 6), round((pts[0][1] + pts[1][1]) / 2, 6)] if len(pts) >= 2 else [round(pts[0][0], 6), round(pts[0][1], 6)]
        else:
            p["center"] = None
        # plausibility: endpoints must be about as far apart as the filed line length allows
        if len(pts) >= 2:
            span = max(hav_mi(a, b) for a, b in zip(pts, pts[1:]))
            limit = max((p.get("miles") or 0) * 3, 45)
            if span > limit:
                best = max((e for e in p["endpoints"] if e["lat"] is not None), key=lambda e: CONF_RANK[e["conf"]])
                for e in p["endpoints"]:
                    if e is not best:
                        e.update(lat=None, lon=None, conf="unlocated",
                                 matched=f"rejected: {span:.0f} mi from {best['name']} (filed length {p.get('miles') or 'n/a'} mi)")
                pts = [(best["lat"], best["lon"])]
                ranks = [CONF_RANK[e["conf"]] for e in p["endpoints"]]
                p["confidence"] = best["conf"] if best["conf"] != "unlocated" else "unlocated"
                p["center"] = [round(best["lat"], 6), round(best["lon"], 6)]
        linear = len(pts) >= 2 and p["work_type"] in {"new_line", "rebuild", "reconductor", "other"}
        p["geom_type"] = "line" if linear else ("point" if pts else None)
        p["path"] = [[round(lo, 6), round(la, 6)] for la, lo in pts] if linear else ([[round(pts[0][1], 6), round(pts[0][0], 6)]] if pts else [])
        route = route_from_osm_lines([e["name"] for e in p["endpoints"]], named_lines) if linear else None
        p["route"] = route
        p["geometry_basis"] = "OSM line route" if route else ("straight segment between endpoints" if linear else "point")

    write_json(INTERIM / "projects_geo.json", projects)
    from collections import Counter
    for u in ("DESC", "GPC"):
        ps = [p for p in projects if (p["utility"] == "DESC") == (u == "DESC")]
        print(u, len(ps), "located", sum(p["located"] for p in ps), Counter(p["confidence"] for p in ps),
              "routes", sum(1 for p in ps if p["route"]))
    for p in projects:
        if p["utility"] == "DESC" or p.get("zone") == "219" or re.search("THOMSON|VOGTLE|EVANS|THURMOND|WADLEY|GOSHEN", p["name"]):
            print(p["source_id"], p["confidence"], p["geom_type"], [(e["name"], e["conf"], e["matched"]) for e in p["endpoints"]])


if __name__ == "__main__":
    main()
