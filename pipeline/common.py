"""Shared paths and parsing helpers for the GridLock pipeline."""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT.parent / "Sperry-Tech-Challenge"
DESC_PDF = KIT / "Project Listings" / "Dominion Energy" / "2024-2028-2million-and-above-project-descriptions.pdf"
GPC_PDF = KIT / "Project Listings" / "Georgia Power" / "2025 IRP Volume 3 PUBLIC DISCLOSURE.pdf"
SAMPLE_XLSX = KIT / "Projects_Overlaps.xlsx"

RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
PROCESSED = ROOT / "data" / "processed"
WEB_DATA = ROOT / "web" / "public" / "data"

for _d in (RAW, INTERIM, PROCESSED):
    _d.mkdir(parents=True, exist_ok=True)

DASHES = re.compile(r"\s*[–—‒\-]\s*")


def write_json(path: Path, obj, indent: int | None = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=indent, ensure_ascii=False, default=str), encoding="utf-8")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()


def parse_date(s: str) -> dt.date | None:
    """Parse the US date formats that appear in both filings (6/1/2026, 12/31/24, 06/01/2025)."""
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", s or "")
    if not m:
        return None
    mo, d, y = (int(g) for g in m.groups())
    if y < 100:
        y += 2000
    try:
        return dt.date(y, mo, d)
    except ValueError:
        return None


def parse_money(s: str) -> int | None:
    digits = re.sub(r"[^\d]", "", s or "")
    return int(digits) if digits else None


KV_RE = re.compile(r"(\d{2,3})(?:\s*[-/]\s*(\d{2,3}(?:\.\d)?))?\s*kv", re.I)


def parse_kv(text: str) -> list[int]:
    """All transmission voltages mentioned (e.g. '230-115kV' -> [230, 115])."""
    out: list[int] = []
    for m in KV_RE.finditer(text.replace("23O", "230")):
        for g in m.groups():
            if g:
                v = int(float(g))
                if v >= 34 and v not in out:
                    out.append(v)
    return out


MILES_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:miles?|mi\b)", re.I)


def parse_miles(text: str) -> float | None:
    vals = [float(m.group(1)) for m in MILES_RE.finditer(text)]
    return round(sum(vals), 2) if vals else None


def classify_work(text: str) -> str:
    """Coarse scope class used for costing and for which overlaps are physically meaningful."""
    t = text.lower()
    if re.search(r"(construct|build|add)\b[^.]{0,60}\b(line|spdc|tap)\b|new \d+\s?kv line|\bfold[- ]in\b", t):
        return "new_line"
    if re.search(r"reconductor|upgrade [^.]{0,40}conductor|restring|upgrade the \d+ acsr", t) and "rebuild" not in t:
        return "reconductor"
    if re.search(r"rebuild|replace (wooden|existing|the)[^.]{0,40}(structure|line)|replacing [^.]{0,40}structures|line .*end of life", t):
        return "rebuild"
    if re.search(r"statcom|capacitor|reactor|smart valve|relay|breaker|switch|jumper|bus tie|autobank|transformer|\bbank", t):
        return "substation_equipment"
    if re.search(r"substation|\bsub\b|switching station", t):
        return "substation"
    return "other"


EQUIPMENT_RE = re.compile(r"statcom|relay|breaker|\bbank\b|capacitor|reactor|switch|transformer|autobank|"
                          r"jumper|smart valve|bus tie|sw house|switch house|modernization", re.I)


def classify(title: str, desc: str) -> str:
    """Title keywords are authoritative (filers name the scope there); fall back to the text."""
    t = title.lower()
    if "rebuild" in t or "rebld" in t:
        return "rebuild"
    if "reconductor" in t:
        return "reconductor"
    if re.search(r"construct|\bnew\b|\btap\b|fold-in|fold in", t) and not EQUIPMENT_RE.search(t):
        return "new_line"
    if EQUIPMENT_RE.search(t):
        return "substation_equipment"
    if re.search(r"\bline\b", t):
        return "new_line" if re.search(r"\b(new|construct|build)\b", desc, re.I) else "rebuild"
    return classify_work(title + " " + desc)


def is_linear(work_type: str, n_endpoints: int) -> bool:
    return n_endpoints >= 2 and work_type in {"new_line", "rebuild", "reconductor", "other"}


def pdf_date(doc) -> str | None:
    """Document date from PDF metadata (D:YYYYMMDD...) as an ISO date."""
    m = re.match(r"D:(\d{4})(\d{2})(\d{2})", (doc.metadata or {}).get("creationDate") or "")
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None
