# GridLock

https://shellcam-production.up.railway.app/

**Where Dominion Energy South Carolina and Georgia Power are building near each other, when, and what coordinating could save.**
Built for Sperry Tech's GridLock challenge at ShellHacks 2026.

GridLock reads both utilities' public filings, puts every planned project on one map, and ranks the places where their work overlaps in space (closest points within 25 miles, in four tiers) and in time (real build windows, not just in-service dates). Each opportunity opens into a plain-language summary, both projects side by side with links to the filing page, a build-window chart, an editable savings estimate, a coordination status, and a printable brief.

## What's in it (maps to the requirements doc)

One dashboard, Power BI-style: five filters, compact metrics, a map linked to a ranked table, and drill-down drawers.

- **Filters (5):** Utility · Planned completion year · Voltage · Distance (40 km / 8 km / 1.6 km / touching) · Show opportunities or all projects. One *Reset filters*. Methodology settings (closest vs center points, region, timing) live in *How this was calculated*.
- **Metrics:** projects · projects close enough to coordinate · timeline matches (overlapping builds + completions within 180 days) · closest pair.
- **Map:** globe fly-in to the GA/SC border, a dusk basemap with blue water, green terrain and muted warm roads (satellite optional). Stable utility colors plus circle (Dominion) and square (Georgia) markers; other utilities use neutral diamonds. Solid = mapped route, dashed = approximate (drawn between named endpoints). The selected pair shows a measured connector between its two closest points; unrelated projects fade. Hover and selection are synced between map and table.
- **Ranked table:** 100-point deterministic score (geography 50, timeline 25, compatibility 15, data confidence 10), priority, crossing override, "estimate" labels. Also serves as the accessible alternative to the map; switches to a project table in *All projects*.
- **Selected pair:** timeline (overlapping construction vs close completion dates; "insufficient schedule data" when missing), score breakdown, plain-language meaning, actions to investigate, status, optional illustrative impact estimate with editable assumptions.
- **Source & confidence drawer:** normalized record per project, original values as filed, page excerpt, geometry/schedule confidence, limitations, and the two measured points.
- **Coordination brief:** cited facts separated from suggestions; print is locked until a reviewer confirms.
- **Typed requests (Ctrl K):** "230 kV in Savannah within 8 km built at the same time" becomes visible filters; nothing else.
- **Demo:** the requirements' narrative in 7 steps, featuring Jasper–Okatie ↔ McIntosh–Purrysburg.

## API and database

- `api/` — FastAPI + Pydantic: `GET /api/projects`, `/api/projects/{id}`, `/api/opportunities` (utility, year range, voltage, max_km, min_confidence, opportunities_only), `/api/opportunities/{id}`, `/api/opportunities/{id}/evidence`, `POST /api/opportunities/{id}/brief`, `POST /api/query/filters`, `POST /api/admin/ingest` (disabled unless `GRIDLOCK_ADMIN_TOKEN` is set; Bearer auth), `GET /api/data-quality`. Run: `uvicorn api.main:app --port 8000`.
- `db/schema.sql` — PostGIS schema (projects, opportunities, source_chunks, spec spatial query as a view); `db/load_postgis.py` loads everything into TigerData / any PostGIS when `DATABASE_URL` is set.

## Run it

```bash
# 1. data (Python 3.12+): reads ../Sperry-Tech-Challenge/, writes web/public/data
pip install pymupdf shapely pyproj rapidfuzz openpyxl pytest fastapi uvicorn httpx2
python pipeline/run_all.py          # ~15 s with caches; first run downloads OSM data
python -m pytest pipeline api -q

# 2. app (Node 22+)
cd web
npm install
npm run dev                          # http://127.0.0.1:5178
npm run build                        # production build in web/dist
node scripts/shots.mjs               # screenshots of every screen into ../.review/
```

The starter kit must sit next to this folder as `../Sperry-Tech-Challenge/` (its PDFs are copied into `web/public/sources/` for the "Filing, page N" links).

## How the numbers are made

| Step | What happens |
|---|---|
| Extract | DESC: 44 one-page records incl. yearly spend (malformed cells repaired only by reconciling to the stated total, and logged). Georgia: Table 2 (zone, sponsor) joined to the 208 detail pages (need + start date, scope, change note). |
| Locate | Endpoint names matched to OpenStreetMap substations/plants with operator and state checks; duplicate names resolved by the spacing that best fits the filed line length; Sperry's sample coordinates; Nominatim for places; trilateration from two filed line lengths (Hooks). Every endpoint carries a confidence label; implausible matches are rejected, not drawn. |
| Compare | Closest-point distance in UTM 17N (EPSG:32617), tiers per the spec; center-point haversine per the guide; build-window overlap in days; score = proximity + shared months + voltage/geometry bonuses, weighted by location confidence. |
| Value | Illustrative planning estimate with editable assumptions (mobilization share, laydown yard, logistics, right-of-way acres × $/acre only when new right-of-way is needed, crossing coordination). Georgia costs are redacted in the public IRP, so they are modelled from DESC's own filed $/mile by work type and voltage. |
| Validate | Counts per stage, Sperry sample audit, filing anomalies, Table 1 mileage cross-check, unlocated list. |

## Data and credits

- Dominion Energy South Carolina, *Planned Transmission Projects $2M and above (2024–2028)*, SCRTP.
- Georgia Power, *2025 IRP Technical Appendix Volume 3* (public disclosure), Georgia PSC Docket 56002.
- Substations, plants, existing lines: © OpenStreetMap contributors (ODbL). Place search: Nominatim.
- Vector geography and place labels: OpenFreeMap / OpenMapTiles / OpenStreetMap. Satellite imagery: Esri, Maxar, Earthstar Geographics. Glyphs: OpenFreeMap.

Public data only. Nothing marked CEII is used; redacted values stay redacted.

## Railway deployment

Railway deploys this repository as one service. The root build script compiles
Hyieu's Playground from `web/` into `web/dist`, and the root Express server
serves that frontend together with the Tiger Data/PostGIS API.

- Branch: `main`
- Root directory: `/`
- Build command: `npm run build`
- Start command: `npm start`
- Healthcheck path: `/api/health`
- Required variable: `DATABASE_URL`
