"""
Trial-simplify CPUC HFTD MultiPolygons at several tolerances.

Reads assets/data/cache/hftd_raw.geojson, writes candidate GeoJSONs under
assets/data/cache/hftd_trial_*.geojson plus PNG previews for visual review.
Does not write assets/data/hftd.geojson until a tolerance is chosen.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from shapely.geometry import mapping, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "assets" / "data" / "cache" / "hftd_raw.geojson"
CACHE = ROOT / "assets" / "data" / "cache"
TOLERANCES = (0.001, 0.003, 0.01)
PRECISION = 5  # decimal places for coordinates

TIER_COLORS = {
    "Tier 2": "#fbbf24",  # amber — elevated
    "Tier 3": "#b45309",  # darker amber/brown — extreme
}


def round_coords(geom, ndigits: int = PRECISION):
    def _round(x, y, z=None):
        if z is None:
            return (round(x, ndigits), round(y, ndigits))
        return (round(x, ndigits), round(y, ndigits), round(z, ndigits))

    return transform(_round, geom)


def count_coords(geom) -> int:
    if geom is None or geom.is_empty:
        return 0
    if geom.geom_type == "Polygon":
        n = len(geom.exterior.coords)
        n += sum(len(r.coords) for r in geom.interiors)
        return n
    if geom.geom_type == "MultiPolygon":
        return sum(count_coords(g) for g in geom.geoms)
    if hasattr(geom, "geoms"):
        return sum(count_coords(g) for g in geom.geoms)
    return 0


def simplify_collection(features: list[dict], tolerance: float) -> list[dict]:
    out = []
    for feat in features:
        props = dict(feat.get("properties") or {})
        geom = shape(feat["geometry"])
        simplified = geom.simplify(tolerance, preserve_topology=True)
        rounded = round_coords(simplified, PRECISION)
        if rounded.is_empty:
            print(f"  WARN: empty geometry after simplify for {props.get('HFTD')}")
            continue
        out.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": mapping(rounded),
            }
        )
    return out


def write_geojson(path: Path, features: list[dict]) -> int:
    text = json.dumps(
        {"type": "FeatureCollection", "features": features},
        separators=(",", ":"),
    )
    path.write_text(text, encoding="utf-8")
    return path.stat().st_size


def plot_preview(features: list[dict], title: str, out_png: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 9), dpi=120)
    for feat in features:
        tier = (feat.get("properties") or {}).get("HFTD", "?")
        color = TIER_COLORS.get(tier, "#94a3b8")
        geom = shape(feat["geometry"])
        polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        for poly in polys:
            xs, ys = poly.exterior.xy
            ax.fill(xs, ys, facecolor=color, edgecolor="#334155", linewidth=0.25, alpha=0.55)
            for hole in poly.interiors:
                hx, hy = hole.xy
                ax.fill(hx, hy, facecolor="white", edgecolor="#334155", linewidth=0.15, alpha=1.0)

    ax.set_aspect("equal")
    ax.set_title(title, fontsize=11)
    ax.set_xlabel("lon")
    ax.set_ylabel("lat")
    # Focus on CA-ish extent
    ax.set_xlim(-124.6, -113.8)
    ax.set_ylim(32.4, 42.2)
    ax.grid(True, alpha=0.25, linewidth=0.4)
    ax.legend(
        handles=[
            Patch(facecolor=TIER_COLORS["Tier 2"], edgecolor="#334155", label="Tier 2", alpha=0.55),
            Patch(facecolor=TIER_COLORS["Tier 3"], edgecolor="#334155", label="Tier 3", alpha=0.55),
        ],
        loc="lower left",
    )
    fig.tight_layout()
    fig.savefig(out_png, bbox_inches="tight")
    plt.close(fig)


def plot_zoom_compare(raw_features: list[dict], trials: dict[float, list[dict]], out_png: Path) -> None:
    """Bay Area / Sierra foothills zoom — coastline + tier edges are sensitive here."""
    regions = [
        ("SF Bay / Sierra foothills", (-123.2, -120.8, 36.8, 39.0)),
        ("SoCal / LA–Ventura", (-119.6, -117.4, 33.6, 34.9)),
    ]
    cols = 1 + len(trials)
    fig, axes = plt.subplots(len(regions), cols, figsize=(4.2 * cols, 4.2 * len(regions)), dpi=130)

    datasets = [("raw", raw_features)] + [(f"tol={t}", trials[t]) for t in sorted(trials)]
    for row, (region_name, extent) in enumerate(regions):
        for col, (label, features) in enumerate(datasets):
            ax = axes[row, col] if len(regions) > 1 else axes[col]
            for feat in features:
                tier = (feat.get("properties") or {}).get("HFTD", "?")
                color = TIER_COLORS.get(tier, "#94a3b8")
                geom = shape(feat["geometry"])
                polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
                for poly in polys:
                    xs, ys = poly.exterior.xy
                    ax.fill(xs, ys, facecolor=color, edgecolor="#1e293b", linewidth=0.35, alpha=0.6)
            ax.set_xlim(extent[0], extent[1])
            ax.set_ylim(extent[2], extent[3])
            ax.set_aspect("equal")
            ax.tick_params(labelsize=7)
            if row == 0:
                ax.set_title(label, fontsize=10)
            if col == 0:
                ax.set_ylabel(region_name, fontsize=9)
    fig.suptitle("HFTD simplify comparison (zoom)", fontsize=12, y=1.01)
    fig.tight_layout()
    fig.savefig(out_png, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    if not RAW.exists():
        print(f"Missing raw file: {RAW}", file=sys.stderr)
        print("Run scripts/fetch_hftd.py first.", file=sys.stderr)
        return 1

    raw = json.loads(RAW.read_text(encoding="utf-8"))
    raw_features = raw.get("features") or []
    raw_bytes = RAW.stat().st_size
    raw_coords = sum(count_coords(shape(f["geometry"])) for f in raw_features)

    print(f"raw: {raw_bytes} bytes ({raw_bytes / (1024*1024):.2f} MB), coords={raw_coords}")
    CACHE.mkdir(parents=True, exist_ok=True)

    # Raw preview
    raw_png = CACHE / "hftd_preview_raw.png"
    plot_preview(raw_features, f"raw ({raw_bytes/(1024*1024):.2f} MB, {raw_coords} coords)", raw_png)
    print(f"wrote preview: {raw_png}")

    trials: dict[float, list[dict]] = {}
    print("\ntolerance | MB     | bytes     | coords | vs raw")
    print("-" * 56)
    for tol in TOLERANCES:
        simplified = simplify_collection(raw_features, tol)
        trials[tol] = simplified
        out = CACHE / f"hftd_trial_{str(tol).replace('.', 'p')}.geojson"
        size = write_geojson(out, simplified)
        coords = sum(count_coords(shape(f["geometry"])) for f in simplified)
        mb = size / (1024 * 1024)
        ratio = size / raw_bytes if raw_bytes else 0
        print(
            f"{tol:<9} | {mb:6.2f} | {size:9d} | {coords:6d} | {ratio:.1%} of raw -> {out.name}"
        )
        png = CACHE / f"hftd_preview_{str(tol).replace('.', 'p')}.png"
        plot_preview(simplified, f"tol={tol} ({mb:.2f} MB, {coords} coords)", png)
        print(f"  preview: {png.name}")

    compare_png = CACHE / "hftd_preview_compare_zoom.png"
    plot_zoom_compare(raw_features, trials, compare_png)
    print(f"\nwrote zoom compare: {compare_png}")
    print("\nNo assets/data/hftd.geojson written yet — pick a tolerance next.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
