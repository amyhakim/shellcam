"""Load the pipeline's normalized output into PostGIS (TigerData or any PostgreSQL + PostGIS).

    set DATABASE_URL=postgresql://user:pass@host:port/db   (never commit this value)
    python db/load_postgis.py

Requires: pip install "psycopg[binary]"
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "processed"


def wkt(p):
    if p.get("route"):
        return "MULTILINESTRING(" + ",".join("(" + ",".join(f"{x} {y}" for x, y in seg) + ")" for seg in p["route"]) + ")"
    if p.get("geom_type") == "line" and len(p["path"]) >= 2:
        return "LINESTRING(" + ",".join(f"{x} {y}" for x, y in p["path"]) + ")"
    if p.get("path"):
        x, y = p["path"][0]
        return f"POINT({x} {y})"
    return None


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set")
    import psycopg  # imported lazily so the rest of the project doesn't need it

    projects = json.loads((DATA / "projects.json").read_text(encoding="utf-8"))
    pairs = [x for x in json.loads((DATA / "pairs.json").read_text(encoding="utf-8")) if x["tier"]]
    with psycopg.connect(url) as con, con.cursor() as cur:
        cur.execute((ROOT / "db" / "schema.sql").read_text(encoding="utf-8"))
        for p in projects:
            g = wkt(p)
            cur.execute(
                """INSERT INTO projects (id, utility, state, project_name, project_type, voltage_kv, status, planned_start,
                   in_service_date, geometry, geometry_method, geometry_confidence, schedule_confidence, source_document,
                   source_page, source_publication_date, notes, original_values)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, CASE WHEN %s IS NULL THEN NULL ELSE ST_GeogFromText(%s) END,
                           %s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (id) DO UPDATE SET geometry = EXCLUDED.geometry, in_service_date = EXCLUDED.in_service_date""",
                (p["id"], p["utility"], p["state"], p["name"], p["work_type"], p.get("voltage_kv"), p["status"],
                 p["window"][0], p["in_service"], g, g, p["geometry_method"], p["geometry_confidence"],
                 p["schedule_confidence"], p["source_doc"], p["source_page"], p.get("source_publication_date"),
                 "; ".join(p.get("limitations", [])),
                 json.dumps({"in_service_raw": p.get("in_service_raw"), "spend_raw": p.get("spend_raw"),
                             "endpoints": p["endpoints"]})))
            cur.execute("INSERT INTO source_chunks (project_id, source_document, source_page, content) VALUES (%s,%s,%s,%s)",
                        (p["id"], p["source_doc"], p["source_page"], p.get("source_text", "")))
        for x in pairs:
            parts = {s["key"]: s["points"] for s in x["score_parts"]}
            cur.execute(
                """INSERT INTO opportunities (id, project_a_id, project_b_id, distance_meters, closest_point_a, closest_point_b,
                   timeline_gap_days, schedules_overlap, coordination_tier, geographic_score, timeline_score,
                   compatibility_score, confidence_score, opportunity_score)
                   VALUES (%s,%s,%s,%s, ST_GeogFromText(%s), ST_GeogFromText(%s), %s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (id) DO NOTHING""",
                (x["id"], x["a"], x["b"], x["km"] * 1000, f"POINT({x['connector'][0][0]} {x['connector'][0][1]})",
                 f"POINT({x['connector'][1][0]} {x['connector'][1][1]})", x["in_service_gap_days"], x["overlap_days"] > 0,
                 str(x["tier"]), parts["geography"], parts["timeline"], parts["compatibility"], parts["confidence"], x["score"]))
        cur.execute("SELECT count(*) FROM candidate_pairs")
        print(f"loaded {len(projects)} projects, {len(pairs)} opportunities; PostGIS finds {cur.fetchone()[0]} pairs within 40 km")


if __name__ == "__main__":
    main()
