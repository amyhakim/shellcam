import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from common import PROCESSED, parse_date, parse_kv, parse_miles, read_json  # noqa: E402
from extract_desc import repair_costs  # noqa: E402
from validate import hav_mi  # noqa: E402


def test_parsers():
    assert parse_kv("Okatie 230-115kV Substation") == [230, 115]
    assert parse_kv("THALMANN AND COLERAIN 23O KV") == [230]
    assert parse_miles("Hyundai - Newton Rd (12 miles) and Hyundai - Meldrim (10 miles)") == 22
    assert parse_date("12/31/24").isoformat() == "2024-12-31"
    assert parse_date("10/1/2025 (phase 1)").isoformat() == "2025-10-01"


def test_cost_repair_reconciles_malformed_cell():
    vals = {"previous": 4_337_401, "2024": 1_900_181, "2025": 11_489_845, "2026": 50_000, "2027": 0, "2028": 0,
            "total": 34_877_427}
    raw = {"2024": "$19,00,181", "previous": "$4,337,401"}
    fixed, notes = repair_costs(dict(vals), raw)
    assert fixed["2024"] == 19_000_181 and notes


@pytest.mark.parametrize("a,b,claimed", [
    ((33.660127, -82.195931), (33.6020605, -82.1822895), 4.09),
    ((32.346439, -81.0785475), (32.352116, -81.175112), 5.65),
    ((32.2843925, -80.9429395), (32.3004085, -81.1957885), 14.81),
])
def test_reproduces_sperry_sample_distances(a, b, claimed):
    assert abs(hav_mi(a, b) - claimed) < 0.01


def test_pipeline_outputs():
    projects = read_json(PROCESSED / "projects.json")
    pairs = read_json(PROCESSED / "pairs.json")
    assert sum(p["utility"] == "DESC" for p in projects) == 44
    assert sum(p["utility"] != "DESC" for p in projects) == 208
    tiers = {x["tier"] for x in pairs if x["tier"]}
    assert tiers <= {1, 2, 3, 4}
    for x in pairs:
        if x["tier"]:
            assert x["km"] <= 40.0
        if x["tier"] == 1:
            assert x["km"] <= 0.05
    assert pairs == sorted(pairs, key=lambda x: -x["score"])


def test_finds_every_sample_overlap():
    q = read_json(PROCESSED / "quality.json")["sample_audit"]
    assert all(r["match"] for r in q["reproduced"])
    assert all(f["ours"] for f in q["found"])
