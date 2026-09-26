-- GridLock PostGIS schema (TigerData or any managed PostgreSQL with PostGIS).
-- Idempotent: safe to re-run.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    utility TEXT NOT NULL,
    state TEXT,
    project_name TEXT NOT NULL,
    project_type TEXT,
    voltage_kv INTEGER,
    status TEXT,
    planned_start DATE,
    in_service_date DATE,
    geometry GEOGRAPHY,
    geometry_method TEXT,
    geometry_confidence NUMERIC,
    schedule_confidence NUMERIC,
    source_document TEXT,
    source_page INTEGER,
    source_publication_date DATE,
    notes TEXT,
    original_values JSONB            -- source values preserved exactly as filed
);
CREATE INDEX IF NOT EXISTS projects_geometry_gix ON projects USING GIST (geometry);

CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    project_a_id TEXT NOT NULL REFERENCES projects(id),
    project_b_id TEXT NOT NULL REFERENCES projects(id),
    distance_meters NUMERIC NOT NULL,
    closest_point_a GEOGRAPHY,
    closest_point_b GEOGRAPHY,
    timeline_gap_days INTEGER,
    schedules_overlap BOOLEAN,
    coordination_tier TEXT,
    geographic_score NUMERIC,
    timeline_score NUMERIC,
    compatibility_score NUMERIC,
    confidence_score NUMERIC,
    opportunity_score NUMERIC,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_chunks (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    source_document TEXT NOT NULL,
    source_page INTEGER,
    content TEXT NOT NULL,
    embedding VECTOR
);

-- Core spatial query (spec section 9): recompute candidate pairs inside PostGIS as a cross-check
-- of the pipeline's UTM 17N closest-point results. Geography distance is in meters.
CREATE OR REPLACE VIEW candidate_pairs AS
SELECT a.id AS project_a_id,
       b.id AS project_b_id,
       ST_Distance(a.geometry, b.geometry) AS distance_meters,
       ST_ClosestPoint(a.geometry::geometry, b.geometry::geometry) AS closest_point_a,
       ST_ClosestPoint(b.geometry::geometry, a.geometry::geometry) AS closest_point_b
FROM projects a
JOIN projects b
  ON a.utility <> b.utility
 AND a.id < b.id
 AND ST_DWithin(a.geometry, b.geometry, 40000);
