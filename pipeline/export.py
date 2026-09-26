"""Write the web app's data bundle and a Projects_Overlaps.xlsx in Sperry's exact schema."""
from __future__ import annotations

import datetime as dt
import shutil

import openpyxl
from openpyxl.styles import Font, PatternFill

from common import DESC_PDF, GPC_PDF, PROCESSED, ROOT, WEB_DATA, read_json, write_json

UTIL_NAME = {"DESC": "Dominion Energy South Carolina", "GPC": "Georgia Power", "GTC": "Georgia Transmission Corp.",
             "MEAG": "MEAG Power", "DU": "Dalton Utilities"}


def web_project(p):
    return {k: p.get(k) for k in (
        "id", "utility", "sponsor", "state", "source_id", "name", "description", "need", "status", "zone", "kv",
        "miles", "length_mi", "work_type", "window", "in_service", "cost_total", "cost_est", "confidence",
        "center", "path", "route", "geom_type", "geometry_basis", "region", "change_note", "source_doc",
        "source_page", "notes", "scope_note", "spend", "located", "geometry_confidence", "schedule_confidence",
        "geometry_method", "voltage_kv", "limitations", "source_text", "source_publication_date", "in_service_raw",
        "build_start_basis", "spend_raw", "cost_basis", "change_irp", "table_page")} | {
        "endpoints": [{k: e.get(k) for k in ("name", "lat", "lon", "conf", "matched", "cross_border")} for e in p["endpoints"]]}


def sperry_xlsx(projects, pairs, path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "projects"
    cols = ["project_id", "utility", "state", "project_name", "name_a", "lat_a", "lon_a", "name_b", "lat_b", "lon_b",
            "lat_center", "lon_center", "in_service_date", "overlap_count", "overlap_1", "overlap_2", "overlap_3",
            # appended (not in the starter template)
            "build_start", "kv", "work_type", "location_confidence", "source_page"]
    ws.append(cols)
    near = {}
    for x in sorted((x for x in pairs if x["tier"]), key=lambda x: x["km"]):
        near.setdefault(x["a"], []).append(x["b"])
        near.setdefault(x["b"], []).append(x["a"])
    for p in projects:
        e = p["endpoints"] + [{}] * 2
        isd = dt.date.fromisoformat(p["in_service"]) if p.get("in_service") else None
        n = near.get(p["id"], [])
        ws.append([p["id"], UTIL_NAME.get(p["utility"], p["utility"]), p["state"], p["name"],
                   e[0].get("name"), e[0].get("lat"), e[0].get("lon"), e[1].get("name"), e[1].get("lat"), e[1].get("lon"),
                   (p["center"] or [None, None])[0], (p["center"] or [None, None])[1], isd, len(n),
                   *(n + [None] * 3)[:3], p["window"][0], "/".join(map(str, p["kv"])), p["work_type"], p["confidence"],
                   p["source_page"]])
    for row in ws.iter_rows(min_row=2, min_col=13, max_col=13):
        for c in row:
            c.number_format = "yyyy-mm-dd"
    ws2 = wb.create_sheet("overlaps")
    ws2.append(["overlap_id", "distance_mi", "time_gap (day)", "utility_a", "project_id_a", "project_name_a",
                "utility_b", "project_id_b", "project_name_b",
                "closest_point_mi", "tier", "build_overlap_days", "timeline", "score", "rank"])
    byid = {p["id"]: p for p in projects}
    for i, x in enumerate([x for x in pairs if x["guide_flag"] or x["tier"]], 1):
        a, b = byid[x["a"]], byid[x["b"]]
        ws2.append([f"OVL_{i}", x["center_mi"], x["in_service_gap_days"], UTIL_NAME["DESC"], a["id"], a["name"],
                    UTIL_NAME.get(b["utility"], b["utility"]), b["id"], b["name"],
                    x["mi"], x["tier"], x["overlap_days"], x["timeline"], x["score"], x["rank"]])
    for s in (ws, ws2):
        for c in s[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="1F2937")
        s.freeze_panes = "A2"
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def main():
    projects = read_json(PROCESSED / "projects.json")
    pairs = read_json(PROCESSED / "pairs.json")
    clusters = read_json(PROCESSED / "clusters.json")
    meta = read_json(PROCESSED / "analysis_meta.json")
    quality = read_json(PROCESSED / "quality.json")
    keep_pairs = [x for x in pairs if x["tier"] or x["guide_flag"]]
    sample = {f["pair_id"]: f for f in quality["sample_audit"]["found"] if f.get("pair_id")}
    for x in keep_pairs:  # Sperry's own supplied figures, shown next to ours for the same pair
        if x["id"] in sample:
            f = sample[x["id"]]
            x["sample"] = {"overlap_id": f["overlap_id"], "center_mi": f["their_center_mi"], "gap_days": f["their_gap_days"]}
    write_json(WEB_DATA / "projects.json", [web_project(p) for p in projects], indent=None)
    write_json(WEB_DATA / "pairs.json", keep_pairs, indent=None)
    write_json(WEB_DATA / "clusters.json", clusters, indent=None)
    write_json(WEB_DATA / "meta.json", {**meta, "generated": dt.datetime.now().isoformat(timespec="seconds"),
                                        "sources": [
                                            {"id": "DESC", "title": "DESC Planned Transmission Projects $2M and above (2024-2028)",
                                             "publisher": "SCRTP", "file": "sources/desc.pdf"},
                                            {"id": "GPC", "title": "Georgia Power 2025 IRP Technical Appendix Vol. 3 (Public Disclosure)",
                                             "publisher": "Georgia PSC Docket 56002", "file": "sources/gpc.pdf"}]}, indent=None)
    write_json(WEB_DATA / "quality.json", quality, indent=None)
    # the existing grid (named + >=115 kV) as a light backdrop layer
    raw = read_json(ROOT / "data" / "raw" / "osm_lines.json")["elements"]
    grid = []
    for e in raw:
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        v = e["tags"].get("voltage", "")
        kv = max((int(x) // 1000 for x in v.split(";") if x.isdigit()), default=0)
        grid.append({"kv": kv, "p": [[round(pt["lon"], 4), round(pt["lat"], 4)] for pt in g[::2] + [g[-1]]]})
    write_json(WEB_DATA / "grid.json", grid, indent=None)
    states = read_json(ROOT / "data" / "raw" / "us_states.json")
    write_json(WEB_DATA / "states.json", {"type": "FeatureCollection", "features": [
        f for f in states["features"] if f["properties"]["name"] in ("Georgia", "South Carolina")]}, indent=None)
    (WEB_DATA.parent / "sources").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(DESC_PDF, WEB_DATA.parent / "sources" / "desc.pdf")
    shutil.copyfile(GPC_PDF, WEB_DATA.parent / "sources" / "gpc.pdf")
    sperry_xlsx(projects, pairs, WEB_DATA.parent / "downloads" / "Projects_Overlaps_GridLock.xlsx")
    sperry_xlsx(projects, pairs, ROOT / "data" / "processed" / "Projects_Overlaps_GridLock.xlsx")
    print(f"web bundle: {len(projects)} projects, {len(keep_pairs)} pairs, {len(clusters)} clusters, {len(grid)} grid lines")


if __name__ == "__main__":
    main()
