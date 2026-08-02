"""
Download CPUC High Fire Threat District (HFTD) polygons from ArcGIS FeatureServer.

Source CRS is EPSG:3310; requests use outSR=4326 for Leaflet.
Paginates with resultOffset (maxRecordCount=2000) until exhausted.

Writes raw GeoJSON to assets/data/cache/hftd_raw.geojson and prints
feature count + attribute schema. Does not simplify or wire into the map.
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

LAYER_URL = (
    "https://services2.arcgis.com/VofPZYDe2pLxSP5G/ArcGIS/rest/services/"
    "CPUC_High_Fire_Threat_District/FeatureServer/0"
)
PAGE_SIZE = 2000
UA = {"User-Agent": "research-data-pipeline; +local (hftd-fetch)"}


def script_paths() -> tuple[Path, Path]:
    root = Path(__file__).resolve().parents[1]
    out_path = root / "assets" / "data" / "cache" / "hftd_raw.geojson"
    return root, out_path


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.load(resp)


def fetch_page(offset: int, page_size: int = PAGE_SIZE) -> list[dict]:
    params = {
        "where": "1=1",
        "outFields": "*",
        "f": "geojson",
        "outSR": "4326",
        "returnGeometry": "true",
        "resultOffset": str(offset),
        "resultRecordCount": str(page_size),
    }
    url = f"{LAYER_URL}/query?{urllib.parse.urlencode(params)}"
    print(f"  GET offset={offset} count={page_size}")
    data = fetch_json(url)
    if data.get("type") != "FeatureCollection" and "features" not in data:
        raise RuntimeError(f"Unexpected response keys: {sorted(data.keys())}")
    return list(data.get("features") or [])


def download_all() -> list[dict]:
    features: list[dict] = []
    offset = 0
    while True:
        page = fetch_page(offset)
        if not page:
            break
        features.extend(page)
        print(f"  got {len(page)} (total {len(features)})")
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return features


def print_schema(features: list[dict]) -> None:
    print(f"\nfeature_count: {len(features)}")
    if not features:
        print("attribute_schema: (no features)")
        return

    key_sets = [set((f.get("properties") or {}).keys()) for f in features]
    all_keys = sorted(set().union(*key_sets))
    print("attribute_fields:")
    for key in all_keys:
        sample = next(
            ((f.get("properties") or {}).get(key) for f in features if key in (f.get("properties") or {})),
            None,
        )
        typ = type(sample).__name__
        print(f"  {key}: sample={sample!r} ({typ})")

    geom_types = Counter((f.get("geometry") or {}).get("type") for f in features)
    print("geometry_types:", dict(geom_types))

    if "HFTD" in all_keys:
        counts = Counter((f.get("properties") or {}).get("HFTD") for f in features)
        print("HFTD_value_counts:", dict(counts))
    else:
        print("HFTD_value_counts: field 'HFTD' not present")


def main() -> int:
    _, out_path = script_paths()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Downloading HFTD from:\n  {LAYER_URL}")
    try:
        features = download_all()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    collection = {"type": "FeatureCollection", "features": features}
    text = json.dumps(collection, separators=(",", ":"))
    out_path.write_text(text, encoding="utf-8")
    size_bytes = out_path.stat().st_size

    print_schema(features)
    print(f"\nwrote: {out_path}")
    print(f"file_size_bytes: {size_bytes}")
    print(f"file_size_mb: {size_bytes / (1024 * 1024):.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
