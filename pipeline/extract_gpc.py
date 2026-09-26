"""Extract the Georgia ITS Ten-Year Plan projects from Georgia Power's 2025 IRP Vol. 3.

Two sources inside the PDF are joined on the TEAMS project number:
  * Table 2 (pp.177-190): zone, plan year, need date, sponsor (GPC/SAV/GTC/MEAG/DU)
  * Detail pages (pp.214-425): title, need + start date, scope description, plan-change note
Tables 3/4 (cancelled / completed) are extracted for the plan-churn view.
All cost fields in this public copy are REDACTED; nothing redacted is used.
"""
from __future__ import annotations

import re

import pymupdf

from common import (GPC_PDF, INTERIM, classify, classify_work, norm_space, parse_date, parse_kv, pdf_date,
                    parse_miles, write_json)

TABLE2_PAGES = range(176, 190)       # 0-based, pp.177-190
CANCELLED_PAGE, COMPLETED_PAGE = 190, 191
DETAIL_PAGES = range(212, 425)
BANNER = re.compile(r"CRITICAL ENERGY INFRASTRUCTURE INFORMATION.*?employees\.", re.S)
SAV_IS_GPC = {"GPC", "SAV"}          # SAV = Georgia Power's Savannah region (legacy Savannah Electric)


def _rows_by_anchor(words, anchor_x: tuple[float, float], anchor_re: str, y_min: float):
    """Group table words into rows anchored on a column (e.g. the TEAMS number)."""
    anchors = sorted((w for w in words if anchor_x[0] <= w[0] <= anchor_x[1]
                      and re.fullmatch(anchor_re, w[4]) and w[1] > y_min), key=lambda w: w[1])
    rows = []
    for i, a in enumerate(anchors):
        y_next = anchors[i + 1][1] if i + 1 < len(anchors) else 10_000
        rows.append((a, [w for w in words if a[1] - 2.5 <= w[1] < y_next - 2.5]))
    return rows


def _col(ws, x0, x1, y=None, tol=2.5):
    return [w for w in ws if x0 <= w[0] < x1 and (y is None or abs(w[1] - y) <= tol)]


def parse_table2(doc) -> dict[str, dict]:
    out = {}
    for pno in TABLE2_PAGES:
        words = doc[pno].get_text("words")
        for a, ws in _rows_by_anchor(words, (105, 140), r"\d{5}", 170):
            y = a[1]
            zone = _col(ws, 40, 72, y)
            year = _col(ws, 72, 104, y)
            need = [w for w in _col(ws, 268, 322) if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", w[4])]
            spon = [w for w in _col(ws, 322, 362) if re.fullmatch(r"[A-Z]{2,5}", w[4])]
            name_ws = sorted(_col(ws, 142, 272), key=lambda w: (round(w[1]), w[0]))
            out[a[4]] = {
                "zone": zone[0][4] if zone else None,
                "plan_year": int(year[0][4]) if year and year[0][4].isdigit() else None,
                "table_need_date": need[0][4] if need else None,
                "sponsor": spon[0][4] if spon else None,
                "table_name": norm_space(" ".join(w[4] for w in name_ws)),
                "table_page": pno + 1,
            }
    return out


def parse_simple_table(doc, pno: int) -> list[dict]:
    """Tables 3/4: Zone | TEAMS | Project Name | date."""
    text = BANNER.sub("", doc[pno].get_text("text"))
    rows = []
    for m in re.finditer(r"^\s*(\d{3})\s*\n?\s*(\d{5})\s*\n?(.*?)\n?\s*(\d{1,2}/\d{1,2}/\d{4})", text, re.M | re.S):
        rows.append({"zone": m.group(1), "teams": m.group(2), "name": norm_space(m.group(3)),
                     "date": m.group(4), "page": pno + 1})
    return rows


def _section(text: str, start: str, ends: list[str]) -> str:
    i = text.find(start)
    if i < 0:
        return ""
    i += len(start)
    j = min((text.find(e, i) for e in ends if text.find(e, i) >= 0), default=len(text))
    return norm_space(text[i:j])


def parse_details(doc) -> list[dict]:
    out = []
    category = "stability"
    for pno in DETAIL_PAGES:
        raw = doc[pno].get_text("text", sort=True)
        text = BANNER.sub("", raw)
        if "C. Short Circuit Project Details" in text:
            category = "short_circuit"
        elif "D. Interface Transfer Capability Project Details" in text:
            category = "interface_transfer"
        elif "E. Steady State Project Details" in text:
            category = "steady_state"
        m = re.search(r"Teams\s*#\s*(\d+)", text)
        if not m:
            continue
        head = text[:m.start()]
        title_lines = [norm_space(l) for l in head.splitlines()
                       if norm_space(l) and "PUBLIC DISCLOSURE" not in l and "Project Details" not in l
                       and not l.strip().startswith("The following") and not re.match(r"\s*\d+\)", l)]
        title = norm_space(" ".join(title_lines[-2:])) if title_lines else ""
        # titles are one line unless the previous line is a hanging continuation
        if len(title_lines) >= 2 and not re.search(r"(KV|LINE|SUBSTATION|:|-)\s*$", title_lines[-2], re.I):
            title = title_lines[-1]
        dates = re.search(r"Need Date\s+(\S+)\s+Start Date\s+(\S+)", text)
        out.append({
            "teams": m.group(1),
            "title": title,
            "need_date_raw": dates.group(1) if dates else None,
            "start_date_raw": dates.group(2) if dates else None,
            "description": _section(text, "Description", ["Supporting Statement"]),
            "change_ten_year": _section(text, "Change From Previous Ten Year Plan", ["Change From Previous IRP"]),
            "change_irp": _section(text, "Change From Previous IRP", ["Estimated Cost"]),
            "category": category,
            "detail_page": pno + 1,
            "source_text": norm_space(text)[:1400],
        })
    return out


def _endpoints(title: str) -> list[str]:
    t = re.sub(r"^(SAV|GTC|MEAG|DU)\s*:\s*", "", title)
    t = re.sub(r"\((?:SAV|GTC|MEAG)\)", "", t)
    t = re.split(r"\b\d{2,3}(?:\s*[-/]\s*\d{2,3})?\s*KV\b", t, flags=re.I)[0]
    t = re.split(r"\b(LINE|REBUILD|RECONDUCTOR|RELAY|STATCOM|SUBSTATION|BANK|CAPACITOR|REACTOR|"
                 r"BREAKER|SWITCH|UPGRADE|INSTALL|PROJECT|CONVERSION|EXPANSION|AKA)\b", t, flags=re.I)[0]
    parts = [p.strip(" -:") for p in re.split(r"\s+-\s+|\s*–\s*", t) if p.strip(" -:")]
    return parts[:3]


def extract() -> dict:
    doc = pymupdf.open(GPC_PDF)
    pub = pdf_date(doc)
    table2 = parse_table2(doc)
    details = parse_details(doc)
    projects = []
    for d in details:
        t2 = table2.get(d["teams"], {})
        sponsor = t2.get("sponsor") or (re.match(r"^(SAV|GTC|MEAG|DU):", d["title"]) or [None, "GPC"])[1]
        need = parse_date(d["need_date_raw"] or "") or parse_date(t2.get("table_need_date") or "")
        start = parse_date(d["start_date_raw"] or "")
        text = d["title"] + " " + d["description"]
        projects.append({
            "source_id": d["teams"],
            "utility": "GPC" if sponsor in SAV_IS_GPC else sponsor,
            "sponsor": sponsor,
            "state": "GA",
            "name": d["title"],
            "description": d["description"],
            "need": None,
            "status": "Planned",
            "zone": t2.get("zone"),
            "plan_year": t2.get("plan_year"),
            "in_service": need.isoformat() if need else None,
            "in_service_raw": d["need_date_raw"],
            "build_start": start.isoformat() if start else None,
            "build_start_basis": "IRP detail page 'Start Date'",
            "cost_total": None,
            "cost_basis": "redacted in public filing",
            "kv": parse_kv(text),
            "miles": parse_miles(d["description"]),
            "work_type": classify(d["title"], d["description"]),
            "endpoints_parsed": _endpoints(d["title"]),
            "change_note": d["change_ten_year"],
            "change_irp": d["change_irp"],
            "category": d["category"],
            "notes": [] if t2 else ["TEAMS number not found in Table 2"],
            "source_doc": "GPC",
            "source_page": d["detail_page"],
            "source_publication_date": pub,
            "source_text": d["source_text"],
            "table_page": t2.get("table_page"),
            "table_name": t2.get("table_name"),
        })
    return {
        "projects": projects,
        "table2_count": len(table2),
        "table2_only": sorted(set(table2) - {p["source_id"] for p in projects}),
        "cancelled": parse_simple_table(doc, CANCELLED_PAGE),
        "completed": parse_simple_table(doc, COMPLETED_PAGE),
    }


if __name__ == "__main__":
    res = extract()
    write_json(INTERIM / "gpc_projects.json", res["projects"])
    write_json(INTERIM / "gpc_churn.json", {k: res[k] for k in ("cancelled", "completed", "table2_only", "table2_count")})
    ps = res["projects"]
    from collections import Counter
    print(f"GPC detail projects: {len(ps)} | Table 2 rows: {res['table2_count']} | table2-only: {res['table2_only']}")
    print("sponsors:", Counter(p["sponsor"] for p in ps))
    print("utility:", Counter(p["utility"] for p in ps))
    print("work types:", Counter(p["work_type"] for p in ps))
    print("missing dates:", sum(1 for p in ps if not p["in_service"]), "missing start:", sum(1 for p in ps if not p["build_start"]))
    print("cancelled:", len(res["cancelled"]), "completed:", len(res["completed"]))
    for p in ps[:12] + [p for p in ps if p["zone"] in ("219",)][:15]:
        print(f"{p['source_id']} z={p['zone']} {p['sponsor']:<4} {p['build_start']}->{p['in_service']} kv={p['kv']} mi={p['miles']} {p['work_type']:<20} {p['endpoints_parsed']} | {p['name'][:70]}")
