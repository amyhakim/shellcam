# GridLock Intelligence

> **⭐ Start here.** Hackathon build for **Sperry Tech's GridLock challenge** (ShellHacks 2026, FIU, Sep 25–27).
> Working branch: **`test`** (local only; nothing pushed; no remote yet). `main` is untouched.
> State: pipeline, API and the single-page dashboard are built and committed; `pytest` (10), `tsc`, `eslint`, `vite build` are green.
> **Pending:** the visual screenshot pass for the dashboard redesign was skipped (machine was ~0.9 GB free RAM). First thing next session: `npm run dev` in `web/`, then `node scripts/shots.mjs`, review `../.review/*.png`, and fix what they show.
> Owner: Hieu (CompEng + security engineer). Follow the **hieu-playbook** skill for workflow, security and communication style.

## What this is

A tool that compares two neighboring utilities' **public** future-construction plans, **Dominion Energy South Carolina (DESC)** and **Georgia Power (GPC)**, and flags cross-utility project pairs that overlap in **space** (primary signal) and **time** (secondary). Deliverables required by the challenge: an interactive map of both utilities' projects with overlaps highlighted, a ranked list of coordination opportunities, and (bonus) a rough cost/impact estimate.

Who's judging: Sperry Tech, LLC (Coral Springs FL), **AI Department**. Their intern posting emphasises extraction pipelines, validation and data-quality checks, document parsing, and tracing a number back to its source. So correctness, provenance and visible validation matter as much as visuals.

## Source of truth: the owner's requirements doc

The owner supplied a full requirements/architecture doc ("Gridlock Intelligence Project Requirements and Architecture"). Treat it as the spec. The rules that shape every change:

- **One primary dashboard**, Power BI-like: familiar filters, linked visuals, plain language, drill-down into evidence. Secondary detail goes in **drawers**, never extra pages.
- **At most five primary filters:** Utility · Planned year · Voltage · Distance tier · Show all projects vs opportunities. One **Reset filters**. Methodology settings only on request (they live in the "How this was calculated" drawer).
- **Map:** quiet low-contrast basemap. Stable utility colors **plus** redundant encoding. Solid = official/mapped route, **dashed = inferred / endpoint-derived**. A visible connector between the two measured points of the selected pair. Unrelated projects subdued after selection. No big buffers around every project. Hover and selection synced with the table.
- **Distance:** closest points between geometries; ≤ 40 km (25 mi). Tiers: touching/crossing → operational coordination; < 1.6 km → right-of-way/land/permits; < 8 km → staging/deliveries/logistics; < 40 km → crews/contractors/equipment. Tiers are **subjects for investigation, not proof** of sharing. Endpoint- or center-derived distances **must be labelled estimates**. Distance units are always explicit.
- **Timing:** tell *overlapping construction windows* apart from *near-synchronous completion dates*. Show "insufficient schedule data" rather than inventing dates.
- **Ranking:** deterministic and explainable. Geography 50, timeline 25, compatibility 15, data confidence 10. Crossings get an explicit override flag. **AI never calculates or alters distances, intersections, date math, thresholds, scores, provenance or confidentiality.**
- **Impact estimate:** scenario-based, editable assumptions, ranges, labelled illustrative, never "confirmed savings", and kept secondary.
- **AI brief:** cites source document and page, separates facts from suggestions, states approximations, and requires human review before export.
- **Demo narrative (spec §15):** separate filings → dashboard → filter to opportunities → select **Jasper–Okatie ↔ McIntosh–Purrysburg** → distance → overlap and the 152-day gap → explain the score → source drawer → brief → recommend a joint planning review. Under 3 minutes.

## Owner-locked decisions (don't reopen without asking)

- **UX direction:** metrics-first dashboard modelled on the reference app (`shellcam-production.up.railway.app`), but keeping **our** aesthetic: dark, Geist, tier colors, globe fly-in. The owner found the earlier globe-first, text-heavy version "too wordy / hard to demo". Keep copy short and numeric.
- Build on **public data only**; the Sperry starter kit is the primary source.
- The "Double Circuit" big ideas (MERGE = design the joint corridor; DOUBLE-COUNT = privacy-preserving cross-utility load matching) are **deferred** to a later wave.
- No competitor code or data is copied. Other teams' public repos were only read for feature parity.

## Architecture

```
Sperry-Tech-Challenge/ (starter kit, sibling folder; NOT in this repo)
        │  PDFs + sample xlsx
        ▼
pipeline/ (Python)  extract_desc → extract_gpc → fetch_grid → geocode → analyze → validate → export
        │             (run_all.py runs all; ~15 s with caches)
        ├──▶ data/processed/*.json + Projects_Overlaps_GridLock.xlsx
        └──▶ web/public/data/*.json  (+ web/public/sources/*.pdf copied, gitignored)
                 │
      ┌──────────┴───────────┐
      ▼                      ▼
 web/ (Vite SPA)        api/ (FastAPI)  ── db/ (PostGIS schema + loader, optional)
 reads static JSON      serves the same data via the spec's endpoints
```

The dashboard does **not** call the API yet; both read the pipeline's output. All geometry and schedule math happens once, in `pipeline/analyze.py`.

## Repo map

| Path | Purpose |
|---|---|
| `pipeline/common.py` | Paths, date/kV/miles parsers, `classify()` (title-first work type), `pdf_date()` |
| `pipeline/extract_desc.py` | 44 DESC projects, one per PDF page. The cost table is parsed from **word coordinates**; a malformed cell is repaired only by reconciling to the stated total, and the repair is logged |
| `pipeline/extract_gpc.py` | GA ITS Ten-Year Plan: Table 2 (pp.177–190: zone, sponsor) joined on TEAMS # to the **208 detail pages** (pp.214–425: need date **and start date**, scope, change note). Tables 3/4 give cancelled and completed projects |
| `pipeline/desc_endpoints.csv` | Hand-curated DESC endpoint names and work-type fixes (44 rows) |
| `pipeline/overrides.csv` | Manual coordinates **with evidence** (currently Okatie and Jasper from Sperry's sample) |
| `pipeline/fetch_grid.py` | One Overpass pull of GA+SC substations/plants and ≥115 kV lines → `data/raw/` (cached) |
| `pipeline/geocode.py` | Endpoint → coordinates (see "Location rules") |
| `pipeline/analyze.py` | UTM 17N closest-point distances, tiers, timing, `score_pair()` (50/25/15/10), clusters, cost calibration, per-project confidence and limitations |
| `pipeline/validate.py` | `quality.json`: stage counts, Sperry sample audit, filing anomalies, Table 1 cross-check, unlocated list |
| `pipeline/export.py` | Web bundle, Sperry-schema xlsx, copies source PDFs, attaches Sperry's sample figures to matching pairs |
| `api/main.py`, `api/nlq.py` | FastAPI + Pydantic endpoints; deterministic text→filter parser |
| `db/schema.sql`, `db/load_postgis.py` | Idempotent PostGIS schema (spec §8, plus `original_values`), spec §9 query as the `candidate_pairs` view, loader (`DATABASE_URL`) |
| `web/src/state/store.tsx` | All UI state: 5 `filters`, `advanced` (method/region/timing), selection, hover sync, drawers; `filterPairs` / `filterProjects` |
| `web/src/components/Dashboard.tsx` | Header, filter bar, KPIs, map card (legend, limitations strip), layout |
| `web/src/components/MapView.tsx` | MapLibre globe, layers, measured connector, hover/click, camera bridge |
| `web/src/components/RankedTable.tsx` | Opportunity table (and project table in "All projects" view); the accessible alternative to the map |
| `web/src/components/SelectedCards.tsx` | Selected-pair timeline + explanation (score parts, meaning, actions, status, impact estimate) |
| `web/src/components/SourceDrawer.tsx`, `MethodDrawer.tsx` | Evidence/confidence drawer; methodology + advanced settings + data quality |
| `web/src/components/Brief.tsx` | `#/brief/<pairId>`: printable brief, facts vs suggestions, review gate |
| `web/src/data/savings.ts` | Illustrative impact model + editable assumptions |
| `web/src/data/nlq.ts` | TypeScript port of `api/nlq.py` (keep them in sync) |
| `web/scripts/shots.mjs` | Playwright screenshots of every screen → `../.review/` |

## Commands

```bash
# Python 3.12+ (dev machine: 3.14). From gridlock/
pip install pymupdf shapely pyproj rapidfuzz openpyxl pytest fastapi "uvicorn[standard]" httpx2
python pipeline/run_all.py                 # regenerate everything (needs ../Sperry-Tech-Challenge/)
uvicorn api.main:app --port 8000           # API (optional)

# Web (Node 22+; dev machine: 26)
cd web && npm install && npm run dev       # http://127.0.0.1:5178
```

### Verification gate (all green before calling anything done)

```bash
python -m pytest pipeline api -q           # 10 tests: parsers, cost repair, sample reproduction, API
cd web && npx tsc -b && npx eslint src && npx vite build
node scripts/shots.mjs                     # with the dev server running; review ../.review/*.png at 1440 and 390 wide
sh ~/.claude/skills/impeccable/scripts/impeccable detect --json web/src   # design detector, once per UI change
```

## Facts about the data (hard-won; don't rediscover)

- **DESC PDF** (44 pages = 44 projects): fields are name, Project ID, description, need, status, in-service date, and cost by year (Previous, 2024–2028) + total. Plain text extraction scrambles the cost columns, so use word x-positions under the year headers.
  - Construction start = the first year with budgeted spend. The "Previous" column > 0 means 2023.
  - Anomalies in the filing (surfaced, not hidden):
    - "$19,00,181" (repaired to $19,000,181 by reconciling to the stated total)
    - #3 is $587K short of its stated total
    - #26 has 2029 service and $10M beyond 2028
    - #40 is $1.1M in a "$2M+" list
    - #17's need text looks copy-pasted
    - two projects share the name "Stevens Creek – Hooks": key on Project ID
- **GPC PDF** (2025 IRP Vol 3, 668 pp) is the public-disclosure copy. Every page has a "CEII" banner, but CEII values are REDACTED. **All costs are redacted.**
  - Sponsors are GPC, SAV (= Georgia Power's Savannah region, treated as GPC), GTC, MEAG and DU; co-planners appear behind the "+ Georgia co-planners" filter.
  - Detail pages carry a "Change From Previous Ten Year Plan" note: 109 new, 66 unchanged, 19 delayed, 14 advanced.
  - Table 1 reports 1,142 mi of new right-of-way over 10 years; this is a cross-check only.
- **Sperry sample** (`Projects_Overlaps.xlsx`): 10 projects, 6 overlaps, computed as haversine between endpoint midpoints with a 25 mi cutoff and a day gap. We reproduce 6/6 distances to 0.01 mi and find 6/6 pairs.
  - Its own defects: McIntosh has two coordinates 0.41 mi apart; Hooks, Ft Johnson and Purrysburg are unlocated; there's an Excel-serial date; it only has 3 overlap slots per project.
- **Challenge doc disagreement:** the Word brief and locations guide say 25 mi center-point; the posted spec says 40 km closest-point with 4 tiers. Both are supported. Closest-point is the default; the center-point method sits in the Method drawer.
- **Current numbers:**
  - Projects: 252 (44 DESC + 208 GA ITS), 215 located.
  - Pairs: 7,524 compared; 85 DESC×GPC pairs within 40 km, 30 of them with overlapping construction.
  - Rank #1: Urquhart–Toolebeck ↔ Fenwick St–Sand Bar Ferry (score 93, 2.1 km).
  - Demo pair Jasper–Okatie ↔ McIntosh–Purrysburg: rank #5, score 82, 5.5 km at the closest points (estimate). Our center-point figure is 8.1 km, because we also locate Purrysburg; Sperry's is 9.1 km (OVL_2); completions 152 days apart.

## Method rules

- **Location sources, in priority order:**
  1. `overrides.csv` (evidence required)
  2. OSM name match with operator and state checks (duplicates resolved by the spacing that best fits the filed line length)
  3. Nominatim (≤ 1 request/s, cached; town matches rejected if implausibly far from the other endpoint)
  4. **trilateration** from two filed line lengths (how Hooks is placed)

  Implausible spans are collapsed to the best endpoint and logged. Every endpoint carries a confidence label; unlocated projects are listed, never dropped.
- **Geometry:** OSM named-line route when both endpoint names match a named line (solid); otherwise a straight segment between endpoints (dashed, "estimate").
- **Score** (`analyze.score_pair`):
  - geography = 50 × (1 − km/40), or 50 if touching
  - timeline = 15–25 for overlapping windows (by months), 12 if completions ≤ 180 d apart, 8 if ≤ 365 d, 6 back-to-back, else 0
  - compatibility = same voltage 8 + both lines 4 + same work family 3
  - confidence = 10 × (0.7 × location + 0.3 × schedule); schedule is DESC 0.8 (year-level start) or GA 1.0 (filed start)
- **Impact model:** only counts what the tier and timing allow. Shared right-of-way only counts when at least one project needs **new** ROW, since rebuilds stay on existing ROW. Georgia costs are modelled from DESC's own filed $/mile by work type and voltage, shown as ranges.

## Invariants (never break)

- Public data only; never ingest or display CEII. Redacted values stay redacted, and anything modelled says so.
- Deterministic code owns all measurements, thresholds and scores. Typed requests may only set **visible** filters.
- Never silently change, drop or move data. Repairs, rejections and anomalies go into `quality.json` and are shown in the UI.
- Approximate results are never presented as official routes or confirmed plans.
- The brief can't be printed until a reviewer confirms.
- No secrets in the repo or logs. `DATABASE_URL` and `GRIDLOCK_ADMIN_TOKEN` come from the environment only. Admin ingest stays disabled unless the token is set.
- CSV export neutralises formula injection. React renders all document text as text (no `dangerouslySetInnerHTML`).
- Selective `git add` (name every path). Commit on `test`; the owner promotes to `main`. Never push unless asked.

## Gotchas

- **MapLibre is v6** (v5 had critical XSS GHSA-jrc7-96c5-q579). The worker must be set explicitly: `setWorkerUrl(import "…/maplibre-gl-worker.mjs?url")`, and `optimizeDeps.exclude: ["maplibre-gl"]` in `vite.config.ts`. The library only has named exports; use `import * as maplibregl`.
- MapLibre's CSS sets `position: relative` on the container. Put the map in `h-full w-full` inside an absolutely positioned parent, or it collapses to 300 px.
- **CARTO basemaps now need an API key** (tiles show "API KEY REQUIRED"). Use the keyless Esri layers that are wired in (imagery, dark gray, places). Glyphs come from OpenFreeMap.
- Headless screenshots: use `reducedMotion: "reduce"` contexts, because the continuous globe animation stalls captures under SwiftShader. Hash-only `goto` doesn't re-init state, so `reload()` after it.
- Windows console is cp1252: run Python with `PYTHONIOENCODING=utf-8` when printing names or "≤".
- FastAPI response models: use `Field(validation_alias=…)`, not `alias=`, or responses serialize the internal names.
- `pdftotext` / PyMuPDF plain text reorders GPC detail pages; use `get_text("text", sort=True)`.
- The machine can run low on memory. The harness kills idle background servers; don't restart them unasked.

## Known limitations / next steps

- The screenshot + mobile audit of the redesign is pending (see Start here).
- The dashboard reads static JSON; wiring it to `api/` is optional. The PostGIS loader hasn't been run against a real database.
- The AI brief and request parser are deterministic stand-ins with the spec's safeguards. An LLM (Claude) can sit behind the same contracts; do a cost preflight and get owner approval first.
- ~37 of 252 projects are unlocated (mostly deep in Georgia, far from the border) and are listed in the Method drawer.
- Deferred: "Double Circuit" (MERGE corridor design; DOUBLE-COUNT privacy-preserving load matching).

## Requirements (owner-provided, verbatim)

> Full text of the owner's requirements and architecture doc. The "Source of truth" section above is the short version; this section wins if they ever disagree. Section 7 was empty in the doc as supplied.

### 1. Project summary

Gridlock Intelligence is a single-page analytics application that compares future construction plans from neighboring electric utilities and identifies cross-utility coordination opportunities.

The initial implementation compares:

- Dominion Energy South Carolina
- Georgia Power

The product combines public planning documents, project locations, geospatial analysis, construction schedules, and source evidence. It helps utility planners identify projects that are geographically close, active during similar periods, or both.

The application should be understandable to nontechnical engineers. Its interaction model should resemble a well-designed Power BI dashboard: familiar filters, linked visuals, plain-language explanations, and a simple drill-down into supporting evidence.

### 2. Project objectives

The application must help a user answer four questions quickly:

1. Where are both utilities' planned construction projects?
2. Which cross-utility project pairs satisfy the overlap criteria?
3. Why is one opportunity ranked above another?
4. What coordination actions should the utilities investigate?

The system should turn separate public filings into a traceable coordination workflow rather than merely plotting projects on a map.

### 3. Required challenge functionality

#### 3.1 Source ingestion

The system must ingest publicly available future-construction information for at least two utilities.

Supported source types should include:

- Utility planning PDFs
- Integrated resource plans
- Transmission expansion plans
- Public regulatory filings
- Public project webpages
- Spreadsheet or CSV starter data
- Public GIS or OpenStreetMap data used to locate facilities

The application must not ingest or expose confidential or CEII-restricted information.

#### 3.2 Project normalization

Each utility project should be converted into a common record containing, when available:

- Project identifier
- Utility
- Project name
- State
- Project type
- Voltage
- Status
- Planned construction start
- Planned in-service date
- Named endpoints
- Point, line, or polygon geometry
- Geometry method
- Geometry confidence
- Schedule confidence
- Source document
- Source page
- Source publication date
- Notes and limitations

#### 3.3 Geographic overlap

Geographic proximity is the primary matching signal.

- Compare projects belonging to different utilities.
- Flag project pairs within 40 km or 25 miles.
- Use the closest points between project geometries whenever route geometry is available.
- If only project endpoints or center points are available, clearly label the result as an estimate.
- Store the two points used for the displayed distance measurement.
- Exclude pairs outside the selected distance threshold.

Coordination tiers:

| Distance | Interpretation |
|---|---|
| Touching or crossing | Operational coordination is likely required |
| Under 1.6 km | Potential shared right-of-way, access roads, land, or permitting |
| Under 8 km | Potential shared staging, deliveries, and site logistics |
| Under 40 km | Potential shared crews, contractors, and equipment |

These tiers identify subjects for investigation. They do not prove that resources, land, permits, or outages can be shared.

#### 3.4 Timeline overlap

Timeline proximity is a secondary matching signal.

The system should:

- Compare construction start and completion or in-service dates.
- Detect whether two known construction windows overlap.
- Calculate the difference between planned in-service dates.
- Distinguish exact construction-window overlap from near-synchronous completion dates.
- Display insufficient schedule data rather than inventing dates.

#### 3.5 Ranked opportunities

The application must provide a ranked list of cross-utility opportunities.

The ranking must be explainable and primarily deterministic. A suggested scoring structure is:

| Component | Maximum points |
|---|---|
| Geographic proximity | 50 |
| Timeline alignment | 25 |
| Infrastructure compatibility | 15 |
| Data confidence | 10 |
| Total | 100 |

Physical crossings may receive an explicit priority override. AI may explain the score but must not calculate or silently modify the underlying spatial and schedule measurements.

#### 3.6 Interactive presentation

The required user interface should include:

- Interactive project map
- Utility, year, voltage, distance, and view filters
- Compact summary metrics
- Ranked opportunity table
- Selected-pair timeline
- Selected-opportunity explanation
- Source and confidence drawer
- Visible data limitations

Map interactions must include pan, zoom, hover, selection, and synchronized highlighting between the map and opportunity table.

#### 3.7 Bonus impact estimate

If implemented, cost or impact estimates must be scenario-based and transparent.

- Show editable assumptions.
- Present ranges rather than false precision.
- Label results as illustrative planning estimates.
- Do not claim confirmed savings.
- Keep the calculator secondary to the required map and ranked results.

### 4. User experience requirements

#### 4.1 Primary user groups

- Transmission planners
- Construction and field-operations managers
- Engineering and reliability teams
- Permitting and right-of-way teams
- Regional planning coordinators

#### 4.2 Simplicity requirements

- Use one primary dashboard.
- Do not require navigation between multiple analytics pages.
- Keep all essential analysis visible without training.
- Show no more than five primary filters.
- Use plain-language labels.
- Update all visuals together when a filter changes.
- Provide one clear Reset filters action.
- Show advanced methodology only on request.
- Use side panels or drawers for secondary details.
- Keep AI contextual and optional.

#### 4.3 Recommended dashboard layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Gridlock Intelligence                      Data updated Sep 2026    │
├─────────────────────────────────────────────────────────────────────┤
│ Utility [All]  Year [2024-2033]  Voltage [All]  Distance [40 km]   │
├─────────────────────────────────────────────────────────────────────┤
│ 10 Projects       6 Opportunities       2 Timeline Matches          │
├───────────────────────────────────────────┬─────────────────────────┤
│                                           │ Ranked opportunities    │
│                                           │                         │
│              Interactive map              │ 1 Jasper-Okatie         │
│                                           │   McIntosh-Purrysburg   │
│                                           │   9.1 km | 152 days     │
│                                           │                         │
├───────────────────────────────────────────┴─────────────────────────┤
│ Selected-pair timeline and explanation                             │
└─────────────────────────────────────────────────────────────────────┘
```

#### 4.4 Primary filters

Use no more than these five visible filters:

- Utility
- Planned year
- Voltage
- Distance tier
- Show all projects or coordination opportunities

#### 4.5 Visual requirements

- Use a quiet, low-contrast basemap.
- Give each utility a stable color and redundant line or marker encoding.
- Use solid lines for official routes.
- Use dashed lines for inferred or endpoint-derived routes.
- Use a visible connector between the two measured points of a selected pair.
- Keep unrelated projects subdued after a pair is selected.
- Avoid large buffers around every project.
- Avoid decorative charts, gauges, or repeated metrics.
- Maintain accessible contrast and keyboard-visible focus states.

#### 4.6 Plain-language terminology

Prefer:

- Projects close enough to coordinate
- Planned completion dates are 152 days apart
- Location is approximate
- Potential to share crews and equipment
- View source
- How this was calculated

Avoid exposing internal terminology such as temporal delta, entity-resolution vector, or retrieval-augmented generation in the primary interface.

### 5. Initial demonstration opportunity

The first demo should feature the strongest pair in the supplied workbook.

#### 5.1 Dominion Energy South Carolina

- Project ID: DESC_3
- Project: Jasper-Okatie 230 kV Line No. 2
- Status: In progress
- Planned in-service: December 31, 2025
- Approximate length: 6.5 miles
- Jasper Substation: 32.359120, -81.124600
- Okatie Substation: 32.333758, -81.032495

#### 5.2 Georgia Power

- Project ID: GPC_2
- Project: SAV: McIntosh-Purrysburg 230 kV Reactors
- Start date: January 1, 2024
- Need or in-service date: June 1, 2026
- McIntosh coordinate: 32.352116, -81.175112

#### 5.3 Pair result

- Overlap ID: OVL_2
- Supplied center-point estimate: 5.65 miles or 9.09 km
- Difference between planned in-service dates: 152 days
- Construction activity overlaps
- Both projects involve 230 kV infrastructure
- Primary coordination category: crews and equipment
- Additional investigation: staging, deliveries, contractor mobilization, and outage planning

The current distance must be labeled as a center-point estimate until route geometry is calculated and verified.

### 6. Recommended technology stack

**Frontend**

- React with TypeScript
- MapLibre GL JS or Leaflet
- Recharts or lightweight SVG for the timeline and distance-tier chart
- A small component library or restrained custom design system

**Backend**

- Python
- FastAPI
- Pydantic for input and extraction validation
- Background ingestion task or explicit admin upload workflow

**Data processing**

- PDF text and table extraction
- Structured LLM extraction for inconsistent document layouts
- Shapely or GeoPandas for ingestion-time geometry preparation
- Deterministic validation rules

**Database**

- TigerData or another managed PostgreSQL service
- PostGIS for geometry, spatial indexes, closest-point distance, intersection, and buffer queries
- pgvector for grounded source retrieval if the AI brief is implemented

**AI**

- Structured extraction from public documents
- Facility-name matching suggestions
- Data-quality explanations
- Grounded coordination-brief generation
- Natural-language conversion into safe dashboard filters

### 7. System architecture

(No content in the supplied doc.)

### 8. Data model

#### 8.1 Projects

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE projects (
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
    notes TEXT
);

CREATE INDEX projects_geometry_gix
ON projects USING GIST (geometry);
```

#### 8.2 Opportunities

```sql
CREATE TABLE opportunities (
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
```

#### 8.3 Source evidence

```sql
CREATE TABLE source_chunks (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    source_document TEXT NOT NULL,
    source_page INTEGER,
    content TEXT NOT NULL,
    embedding VECTOR
);
```

### 9. Core spatial query

The system should calculate pairs using full geometry when available:

```sql
SELECT
    a.id AS project_a_id,
    b.id AS project_b_id,
    ST_Distance(a.geometry, b.geometry) AS distance_meters,
    ST_ClosestPoint(a.geometry::geometry, b.geometry::geometry) AS closest_point_a,
    ST_ClosestPoint(b.geometry::geometry, a.geometry::geometry) AS closest_point_b
FROM projects a
JOIN projects b
  ON a.utility <> b.utility
 AND a.id < b.id
 AND ST_DWithin(a.geometry, b.geometry, 40000);
```

The production implementation must confirm appropriate PostGIS geography or projected-geometry handling before relying on closest-point output. Distance units displayed to users must always be explicit.

### 10. AI architecture and safeguards

#### 10.1 Appropriate AI uses

- Extracting structured fields from inconsistent public documents
- Suggesting matches between differently named facilities
- Explaining validation warnings
- Turning natural-language requests into visible dashboard filters
- Generating coordination briefs grounded in selected project records and retrieved source passages

#### 10.2 Deterministic responsibilities

AI must not own:

- Distance calculation
- Intersection detection
- Date arithmetic
- Threshold classification
- Final opportunity score
- Source provenance
- Confidentiality classification

#### 10.3 Grounding rules

- Retrieve only evidence connected to the selected projects.
- Attach source document and page references.
- Separate observed facts from potential actions.
- State when geometry or schedules are approximate.
- Do not fabricate costs, routes, permissions, outages, or resource availability.
- Require human review before exporting or sharing a coordination brief.

### 11. API requirements

Suggested endpoints:

```
GET  /api/projects
GET  /api/projects/{project_id}
GET  /api/opportunities
GET  /api/opportunities/{opportunity_id}
GET  /api/opportunities/{opportunity_id}/evidence
POST /api/opportunities/{opportunity_id}/brief
POST /api/query/filters
POST /api/admin/ingest
GET  /api/data-quality
```

Filter parameters should include utility, year range, voltage, maximum distance, confidence, and opportunities-only mode.

### 12. Nonfunctional requirements

**Performance**

- Initial dashboard should become usable within three seconds on a typical broadband connection.
- Filter changes should update visible results within one second for the hackathon dataset.
- Spatial columns must be indexed.
- Repeated opportunity calculations may be materialized or cached.

**Reliability**

- Validate every ingested project record.
- Preserve original source values separately from normalized values.
- Log ingestion and matching errors.
- Never silently replace a human-confirmed coordinate with an AI suggestion.

**Security and privacy**

- Use public sources only.
- Do not ingest documents marked nonpublic or confidential.
- Store database credentials and model keys in environment variables.
- Restrict ingestion and correction endpoints to administrators.
- Sanitize document text before displaying it in the interface.

**Accessibility**

- Do not rely on color alone.
- Provide keyboard access and visible focus states.
- Use accessible labels for map controls and charts.
- Maintain readable contrast.
- Provide a tabular alternative to map-only information.

**Explainability**

- Every ranked opportunity must show its important scoring factors.
- Every normalized source field should be traceable to a document and page.
- Geometry and schedule confidence must be visible.
- Approximate results must never be presented as official routes or confirmed plans.

### 13. 36-hour implementation scope

**Must ship**

- Load and normalize the supplied project dataset
- Interactive map for both utilities
- Cross-utility distance calculation
- 40 km filtering and distance tiers
- Timeline comparison
- Ranked opportunity table
- Selected-pair detail and timeline
- Source and confidence information
- Responsive single-page dashboard

**High-value additions**

- One working PDF extraction demonstration
- Explainable opportunity score
- Grounded coordination brief for the top opportunity
- Data-quality summary
- One simple scenario-based impact estimate

**Defer**

- User accounts and complex permissions
- Live collaboration
- Automated ingestion from every utility website
- Full workflow or ticket management
- Power-flow modeling
- Predictive construction-cost modeling
- Multi-agent orchestration
- Native mobile application
- Support for many utilities

### 14. Acceptance criteria

The project is ready for demonstration when:

- Both utilities' projects appear on the same interactive map.
- Cross-utility pairs within 40 km are identified.
- The top opportunity is ranked and explained.
- Selecting a table row highlights both projects on the map.
- The timeline shows whether the selected pair has concurrent activity.
- The dashboard can be filtered without technical knowledge.
- The user can see whether geometry is official or approximate.
- Project facts link back to public source evidence.
- The AI brief contains citations and separates facts from suggestions.
- The main demo can be completed in under three minutes.

### 15. Demo narrative

1. Show that the two utilities publish plans separately.
2. Open the dashboard with both utilities already visible.
3. Filter to coordination opportunities.
4. Select Jasper-Okatie and McIntosh-Purrysburg.
5. Show the estimated 9.1 km separation.
6. Show the overlapping activity and 152-day in-service gap.
7. Explain the deterministic ranking.
8. Open the source and confidence drawer.
9. Generate the grounded coordination brief.
10. End with the recommended human action: confirm geometry and schedule a joint planning review.

### 16. Guiding principle

AI handles messy interpretation and explanation. Transparent spatial calculations, schedule logic, provenance, validation, and human review support the decision.

## Worklog

- 2026-09-26: Built pipeline (extract both filings, geocode, overlap engine, validation, Sperry-schema xlsx) and the full web app (globe map, rail, detail, timeline, portfolio, data & method, tour, search, brief, exports, mobile sheet). Tests + typecheck + lint + build green; screenshots reviewed at 1440×900 and 390×844.
- 2026-09-26: Redesigned to the requirements doc: single Power BI-style dashboard (5 filters, compact metrics, linked map + ranked table, selected-pair timeline + score explanation, source & method drawers), spec 50/25/15/10 score, FastAPI API + PostGIS schema/loader, cited brief with review gate, typed-request filters. Build/typecheck/lint/tests green; screenshots pending (machine low on memory).
- 2026-09-26: Rewrote CLAUDE.md as the full project guide (start-here state, requirements rules, data facts, method, invariants, gotchas).
- 2026-09-26: Added the owner's full requirements doc to CLAUDE.md (verbatim section above the Worklog).
