from fastapi.testclient import TestClient

from api.main import app

c = TestClient(app)


def test_projects_and_opportunities():
    assert len(c.get("/api/projects?utility=DESC").json()) == 44
    ops = c.get("/api/opportunities?utility=GPC").json()
    assert ops and all(o["distance_km"] <= 40 for o in ops)
    assert all(abs(sum(p["points"] for p in o["score_parts"]) - o["opportunity_score"]) < 0.2 for o in ops)


def test_brief_is_grounded_and_needs_review():
    oid = c.get("/api/opportunities?utility=GPC").json()[0]["id"]
    b = c.post(f"/api/opportunities/{oid}/brief").json()
    assert b["requires_human_review"] and all(f["source"] for f in b["facts"]) and b["suggestions"]


def test_filter_parser_and_admin_lock():
    f = c.post("/api/query/filters", json={"text": "230 kV in Augusta within 5 miles"}).json()["filters"]
    assert f == {"range_km": 8, "voltage": 230, "region": "Augusta"}
    assert c.post("/api/admin/ingest").status_code == 403
    assert c.get("/api/opportunities/does-not-exist").status_code == 404
