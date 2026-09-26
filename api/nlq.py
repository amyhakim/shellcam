"""Deterministic plain-language → dashboard filter parser.

The result is only ever a set of visible filter values the user can see and undo; it never
changes a measurement. An LLM could replace this parser behind the same contract.
"""
from __future__ import annotations

import re


def parse_request(text: str) -> dict:
    t = text.lower()
    out: dict = {}
    notes = []
    m = re.search(r"(?:within|under|less than|<)\s*(\d+(?:\.\d+)?)\s*(km|kilomet\w*|mi|miles?)", t)
    if m:
        v = float(m.group(1)) * (1.609 if m.group(2).startswith("mi") else 1)
        out["range_km"] = next(r for r in (0.05, 1.6, 8, 40) if v <= r * 1.02) if v <= 40.8 else 40  # "5 miles" means the 8 km tier
        notes.append(f"distance ≤ {out['range_km']} km")
    if re.search(r"touch|cross", t):
        out["range_km"] = 0.05
        notes.append("touching or crossing")
    kv = re.search(r"\b(46|69|115|161|230|500)\s*-?\s*kv\b", t)
    if kv:
        out["voltage"] = int(kv.group(1))
        notes.append(f"{kv.group(1)} kV")
    yr = re.search(r"\b(20[2-3]\d)\b", t)
    if yr:
        out["year"] = int(yr.group(1))
        notes.append(f"completing in {yr.group(1)}")
    if re.search(r"dominion|desc|south carolina", t):
        out["utility"] = "DESC"
    elif re.search(r"georgia power|gpc", t):
        out["utility"] = "GPC"
    for r in ("savannah", "augusta"):
        if r in t:
            out["region"] = r.title()
            notes.append(r.title())
    if re.search(r"same time|concurrent|overlap(ping)? (build|construction)|at once", t):
        out["timing"] = "concurrent"
        notes.append("built at the same time")
    if re.search(r"all projects|every project", t):
        out["view"] = "projects"
    return {"filters": out, "explanation": ", ".join(notes) or "no filters recognized"}
