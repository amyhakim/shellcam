"""Fetch public OpenStreetMap grid features for GA + SC via Overpass (cached in data/raw).

Same approach as Sperry's Finding_Real_Locations_Guide, scaled up: pull every substation,
power plant and >=115 kV line in the two-state box once, then match names locally.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

from common import RAW, write_json

BBOX = (30.3, -85.7, 35.3, -78.4)  # south, west, north, east (GA + SC)
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

QUERIES = {
    "substations": f"""[out:json][timeout:180];
(nwr["power"="substation"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
 nwr["power"="plant"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}););
out center tags;""",
    "lines": f"""[out:json][timeout:240];
way["power"="line"]["voltage"~"(^|;)(115000|161000|230000|500000)"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
out geom tags;""",
}


def fetch(name: str, query: str, force: bool = False) -> dict:
    path = RAW / f"osm_{name}.json"
    if path.exists() and not force:
        return json.loads(path.read_text(encoding="utf-8"))
    body = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for url in ENDPOINTS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, data=body, headers={"User-Agent": "gridlock-shellhacks/1.0"})
                with urllib.request.urlopen(req, timeout=300) as r:
                    data = json.loads(r.read())
                path.write_text(json.dumps(data), encoding="utf-8")
                return data
            except Exception as e:  # rate limit / timeout: back off, then try the mirror
                last = e
                time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Overpass fetch failed for {name}: {last}")


def main():
    subs = fetch("substations", QUERIES["substations"])
    feats = []
    for el in subs["elements"]:
        tags = el.get("tags", {})
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None:
            continue
        feats.append({"osm": f"{el['type']}/{el['id']}", "kind": tags.get("power"), "name": tags.get("name"),
                      "operator": tags.get("operator"), "voltage": tags.get("voltage"),
                      "ref": tags.get("ref"), "lat": lat, "lon": lon})
    write_json(RAW / "osm_substations_flat.json", feats, indent=None)
    print(f"substations/plants: {len(feats)} ({sum(1 for f in feats if f['name'])} named)")
    lines = fetch("lines", QUERIES["lines"])
    print(f"lines >=115kV: {len(lines['elements'])}")


if __name__ == "__main__":
    main()
