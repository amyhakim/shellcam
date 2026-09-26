"""Extract DESC's 44 planned transmission projects from the SCRTP '$2M and above' PDF.

One project per page. Text fields come from the page's line text; the 5-year cost table
is parsed from word coordinates (each value sits under its year header), which survives
the scrambled line order that plain text extraction produces.
"""
from __future__ import annotations

import re

import pymupdf

from common import (DESC_PDF, INTERIM, classify, classify_work, norm_space, parse_date, parse_kv, pdf_date,
                    parse_miles, parse_money, write_json)

COLS = ["previous", "2024", "2025", "2026", "2027", "2028", "total"]
SECTIONS = ["Project ID", "Project Description", "Project Need", "Project Status",
            "Planned In-Service Date", "Estimated Project Cost"]


def _cost_table(page) -> dict:
    words = page.get_text("words")
    prev = next((w for w in words if w[4] == "Previous"), None)
    if prev is None:
        return {}
    hy = prev[1]
    header = {w[4].rstrip("*").lower(): (w[0], w[1]) for w in words
              if abs(w[1] - hy) < 3 and w[4].rstrip("*").lower() in COLS}
    foot = min((w[1] for w in words if w[4].startswith("*Total") and w[1] > hy), default=hy + 80)
    vals = {c: None for c in COLS}
    raw = {c: None for c in COLS}
    for x0, y0, x1, y1, t, *_ in words:
        if hy + 2 < y0 < foot and t.startswith("$"):
            col = min(header, key=lambda k: abs(header[k][0] - x0))
            raw[col] = t
            vals[col] = parse_money(t)
    return {"values": vals, "raw": raw}


def _sections(text: str) -> dict:
    lines = [norm_space(l) for l in text.splitlines()]
    lines = [l for l in lines if l]
    out, cur = {"title": []}, "title"
    for l in lines:
        if re.fullmatch(r"Project \d+ of \d+", l) or l in {
                "Dominion Energy South Carolina", "Planned Transmission Projects $2M and above Total",
                "5 Year Budget"}:
            continue
        hit = next((s for s in SECTIONS if l.startswith(s)), None)
        if hit:
            cur = hit
            out.setdefault(cur, [])
            rest = l[len(hit):].strip()
            if rest and hit != "Estimated Project Cost":
                out[cur].append(rest)
            continue
        out.setdefault(cur, []).append(l)
    return {k: norm_space(" ".join(v)) for k, v in out.items()}


WELL_FORMED = re.compile(r"^\$\d{1,3}(,\d{3})*$")


def repair_costs(vals: dict, raw: dict) -> tuple[dict, list[str]]:
    """Reconcile yearly spend with the stated total.

    A cell whose digit grouping is malformed in the source (e.g. "$19,00,181") is replaced by
    the value implied by the stated total, and the repair is recorded. Any other mismatch is
    reported, never silently fixed.
    """
    notes = []
    years = [c for c in COLS if c != "total"]
    total = vals.get("total")
    parts = [vals.get(c) or 0 for c in years]
    if total is None:
        return vals, ["no stated total"]
    s = sum(parts)
    if s != total:
        bad = [c for c in years if raw.get(c) and not WELL_FORMED.match(raw[c])]
        if len(bad) == 1:
            c = bad[0]
            implied = total - (s - (vals[c] or 0))
            notes.append(f"repaired {c}: source shows '{raw[c]}' -> ${implied:,} (reconciled to stated total)")
            vals[c] = implied
        else:
            notes.append(f"yearly spend sums to ${s:,} but stated total is ${total:,}")
    return vals, notes


def _endpoints(title: str) -> list[str]:
    head = re.split(r":|\(|/|,|&| and ", title)[0]
    head = re.sub(r"\b\d{2,3}(?:\s*[-/]\s*\d{2,3})?\s*kv\b.*$", "", head, flags=re.I)
    head = re.sub(r"\b(Sub|Substation|Transmission Tap|Tap|Loop|Tie)\b.*$", "", head, flags=re.I).strip()
    parts = [p.strip(" -") for p in re.split(r"\s+[–—\-]\s+|\s*[–—]\s*|(?<=[a-z])-(?=[A-Z])", head) if p.strip(" -")]
    return parts[:3]


def extract() -> list[dict]:
    doc = pymupdf.open(DESC_PDF)
    pub = pdf_date(doc)
    rows = []
    for i, page in enumerate(doc, start=1):
        sec = _sections(page.get_text("text"))
        cost = _cost_table(page)
        vals = dict(cost.get("values", {}))
        vals, cost_notes = repair_costs(vals, cost.get("raw", {}))
        title = sec.get("title", "")
        desc = sec.get("Project Description", "")
        isd_text = sec.get("Planned In-Service Date", "")
        in_service = parse_date(isd_text)
        spend_years = [int(c) for c in ("2024", "2025", "2026", "2027", "2028") if (vals.get(c) or 0) > 0]
        started_before = (vals.get("previous") or 0) > 0
        start_year = 2023 if started_before else (min(spend_years) if spend_years else (in_service.year if in_service else None))
        rows.append({
            "source_id": sec.get("Project ID", "").replace(" ", " "),
            "seq": i,
            "utility": "DESC",
            "sponsor": "DESC",
            "state": "SC",
            "name": title,
            "description": desc,
            "need": sec.get("Project Need", ""),
            "status": sec.get("Project Status", ""),
            "in_service_raw": isd_text,
            "in_service": in_service.isoformat() if in_service else None,
            "build_start": f"{start_year}-01-01" if start_year else None,
            "build_start_basis": "spend profile (Previous column > 0 => before 2024)" if started_before else "first year with budgeted spend",
            "spend": {k: vals.get(k) for k in COLS},
            "spend_raw": cost.get("raw", {}),
            "cost_total": vals.get("total"),
            "cost_basis": "reported",
            "kv": parse_kv(title + " " + desc),
            "miles": parse_miles(title + " " + desc),
            "work_type": classify(title, desc),
            "endpoints_parsed": _endpoints(title),
            "change_note": None,
            "notes": cost_notes,
            "source_doc": "DESC",
            "source_page": i,
            "source_publication_date": pub,
            "source_text": norm_space(page.get_text("text"))[:1400],
        })
    return rows


if __name__ == "__main__":
    rows = extract()
    write_json(INTERIM / "desc_projects.json", rows)
    print(f"DESC: {len(rows)} projects")
    for r in rows:
        print(f"{r['seq']:>2} {r['source_id']:<16} {r['in_service'] or '??':<10} start={r['build_start']} "
              f"${(r['cost_total'] or 0):>11,} kv={r['kv']} mi={r['miles']} {r['work_type']:<20} {r['endpoints_parsed']} {r['notes'] or ''}")
