"""
Scrape CPUC per-utility fire ignition .xlsx reports (2020-2025).

- Discovers links from the wildfire page under each utility's
  "Fire Incident Data" <li> section (section heading is the source of truth
  for `utility`; filename is only a secondary sanity check).
- Caches downloads under assets/data/cache/cpuc_fire_incidents/ as
  {utility}_{year}.xlsx (skips existing files).
- Normalizes to utility / date / lat / lon (+ year, source_file) CSV.
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import unquote, urljoin

import pandas as pd

PAGE_URL = "https://www.cpuc.ca.gov/industries-and-topics/wildfires"
YEAR_MIN = 2020
YEAR_MAX = 2025
UA = {"User-Agent": "Mozilla/5.0 (research-data-pipeline; +local)"}

SECTION_PATTERNS = [
    (re.compile(r"pg\s*&?\s*e\s+fire\s+incident\s+data", re.I), "PGE"),
    (re.compile(r"\bsce\s+fire\s+incident\s+data", re.I), "SCE"),
    (re.compile(r"sdg\s*&?\s*e\s+fire\s+incident\s+data", re.I), "SDGE"),
    (re.compile(r"pacificorp\s+fire\s+incident\s+data", re.I), "PACIFICORP"),
]

SKIP_SHEET_RE = re.compile(
    r"(drop\s*downs?|cover|summary|instructions?|readme|legend|lookup|validation)",
    re.I,
)


def script_paths() -> tuple[Path, Path, Path]:
    root = Path(__file__).resolve().parents[1]  # dataset_demo/
    cache = root / "assets" / "data" / "cache" / "cpuc_fire_incidents"
    out_csv = root / "assets" / "data" / "cpuc_fire_incidents_combined.csv"
    return root, cache, out_csv


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def guess_utility_from_filename(filename: str) -> str | None:
    fname = filename.lower()
    if "pacificorp" in fname:
        return "PACIFICORP"
    if "sdge" in fname or "sdg" in fname:
        return "SDGE"
    if (
        re.search(r"(^|[^a-z])sce([^a-z]|$)", fname)
        or "sce-" in fname
        or "_sce" in fname
        or "scefire" in fname
    ):
        return "SCE"
    if "pge" in fname or "pg&e" in fname or "pg-e" in fname:
        return "PGE"
    return None


def parse_section_links(html: str) -> list[dict]:
    lower = html.lower()
    start = lower.find("fire ignition data")
    chunk = html[start:] if start >= 0 else html
    li_re = re.compile(r"(?is)<li\b[^>]*>.*?</li>")
    results = []
    for li_m in li_re.finditer(chunk):
        li = li_m.group(0)
        text = re.sub(r"(?is)<[^>]+>", " ", li)
        text = re.sub(r"\s+", " ", text).strip().replace("&amp;", "&")
        utility = None
        for pat, util in SECTION_PATTERNS:
            if pat.search(text):
                utility = util
                break
        if not utility:
            continue

        for href_m in re.finditer(r'(?is)href=["\']([^"\']+\.xlsx)["\']', li):
            href = href_m.group(1)
            url = urljoin(PAGE_URL, href)
            filename = unquote(url.split("/")[-1])
            after = li[href_m.end() : href_m.end() + 120]
            anchor_m = re.search(r"(?is)>([^<]{0,40})<", after)
            anchor = re.sub(r"\s+", " ", (anchor_m.group(1) if anchor_m else "")).strip(" ,")
            year_m = re.search(r"(20\d{2})", anchor) or re.search(r"(20\d{2})", filename)
            year = int(year_m.group(1)) if year_m else None
            results.append(
                {
                    "utility": utility,
                    "filename_guess": guess_utility_from_filename(filename),
                    "year": year,
                    "anchor": anchor,
                    "url": url,
                    "filename": filename,
                }
            )
    return results


def download_cached(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  cache hit: {dest.name}")
        return dest
    print(f"  downloading: {dest.name}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(fetch(url))
    return dest


def _clean_name(value) -> str:
    if pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def uniquify_columns(cols: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for c in cols:
        base = c or "col"
        n = seen.get(base, 0)
        seen[base] = n + 1
        out.append(base if n == 0 else f"{base}.{n}")
    return out


def apply_two_row_header(raw: pd.DataFrame) -> tuple[list[str], pd.DataFrame]:
    row0 = raw.iloc[0].tolist()
    row1 = raw.iloc[1].tolist()
    skip_group_labels = {"utility name", "index", "utility"}
    groups = []
    last = ""
    tops = [_clean_name(v) for v in row0]
    for name in tops:
        if name and len(name) < 40 and name.lower() not in skip_group_labels:
            last = name
            groups.append(last)
        elif name and name.lower() in skip_group_labels:
            last = ""
            groups.append("")
        else:
            groups.append(last)
    subs = [_clean_name(v) for v in row1]
    cols = []
    for g, s, top in zip(groups, subs, tops):
        if top and top.lower() in skip_group_labels and not s:
            cols.append(top)
        elif s and g and s.lower() != g.lower():
            cols.append(f"{g} | {s}")
        else:
            cols.append(s or g or top)
    cols = uniquify_columns(cols)
    df = raw.iloc[2:].copy()
    df.columns = cols
    return cols, df


def apply_single_row_header(raw: pd.DataFrame) -> tuple[list[str], pd.DataFrame]:
    cols = uniquify_columns(
        [_clean_name(c) or f"col_{i}" for i, c in enumerate(raw.iloc[0].tolist())]
    )
    df = raw.iloc[1:].copy()
    df.columns = cols
    return cols, df


def find_header_start(raw: pd.DataFrame) -> tuple[int, str]:
    """
    Locate the first header row. Some workbooks (e.g. PacifiCorp) put a
    long disclaimer above the real two-row header.
    Returns (start_row_index, mode) where mode is two-row-header or single-row-header.
    """
    for i in range(min(len(raw) - 1, 15)):
        vals = [_clean_name(v) for v in raw.iloc[i].tolist()]
        joined = " | ".join(v for v in vals if v)
        # Skip disclaimer / paragraph rows
        if len(joined) > 120:
            continue
        has_utility = any(v.lower() == "utility name" or v.lower() == "utility" for v in vals)
        has_fire_start = any("fire start" in v.lower() for v in vals)
        has_lat = any("latitude" in v.lower() for v in vals)
        if i + 1 < len(raw):
            next_vals = [_clean_name(v) for v in raw.iloc[i + 1].tolist()]
            next_has_lat = any("latitude" in v.lower() for v in next_vals)
            next_has_date = any(v.lower() == "date" for v in next_vals)
            if (has_utility or has_fire_start) and next_has_lat:
                return i, "two-row-header"
            if has_lat and (has_utility or has_fire_start or next_has_date):
                return i, "single-row-header"
        if has_lat:
            return i, "single-row-header"
    # Fallback: classic top-of-sheet heuristics
    if len(raw) >= 3:
        row0 = raw.iloc[0].tolist()
        row1 = raw.iloc[1].tolist()
        emptyish = sum(1 for v in row0 if _clean_name(v) == "")
        row0_has_lat = any("lat" in _clean_name(v).lower() for v in row0)
        row1_has_lat = any("lat" in _clean_name(v).lower() for v in row1)
        if (row1_has_lat and not row0_has_lat) or emptyish >= 3:
            return 0, "two-row-header"
    return 0, "single-row-header"


def score_sheet_dataframe(df: pd.DataFrame, cols: list[str]) -> tuple[int, dict]:
    """Score how likely a sheet is real incident data."""
    col_l = [c.lower() for c in cols]
    has_lat = any("latitude" in c for c in col_l)
    has_lon = any("longitude" in c for c in col_l)
    has_date = any("date" in c and "outage" not in c for c in col_l)
    has_fire_start = any("fire start" in c for c in col_l)

    numeric_lat = 0
    if has_lat and has_lon:
        lat_col = next(c for c in cols if "latitude" in c.lower())
        lon_col = next(c for c in cols if "longitude" in c.lower())
        lat_num = pd.to_numeric(df[lat_col], errors="coerce")
        lon_num = pd.to_numeric(df[lon_col], errors="coerce")
        numeric_lat = int((lat_num.between(32, 43) & lon_num.between(-125, -113)).sum())

    score = 0
    if has_lat:
        score += 5
    if has_lon:
        score += 5
    if has_date:
        score += 3
    if has_fire_start:
        score += 2
    score += min(numeric_lat, 50)  # reward real CA-ish coords
    if len(df) >= 5:
        score += 2
    if len(df) >= 20:
        score += 2

    return score, {
        "has_lat": has_lat,
        "has_lon": has_lon,
        "has_date": has_date,
        "numeric_ca_coords": numeric_lat,
        "nrows": len(df),
    }


def read_sheet_raw(path: Path, sheet) -> pd.DataFrame:
    return pd.read_excel(path, sheet_name=sheet, header=None)


def parse_sheet(raw: pd.DataFrame) -> tuple[str, list[str], pd.DataFrame]:
    start, mode = find_header_start(raw)
    sliced = raw.iloc[start:].reset_index(drop=True)
    if mode == "two-row-header":
        cols, df = apply_two_row_header(sliced)
    else:
        cols, df = apply_single_row_header(sliced)
    df = df.dropna(how="all")
    if len(df) and any(
        isinstance(v, str) and v.strip().lower() == "latitude" for v in df.iloc[0].tolist()
    ):
        df = df.iloc[1:].copy()
    # Drop columns that are absurdly long (disclaimer bleed-through)
    keep = [c for c in cols if len(str(c)) < 80]
    if keep and len(keep) < len(cols):
        df = df[keep].copy()
        cols = keep
    return mode, list(df.columns), df.reset_index(drop=True)


def select_data_sheet(path: Path, utility: str, year: int) -> tuple[str | int, str, list[str], pd.DataFrame]:
    xl = pd.ExcelFile(path)
    sheet_names = xl.sheet_names
    candidates = []

    for idx, name in enumerate(sheet_names):
        if SKIP_SHEET_RE.search(str(name)):
            reason = "skipped (summary/dropdown/cover-like name)"
            candidates.append((idx, name, -999, {"reason": reason}, None, None, None))
            continue
        try:
            raw = read_sheet_raw(path, name)
            mode, cols, df = parse_sheet(raw)
            score, meta = score_sheet_dataframe(df, cols)
            # Prefer year-named / Interactive / Data sheets slightly
            name_l = str(name).lower()
            if str(year) in name_l:
                score += 3
            if "interactive" in name_l or "data" in name_l or "reportable" in name_l:
                score += 2
            if "all years" in name_l:
                score += 4
            if name_l in {"sheet1", "data"}:
                score += 1
            candidates.append((idx, name, score, meta, mode, cols, df))
        except Exception as exc:  # noqa: BLE001
            candidates.append((idx, name, -998, {"error": str(exc)}, None, None, None))

    # Always print multi-sheet decision details for SDGE; also when >1 sheet
    if utility == "SDGE" or len(sheet_names) > 1:
        print(f"\n  [{utility} {year}] sheet scan ({path.name}):")
        for idx, name, score, meta, mode, cols, df in candidates:
            print(f"    [{idx}] {name!r:30} score={score:>4}  {meta}")

    usable = [c for c in candidates if c[2] > 0 and c[6] is not None]
    if not usable:
        # fall back to first non-skipped sheet
        for c in candidates:
            if c[6] is not None:
                usable = [c]
                break
    if not usable:
        raise RuntimeError(f"No readable data sheet in {path}")

    best = max(usable, key=lambda c: c[2])
    idx, name, score, meta, mode, cols, df = best
    print(
        f"  [{utility} {year}] selected sheet [{idx}] {name!r} "
        f"(score={score}, mode={mode}, rows={len(df)})"
    )
    if meta.get("numeric_ca_coords", 0) < 1:
        print(f"  WARNING: selected sheet has few/no CA-like lat/lon rows: {meta}")
    return name, mode, cols, df


def find_col(cols: list[str], *predicates) -> str | None:
    for col in cols:
        cl = col.lower()
        if all(p(cl) for p in predicates):
            return col
    return None


def find_fire_start_date_col(cols: list[str]) -> str | None:
    # Prefer explicit Fire Start | Date
    hit = find_col(cols, lambda c: "fire start" in c and c.endswith("date") or "fire start | date" in c)
    if hit:
        return hit
    hit = find_col(cols, lambda c: "fire start" in c and "date" in c)
    if hit:
        return hit
    # Single-row schemas: first standalone Date before any Outage date
    for col in cols:
        cl = col.lower()
        if cl == "date" or cl.startswith("date."):
            return col
    return None


def parse_dates_series(df: pd.DataFrame, cols: list[str], year_hint: int) -> tuple[pd.Series, str]:
    """Return parsed dates + description of method used."""
    date_col = find_fire_start_date_col(cols)
    month_col = find_col(cols, lambda c: ("fire start" in c or c == "month") and "month" in c)
    day_col = find_col(cols, lambda c: ("fire start" in c or c == "day") and re.search(r"\bday\b", c) is not None)
    year_col = find_col(cols, lambda c: ("fire start" in c or c == "year") and re.search(r"\byear\b", c) is not None)
    # Tighten MDY to fire-start-prefixed when present
    month_col = find_col(cols, lambda c: "fire start" in c and "month" in c) or month_col
    day_col = find_col(cols, lambda c: "fire start" in c and re.search(r"\bday\b", c) is not None) or day_col
    year_col = find_col(cols, lambda c: "fire start" in c and re.search(r"\byear\b", c) is not None) or year_col

    raw = pd.Series([pd.NaT] * len(df), index=df.index, dtype="datetime64[ns]")
    method = "none"

    if date_col:
        parsed = pd.to_datetime(df[date_col], errors="coerce")
        if parsed.notna().any():
            bad = parsed.notna() & ((parsed.dt.year < YEAR_MIN - 1) | (parsed.dt.year > YEAR_MAX + 1))
            if bad.any():
                as_str = df[date_col].astype(str)
                parsed2 = pd.to_datetime(as_str, errors="coerce", format="mixed", dayfirst=False)
                years = parsed2.dt.year
                mis = parsed2.notna() & (years >= 1900) & (years < 2000) & ((years + 100 - year_hint).abs() <= 1)
                parsed2 = parsed2.copy()
                parsed2.loc[mis] = parsed2.loc[mis].apply(
                    lambda d: d.replace(year=d.year + 100) if pd.notna(d) else d
                )
                parsed = parsed.where(~bad, parsed2)
            raw = parsed
            method = f"column:{date_col}"

    if month_col and day_col and year_col:
        parts = pd.to_datetime(
            {
                "year": pd.to_numeric(df[year_col], errors="coerce"),
                "month": pd.to_numeric(df[month_col], errors="coerce"),
                "day": pd.to_numeric(df[day_col], errors="coerce"),
            },
            errors="coerce",
        )
        if raw.isna().all() or parts.notna().sum() > raw.notna().sum():
            if raw.isna().all():
                raw = parts
                method = f"combine:{month_col}+{day_col}+{year_col}"
            else:
                raw = raw.fillna(parts)
                method = f"{method} + fillna(MDY parts)"

    return raw, method


def extract_normalized(df: pd.DataFrame, cols: list[str], utility: str, year: int, source_file: str) -> tuple[pd.DataFrame, dict]:
    lat_col = find_col(cols, lambda c: "latitude" in c)
    lon_col = find_col(cols, lambda c: "longitude" in c)
    if not lat_col or not lon_col:
        raise RuntimeError(f"Missing lat/lon columns in {source_file}: {cols}")

    dates, date_method = parse_dates_series(df, cols, year)
    out = pd.DataFrame(
        {
            "utility": utility,
            "date": dates,
            "lat": pd.to_numeric(df[lat_col], errors="coerce"),
            "lon": pd.to_numeric(df[lon_col], errors="coerce"),
            "year": year,
            "source_file": source_file,
        }
    )
    # Keep rows with usable coords; date may still be useful even if null (rare)
    before = len(out)
    out = out.dropna(subset=["lat", "lon"]).copy()
    out = out[out["lat"].between(32, 43) & out["lon"].between(-125, -113)].copy()

    date_col = find_fire_start_date_col(cols)
    month_col = find_col(cols, lambda c: "fire start" in c and "month" in c)
    day_col = find_col(cols, lambda c: "fire start" in c and re.search(r"\bday\b", c) is not None)
    year_col = find_col(cols, lambda c: "fire start" in c and re.search(r"\byear\b", c) is not None)
    samples = []
    # Prefer rows whose raw date looks like a 2-digit-year string when present
    sample_idx = list(out.head(8).index)
    for i in sample_idx:
        if len(samples) >= 5:
            break
        raw_bits = {}
        if date_col:
            raw_bits["date"] = df.at[i, date_col]
        if month_col and day_col and year_col:
            raw_bits["mdy"] = (df.at[i, month_col], df.at[i, day_col], df.at[i, year_col])
        samples.append({"raw": raw_bits, "parsed": out.at[i, "date"]})

    meta = {
        "date_method": date_method,
        "lat_col": lat_col,
        "lon_col": lon_col,
        "rows_in": before,
        "rows_out": len(out),
        "samples": samples,
        "date_col": date_col,
        "mdy_cols": (month_col, day_col, year_col),
    }
    return out.reset_index(drop=True), meta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--years",
        default=f"{YEAR_MIN}-{YEAR_MAX}",
        help="Year range inclusive, e.g. 2020-2025",
    )
    args = parser.parse_args()
    y0, y1 = [int(x) for x in args.years.split("-")]

    _, cache_dir, out_csv = script_paths()
    cache_dir.mkdir(parents=True, exist_ok=True)

    print(f"Fetching index page: {PAGE_URL}")
    html = fetch(PAGE_URL).decode("utf-8", "replace")
    links = parse_section_links(html)
    selected = [
        r
        for r in links
        if r["year"] is not None and y0 <= r["year"] <= y1
    ]
    # Prefer one file per utility/year (first occurrence in page order)
    chosen: dict[tuple[str, int], dict] = {}
    for row in selected:
        key = (row["utility"], row["year"])
        if key not in chosen:
            chosen[key] = row

    print(f"\nSelected {len(chosen)} utility/year workbooks ({y0}-{y1}):")
    for (util, year), row in sorted(chosen.items()):
        mismatch = row["filename_guess"] and row["filename_guess"] != util
        flag = " MISMATCH_FILENAME" if mismatch else ""
        print(f"  {util} {year}: {row['filename']}{flag}")

    frames = []
    date_examples: dict[str, list] = {}

    for (util, year), row in sorted(chosen.items()):
        dest = cache_dir / f"{util.lower()}_{year}.xlsx"
        print(f"\n=== {util} {year} ===")
        if row["filename_guess"] and row["filename_guess"] != util:
            print(
                f"  WARNING: section={util} but filename suggests "
                f"{row['filename_guess']} ({row['filename']})"
            )
        try:
            download_cached(row["url"], dest)
            sheet_name, mode, cols, df = select_data_sheet(dest, util, year)
            norm, meta = extract_normalized(df, cols, util, year, dest.name)
            print(
                f"  normalized: {meta['rows_out']} rows "
                f"(from {meta['rows_in']}); date via {meta['date_method']}"
            )
            print(f"  lat/lon cols: {meta['lat_col']!r}, {meta['lon_col']!r}")
            date_examples.setdefault(util, [])
            # Prefer later years for display samples (SCE 2024 has 2-digit strings;
            # SDGE 2024 has MDY parts). Keep first 5 overall, then overwrite with
            # 2024/2025 samples when available.
            for sample in meta["samples"]:
                date_examples[util].append({"year": year, **sample})
            # Keep at most 5, preferring year>=2024
            pref = [s for s in date_examples[util] if s["year"] >= 2024]
            other = [s for s in date_examples[util] if s["year"] < 2024]
            date_examples[util] = (pref + other)[:5]
            frames.append(norm)
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR: failed to process {util} {year}: {exc}")
            continue

    print("\n" + "=" * 72)
    print("DATE PARSE EXAMPLES (raw -> parsed) — review before trusting concat")
    print("=" * 72)
    for util in ("PGE", "SCE", "SDGE", "PACIFICORP"):
        samples = date_examples.get(util) or []
        print(f"\n{util}:")
        if not samples:
            print("  (no rows)")
            continue
        for s in samples:
            print(f"  [{s['year']}] raw={s['raw']!r} -> parsed={s['parsed']}")

    if not frames:
        print("No data frames produced.", file=sys.stderr)
        return 1

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["utility", "date", "lat", "lon"], na_position="last")
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(out_csv, index=False)
    print(f"\nWrote {len(combined)} rows -> {out_csv}")
    print(combined.groupby(["utility", "year"]).size().unstack(fill_value=0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
