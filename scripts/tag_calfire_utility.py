"""
One-time: tag CAL FIRE incidents with IOU utility via point-in-polygon
against CPUC IOU service territory shapefile.

Reads assets/data/calfire_incidents.csv, spatial-joins to
assets/data/iou_shapes/IOU_Service_Territory_20240812.shp, adds a
normalized `utility` column matching site codes (PGE, SCE, SDGE, ...),
prints per-utility counts (including no-match), and writes the CSV back.
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

UTILITY_ID_TO_SITE = {
    "PG&E": "PGE",
    "SCE": "SCE",
    "PacifiCorp": "PACIFICORP",
    "SDG&E": "SDGE",
    "LU": "Liberty",
    "BVES": "BVES",
}


def script_paths() -> tuple[Path, Path, Path]:
    root = Path(__file__).resolve().parents[1]
    csv_path = root / "assets" / "data" / "calfire_incidents.csv"
    shp_path = (
        root
        / "assets"
        / "data"
        / "iou_shapes"
        / "IOU_Service_Territory_20240812.shp"
    )
    return root, csv_path, shp_path


def main() -> int:
    _, csv_path, shp_path = script_paths()
    if not csv_path.exists():
        print(f"Missing CAL FIRE CSV: {csv_path}", file=sys.stderr)
        return 1
    if not shp_path.exists():
        print(f"Missing IOU shapefile: {shp_path}", file=sys.stderr)
        return 1

    df = pd.read_csv(csv_path)
    if "utility" in df.columns:
        df = df.drop(columns=["utility"])

    territories = gpd.read_file(shp_path)
    if territories.crs is None:
        territories = territories.set_crs(4326)
    elif territories.crs.to_epsg() != 4326:
        territories = territories.to_crs(4326)

    if "UtilityID" not in territories.columns:
        print(
            f"Shapefile missing UtilityID column; columns={list(territories.columns)}",
            file=sys.stderr,
        )
        return 1

    points = gpd.GeoDataFrame(
        df.index.to_series(name="_idx"),
        geometry=gpd.points_from_xy(
            df["incident_longitude"], df["incident_latitude"]
        ),
        crs="EPSG:4326",
    )

    joined = gpd.sjoin(
        points,
        territories[["UtilityID", "geometry"]],
        how="left",
        predicate="within",
    )
    # If a point falls in overlapping polygons, keep the first match.
    joined = joined[~joined.index.duplicated(keep="first")]

    raw_ids = joined["UtilityID"].reindex(df.index)
    unknown = sorted(
        {str(v) for v in raw_ids.dropna().unique() if str(v) not in UTILITY_ID_TO_SITE}
    )
    if unknown:
        print(
            f"Warning: unmapped UtilityID values (left blank): {unknown}",
            file=sys.stderr,
        )

    df["utility"] = raw_ids.map(
        lambda v: UTILITY_ID_TO_SITE.get(str(v), "") if pd.notna(v) else ""
    )

    counts = df["utility"].value_counts(dropna=False)
    print("CAL FIRE utility attribution counts:")
    matched_total = 0
    for utility, count in counts.items():
        label = utility if utility else "(no match)"
        print(f"  {label}: {count}")
        if utility:
            matched_total += int(count)
    no_match = int((df["utility"] == "").sum())
    print(f"  ---")
    print(f"  matched: {matched_total}")
    print(f"  no match: {no_match}")
    print(f"  total rows: {len(df)}")

    df.to_csv(csv_path, index=False)
    print(f"Wrote {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
