#!/usr/bin/env python3
"""End-to-end validation: APIs, upload, frontend routes."""
import json
import sys
import time
from pathlib import Path

import requests

API = "http://localhost:8000"
FRONTEND = "http://localhost:5173"
CSV_PATH = Path(__file__).parent / "ai4i2020.csv"

ROUTES = [
    "/",
    "/monitoring",
    "/fault-detection",
    "/predictive-maintenance",
    "/yield",
    "/model-performance",
    "/root-cause",
    "/fab-map",
]

API_ENDPOINTS = [
    "/",
    "/status",
    "/dashboard-summary",
    "/equipment-health",
    "/alerts",
    "/sensor-history",
    "/yield-forecast",
    "/root-cause",
    "/model-performance",
    "/export-pdf",
]


def check(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def main():
    results = []

    print("=== API Health ===")
    for ep in API_ENDPOINTS:
        try:
            r = requests.get(f"{API}{ep}", timeout=120)
            ok = r.status_code == 200
            results.append(check(f"GET {ep}", ok, f"{r.status_code} ({len(r.content)} bytes)"))
        except Exception as e:
            results.append(check(f"GET {ep}", False, str(e)))

    print("\n=== Frontend Routes ===")
    for route in ROUTES:
        try:
            r = requests.get(f"{FRONTEND}{route}", timeout=30)
            ok = r.status_code == 200 and len(r.content) > 500
            results.append(check(f"GET {route}", ok, f"{r.status_code} ({len(r.content)} bytes)"))
        except Exception as e:
            results.append(check(f"GET {route}", False, str(e)))

    print("\n=== Upload ai4i2020.csv ===")
    if not CSV_PATH.exists():
        results.append(check("CSV exists", False, str(CSV_PATH)))
    else:
        before = requests.get(f"{API}/dashboard-summary", timeout=60).json()
        t0 = time.time()
        with CSV_PATH.open("rb") as f:
            r = requests.post(
                f"{API}/upload-data",
                files={"file": ("ai4i2020.csv", f, "text/csv")},
                timeout=600,
            )
        elapsed = time.time() - t0
        ok = r.status_code == 200
        body = r.json() if ok else r.text[:200]
        results.append(check("POST /upload-data", ok, f"{elapsed:.1f}s {body}"))
        if ok:
            after = requests.get(f"{API}/dashboard-summary", timeout=60).json()
            changed = before.get("fab_health") != after.get("fab_health") or before.get("total_machines") != after.get("total_machines")
            results.append(check("Dashboard changed after upload", changed, f"fab_health {before.get('fab_health')} -> {after.get('fab_health')}"))

    print("\n=== Post-upload API snapshots ===")
    snapshots = {}
    for ep in ["/dashboard-summary", "/equipment-health", "/alerts", "/sensor-history", "/yield-forecast", "/root-cause"]:
        try:
            r = requests.get(f"{API}{ep}", timeout=120)
            data = r.json()
            if ep == "/equipment-health":
                snapshots[ep] = len(data)
            elif ep == "/alerts":
                snapshots[ep] = len(data)
            elif ep == "/sensor-history":
                snapshots[ep] = len(data)
            elif ep == "/dashboard-summary":
                snapshots[ep] = data.get("fab_health")
            elif ep == "/yield-forecast":
                snapshots[ep] = data[0] if data else None
            else:
                snapshots[ep] = data.get("machine_id")
            results.append(check(f"Post-upload {ep}", r.status_code == 200, str(snapshots[ep])[:80]))
        except Exception as e:
            results.append(check(f"Post-upload {ep}", False, str(e)))

    print("\n=== Summary ===")
    passed = sum(results)
    total = len(results)
    print(f"{passed}/{total} checks passed")
    print(json.dumps(snapshots, indent=2, default=str))
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
