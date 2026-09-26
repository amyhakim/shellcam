"""One-command refresh: re-extract both filings, re-locate, re-analyse, re-validate, re-export."""
import runpy
import time

STAGES = ["extract_desc", "extract_gpc", "fetch_grid", "geocode", "analyze", "validate", "export"]

if __name__ == "__main__":
    for s in STAGES:
        t = time.time()
        print(f"\n=== {s}")
        runpy.run_module(s, run_name="__main__")
        print(f"--- {s} done in {time.time() - t:.1f}s")
