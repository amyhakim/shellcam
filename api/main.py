"""GridLock API (FastAPI + Pydantic).

Serves the normalized projects, opportunities, evidence and data-quality report produced by
../pipeline. Reads the pipeline's JSON by default; see ../db/ for the PostGIS schema and loader.

    uvicorn api.main:app --reload --port 8000      (from the gridlock/ folder)

All spatial and schedule numbers are computed deterministically by the pipeline; this API never
recalculates or lets a model alter them. Public data only.
"""
from __future__ import annotations

import hmac
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .nlq import parse_request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "processed"


# ------------------------------------------------------------------ models (spec section 3.2 / 8)
class Endpoint(BaseModel):
    name: str
    lat: float | None
    lon: float | None
    conf: str
    matched: str | None = None


class Project(BaseModel):
    id: str
    utility: str
    sponsor: str
    state: str
    project_name: str = Field(validation_alias="name")
    project_type: str = Field(validation_alias="work_type")
    voltage_kv: int | None
    status: str | None
    planned_start: date | None = Field(validation_alias="build_start")
    in_service_date: date | None = Field(validation_alias="in_service")
    endpoints: list[Endpoint]
    geometry_method: str
    geometry_confidence: float
    schedule_confidence: float
    source_document: str = Field(validation_alias="source_doc")
    source_page: int
    source_publication_date: date | None
    limitations: list[str]
    model_config = {"populate_by_name": True}


class ScorePart(BaseModel):
    key: str
    label: str
    points: float
    max: int
    why: str


class Opportunity(BaseModel):
    id: str
    project_a_id: str = Field(validation_alias="a")
    project_b_id: str = Field(validation_alias="b")
    distance_km: float = Field(validation_alias="km")
    distance_mi: float = Field(validation_alias="mi")
    measurement: Literal["route", "estimate"]
    closest_point_a: list[float]
    closest_point_b: list[float]
    coordination_tier: int | None = Field(validation_alias="tier")
    timeline_gap_days: int | None = Field(validation_alias="in_service_gap_days")
    schedules_overlap: bool
    overlap_days: int
    completion_sync: bool
    opportunity_score: float = Field(validation_alias="score")
    score_parts: list[ScorePart]
    override: str | None
    rank: int
    model_config = {"populate_by_name": True}


class FilterRequest(BaseModel):
    text: str = Field(max_length=300)


class BriefRequest(BaseModel):
    reviewer: str | None = Field(default=None, max_length=120)


# ------------------------------------------------------------------ data
def _load():
    projects = json.loads((DATA / "projects.json").read_text(encoding="utf-8"))
    pairs = json.loads((DATA / "pairs.json").read_text(encoding="utf-8"))
    quality = json.loads((DATA / "quality.json").read_text(encoding="utf-8"))
    return {p["id"]: p for p in projects}, [x for x in pairs if x["tier"] or x["guide_flag"]], quality


PROJECTS, PAIRS, QUALITY = _load()
DOC_TITLE = {
    "DESC": "SCRTP — DESC Planned Transmission Projects $2M and above (2024–2028)",
    "GPC": "Georgia Power 2025 IRP Technical Appendix Vol. 3 (public disclosure)",
}

app = FastAPI(title="GridLock API", version="1.0.0",
              description="Cross-utility transmission coordination: projects, opportunities, evidence.")
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5178", "http://localhost:5178"],
                   allow_methods=["GET", "POST"], allow_headers=["*"])


def _project(p) -> Project:
    return Project.model_validate(p)


def _opp(x) -> Opportunity:
    return Opportunity.model_validate({**x, "closest_point_a": x["connector"][0], "closest_point_b": x["connector"][1],
                                       "schedules_overlap": x["overlap_days"] > 0})


def _year_ok(p, year_from, year_to):
    y = int(p["in_service"][:4]) if p.get("in_service") else None
    return y is None or ((year_from is None or y >= year_from) and (year_to is None or y <= year_to))


# ------------------------------------------------------------------ endpoints (spec section 11)
@app.get("/api/projects", response_model=list[Project])
def list_projects(utility: str | None = None, year_from: int | None = None, year_to: int | None = None,
                  voltage: int | None = None):
    out = []
    for p in PROJECTS.values():
        if utility and p["utility"] != utility:
            continue
        if voltage and voltage not in p["kv"]:
            continue
        if not _year_ok(p, year_from, year_to):
            continue
        out.append(_project(p))
    return out


@app.get("/api/projects/{project_id}", response_model=Project)
def get_project(project_id: str):
    p = PROJECTS.get(project_id)
    if not p:
        raise HTTPException(404, "project not found")
    return _project(p)


@app.get("/api/opportunities", response_model=list[Opportunity])
def list_opportunities(utility: str | None = Query(None, description="Georgia-side utility, e.g. GPC"),
                       year_from: int | None = None, year_to: int | None = None, voltage: int | None = None,
                       max_km: float = Query(40.0, gt=0, le=40), min_confidence: float = Query(0.0, ge=0, le=1),
                       opportunities_only: bool = True):
    out = []
    for x in PAIRS:
        if opportunities_only and not x["tier"]:
            continue
        if x["km"] > max_km or x["confidence"] < min_confidence:
            continue
        if utility and x["b_utility"] != utility:
            continue
        a, b = PROJECTS[x["a"]], PROJECTS[x["b"]]
        if voltage and voltage not in a["kv"] and voltage not in b["kv"]:
            continue
        if not (_year_ok(a, year_from, year_to) or _year_ok(b, year_from, year_to)):
            continue
        out.append(_opp(x))
    return out


def _pair(opportunity_id: str):
    x = next((x for x in PAIRS if x["id"] == opportunity_id), None)
    if not x:
        raise HTTPException(404, "opportunity not found")
    return x


@app.get("/api/opportunities/{opportunity_id}", response_model=Opportunity)
def get_opportunity(opportunity_id: str):
    return _opp(_pair(opportunity_id))


@app.get("/api/opportunities/{opportunity_id}/evidence")
def evidence(opportunity_id: str):
    x = _pair(opportunity_id)
    return [{"project_id": pid, "source_document": DOC_TITLE[PROJECTS[pid]["source_doc"]],
             "source_page": PROJECTS[pid]["source_page"], "excerpt": PROJECTS[pid].get("source_text", "")}
            for pid in (x["a"], x["b"])]


@app.post("/api/opportunities/{opportunity_id}/brief")
def brief(opportunity_id: str, req: BriefRequest | None = None):
    """Grounded brief: facts carry page citations; suggestions are listed separately; human review required."""
    x = _pair(opportunity_id)
    a, b = PROJECTS[x["a"]], PROJECTS[x["b"]]
    cite = lambda p: f"{DOC_TITLE[p['source_doc']]}, p.{p['source_page']}"
    facts = [
        {"text": f"{a['name']} (ID {a['source_id']}) is planned in service {a['in_service']}.", "source": cite(a)},
        {"text": f"{b['name']} (ID {b['source_id']}) is planned in service {b['in_service']}.", "source": cite(b)},
        {"text": f"Closest-point distance is {x['km']:.1f} km ({x['measurement']}); center-point distance is {x['center_mi'] * 1.609:.1f} km.",
         "source": "GridLock calculation from located endpoints"},
        {"text": f"Planned completion dates are {x['in_service_gap_days']} days apart; construction windows "
                 f"{'overlap for ' + str(x['overlap_days']) + ' days' if x['overlap_days'] else 'do not overlap'}.",
         "source": "GridLock calculation from filed dates"},
    ]
    t = x["tier"] or 9
    suggestions = [s for s, ok in [
        ("Exchange outage plans where the lines meet and agree one outage window.", t == 1),
        ("Compare right-of-way and access-road plans; test a shared corridor or permit filing.", t <= 2),
        ("Scope one shared laydown yard and combine deliveries.", t <= 3),
        ("Compare contractor schedules and test a joint crew or crane booking.", x["overlap_days"] > 0),
        ("Confirm route geometry and schedules, then hold a joint planning review (SERTP).", True),
    ] if ok]
    return {"opportunity_id": x["id"], "facts": facts, "suggestions": suggestions, "requires_human_review": True,
            "reviewed_by": req.reviewer if req else None,
            "limitations": sorted(set(a.get("limitations", []) + b.get("limitations", [])))}


@app.post("/api/query/filters")
def query_filters(req: FilterRequest):
    """Turn a plain-language request into visible, safe dashboard filters (deterministic parser)."""
    return parse_request(req.text)


@app.get("/api/data-quality")
def data_quality():
    return QUALITY


@app.post("/api/admin/ingest")
def ingest(authorization: str | None = Header(default=None)):
    """Re-run the ingestion pipeline. Disabled unless GRIDLOCK_ADMIN_TOKEN is set; requires Bearer auth."""
    token = os.environ.get("GRIDLOCK_ADMIN_TOKEN")
    if not token:
        raise HTTPException(403, "ingestion is disabled on this deployment")
    if not authorization or not hmac.compare_digest(authorization.removeprefix("Bearer "), token):
        raise HTTPException(401, "admin token required")
    r = subprocess.run([sys.executable, "run_all.py"], cwd=ROOT / "pipeline", capture_output=True, text=True, timeout=900)
    global PROJECTS, PAIRS, QUALITY
    PROJECTS, PAIRS, QUALITY = _load()
    return {"ok": r.returncode == 0, "projects": len(PROJECTS), "opportunities": sum(1 for x in PAIRS if x["tier"])}
