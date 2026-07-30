"""
Playwright browser test for CPUC meeting map feedback changes.

Run against local server (default http://127.0.0.1:8123):
  python scripts/test_map_feedback.py

Screenshots land in scripts/test_map_feedback_output/
"""
from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path(__file__).resolve().parent / "test_map_feedback_output"
BASE_URL = "http://127.0.0.1:8123"
TARGET_CIRCUIT_ID = "183052113"
TARGET_YEAR = 2024
UTILITY = "SCE"


def load_expected_epss_count(circuit_id: str, year: int) -> tuple[int, str]:
    path = ROOT / "assets" / "data" / "epss_outages.csv"
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    matched = [
        r
        for r in rows
        if r.get("circuit_id", "").strip().zfill(9) == circuit_id
        and int(r["year"]) == year
    ]
    name = matched[0].get("circuit") or matched[0].get("name") if matched else circuit_id
    return len(matched), name


def load_expected_point_counts(year: int, utility: str) -> dict[str, int]:
    cpuc_path = ROOT / "assets" / "data" / "cpuc_fire_incidents_combined.csv"
    calfire_path = ROOT / "assets" / "data" / "calfire_incidents.csv"
    cpuc = list(csv.DictReader(cpuc_path.open(encoding="utf-8")))
    calfire = list(csv.DictReader(calfire_path.open(encoding="utf-8")))

    def calfire_year_ok(r) -> bool:
        date = (r.get("incident_dateonly_created") or "").strip()
        m = re.match(r"^(\d{4})", date)
        if not m or int(m.group(1)) != year:
            return False
        try:
            lat = float(r["incident_latitude"])
            lon = float(r["incident_longitude"])
        except (TypeError, ValueError):
            return False
        return 32 <= lat <= 43 and -125 <= lon <= -113

    return {
        "cpuc_all": sum(1 for r in cpuc if int(r["year"]) == year),
        "cpuc_util": sum(
            1 for r in cpuc if int(r["year"]) == year and r.get("utility", "").strip() == utility
        ),
        "calfire_all": sum(1 for r in calfire if calfire_year_ok(r)),
        "calfire_util": sum(
            1
            for r in calfire
            if calfire_year_ok(r) and (r.get("utility") or "").strip() == utility
        ),
    }


def load_circuit_midpoint(circuit_id: str) -> tuple[float, float]:
    geo = json.loads((ROOT / "assets" / "data" / "epss_circuits.geojson").read_text(encoding="utf-8"))
    feat = next(f for f in geo["features"] if f["properties"]["circuit_id"] == circuit_id)
    line = feat["geometry"]["coordinates"][0]
    lon, lat = line[len(line) // 2]
    return lat, lon


def rgb_to_hex(rgb: str) -> str | None:
    m = re.match(r"rgba?\((\d+),\s*(\d+),\s*(\d+)", rgb or "")
    if not m:
        return None
    return "#{:02x}{:02x}{:02x}".format(int(m.group(1)), int(m.group(2)), int(m.group(3)))


def set_layer(page, key: str, enabled: bool) -> None:
    sel = f'#historical-layer-toggles label[data-layer-key="{key}"] input[type="checkbox"]'
    box = page.locator(sel)
    box.wait_for(state="attached", timeout=15000)
    checked = box.is_checked()
    if checked != enabled:
        box.click()


def set_year(page, year: int) -> None:
    years = [2020, 2021, 2022, 2023, 2024, 2025]
    idx = years.index(year)
    page.locator("#historical-year").evaluate(
        """(el, value) => {
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        idx,
    )
    page.wait_for_timeout(400)


def screenshot(page, name: str) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    return path


def map_stats(page) -> dict:
    return page.evaluate(
        """() => {
          const mapEl = document.getElementById('historical-map');
          const zoom = mapEl && mapEl._leaflet_map ? null : null;
          // Leaflet attaches the map via private id registry; find via panes.
          const overlay = mapEl.querySelector('.leaflet-overlay-pane');
          const paths = overlay ? [...overlay.querySelectorAll('path')] : [];
          const circles = overlay ? [...overlay.querySelectorAll('circle')] : [];
          const markerIcons = mapEl.querySelectorAll('.leaflet-marker-icon, .marker-cluster').length;
          const lines = paths.filter(p => {
            const fill = (p.getAttribute('fill') || '').toLowerCase();
            const fillOp = p.getAttribute('fill-opacity');
            return fill === 'none' || fillOp === '0' || fillOp === '0.0';
          });
          const filled = paths.filter(p => {
            const fill = (p.getAttribute('fill') || '').toLowerCase();
            const fillOp = p.getAttribute('fill-opacity');
            if (fill === 'none') return false;
            if (fillOp === '0' || fillOp === '0.0') return false;
            return true;
          });
          // Recover Leaflet map from any layer
          let map = null;
          if (window.L) {
            mapEl.querySelectorAll('.leaflet-pane').forEach(() => {});
            // Walk Leaflet internal id map
            for (const key of Object.keys(mapEl)) {
              if (key.startsWith('_leaflet') && mapEl[key] && mapEl[key].getZoom) {
                map = mapEl[key];
              }
            }
          }
          // Standard: L.Map stores on container via leaflet_id lookup in L.Util
          if (!map && window.L && L.DomUtil) {
            const id = mapEl._leaflet_id;
            if (id != null && L.Map && L.Map._instances) {
              map = L.Map._instances[id];
            }
          }
          // Fallback: search layers with getBounds from path events
          let zoomVal = null, center = null, bounds = null;
          const anyPath = paths[0];
          if (anyPath && anyPath._leaflet_events) {}
          // Use Leaflet's internal map reference used by controls
          const zoomEl = mapEl.querySelector('.leaflet-control-zoom');
          // Brute-force: inspect all objects with getZoom on the map element tree
          const seen = new Set();
          function walk(obj, depth) {
            if (!obj || depth > 3 || seen.has(obj)) return;
            try { seen.add(obj); } catch (e) { return; }
            if (typeof obj.getZoom === 'function' && typeof obj.getBounds === 'function' && typeof obj.latLngToContainerPoint === 'function') {
              map = obj;
              return;
            }
            if (typeof obj === 'object') {
              for (const k of Object.keys(obj)) {
                if (k.startsWith('_') || k === 'parentNode') {
                  try { walk(obj[k], depth + 1); } catch (e) {}
                  if (map) return;
                }
              }
            }
          }
          walk(mapEl, 0);

          if (map) {
            zoomVal = map.getZoom();
            const c = map.getCenter();
            center = [c.lat, c.lng];
            const b = map.getBounds();
            bounds = {
              west: b.getWest(), east: b.getEast(),
              south: b.getSouth(), north: b.getNorth()
            };
          }

          // Count circleMarkers-like paths (filled small circles often use path with fill)
          return {
            pathCount: paths.length,
            circleElCount: circles.length,
            lineLikePathCount: lines.length,
            filledPathCount: filled.length,
            markerIconCount: markerIcons,
            zoom: zoomVal,
            center,
            bounds,
            sampleLineStroke: lines[0] ? getComputedStyle(lines[0]).stroke : null,
            sampleFilledFill: filled[0] ? getComputedStyle(filled[0]).fill : null,
            sampleFilledStroke: filled[0] ? getComputedStyle(filled[0]).stroke : null,
          };
        }"""
    )


def get_leaflet_map_via_click(page) -> None:
    """Ensure Leaflet map is findable by attaching a window hook via path listener."""
    page.evaluate(
        """() => {
          if (window.__sfpsTestMap) return;
          const mapEl = document.getElementById('historical-map');
          // Leaflet 1.x: map is stored in private stamp registry; recover from tile layer.
          const tiles = mapEl.querySelector('.leaflet-tile-pane');
          // Monkey-patch: listen once via Leaflet event on map container
          if (window.L) {
            // Create temporary map lookup by wrapping L.Map if already created — scan all stamped objects
            const stamped = [];
            const root = mapEl;
            const stack = [root];
            while (stack.length) {
              const el = stack.pop();
              if (!el) continue;
              if (el._leaflet_id != null) stamped.push(el);
              stack.push(...(el.children || []));
            }
            // Access Leaflet internal leaflet_id -> object via a dummy layer
            // Fallback: use first path's __leaflet private
          }
        }"""
    )


def attach_map_hook(page) -> bool:
    """Hook Leaflet map by intercepting from an existing layer's private _map."""
    return page.evaluate(
        """() => {
          const mapEl = document.getElementById('historical-map');
          if (window.__sfpsTestMap) return true;
          // Leaflet stores layer->_map; SVG paths created by vector layers have _leaflet_id
          // and the layer object is in L.Util.stamp registry? Not public.
          // Walk overlay pane children: in Leaflet, path._leaflet_events exists on DOM? No.
          // Use: any L.Path instance is not on DOM.

          // Reliable approach used by Leaflet debug: mapEl itself gets class leaflet-container
          // and L.Map assigns this._container = mapEl. Search via chrome-only?
          // Alternative: monkeypatch L.Map.addInitHook if too late.

          // Read from zoom control which has _map
          const zoomIn = mapEl.querySelector('.leaflet-control-zoom-in');
          if (zoomIn) {
            // Control DOM doesn't expose _map directly.
          }

          // Inject by temporarily creating a layer on every L.Layer
          if (!window.L) return false;

          // Patch Layer.onAdd to capture map — too late if already added.
          // Scan L namespace for map instances (not available).

          // Last resort: create a dummy control to grab map from mapEl via L.DomEvent?
          // Actually in Leaflet source Map._initControlPos uses this._container.
          // The container's leaflet_id maps via L.Util.stamp; objects are in
          // L.stamp registry private.

          // Use private: window.L.Map.prototype — find via
          for (const k in window) {
            try {
              const v = window[k];
              if (v && v instanceof L.Map) {
                window.__sfpsTestMap = v;
                return true;
              }
            } catch (e) {}
          }

          // Create a throwaway map? No — reuse by listening to zoom events fired on container
          let captured = null;
          const handler = (e) => {
            // not helpful
          };

          // Attach via L. DomUtil.get / existing tileLayer: tile layers have _map on JS objects
          // only, not DOM.

          // Force capture: add a control that stores map
          const C = L.Control.extend({
            onAdd(map) {
              window.__sfpsTestMap = map;
              const d = L.DomUtil.create('div');
              d.style.display = 'none';
              return d;
            }
          });
          new C({ position: 'bottomleft' }).addTo(
            // Need map reference — chicken and egg
            null
          );
          return false;
        }"""
    )


def hook_leaflet_map(page) -> bool:
    """Capture the live L.Map without synthesizing coordinate-less DOM clicks.

    Synthetic `click` events without clientX/clientY make Leaflet
    layerPointToLatLng throw Invalid LatLng (NaN, NaN).
    """
    return page.evaluate(
        """() => {
          if (window.__sfpsTestMap) return true;
          if (!window.L) return false;
          const proto = L.Map.prototype;
          const wrap = (name) => {
            const orig = proto[name];
            if (!orig || orig.__sfpsHooked) return;
            const hooked = function(...args) {
              window.__sfpsTestMap = this;
              return orig.apply(this, args);
            };
            hooked.__sfpsHooked = true;
            proto[name] = hooked;
          };
          ['setView', 'fitBounds', 'invalidateSize', 'getCenter', 'eachLayer'].forEach(wrap);

          // Safe capture: zoom controls call map methods with a real map instance.
          const zoomIn = document.querySelector('#historical-map .leaflet-control-zoom-in');
          if (zoomIn) {
            zoomIn.click();
            const zoomOut = document.querySelector('#historical-map .leaflet-control-zoom-out');
            if (zoomOut) zoomOut.click();
          }
          // Utility filter change calls setView/fitBounds in app code.
          return !!window.__sfpsTestMap;
        }"""
    )


def click_latlng(page, lat: float, lon: float) -> None:
    page.evaluate(
        """({ lat, lon }) => {
          const map = window.__sfpsTestMap;
          if (!map) throw new Error('map hook missing');
          const pt = map.latLngToContainerPoint([lat, lon]);
          const rect = map.getContainer().getBoundingClientRect();
          const x = rect.left + pt.x;
          const y = rect.top + pt.y;
          const el = document.elementFromPoint(x, y);
          if (el) {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y, view: window }));
          }
          return { x, y, tag: el && el.tagName };
        }""",
        {"lat": lat, "lon": lon},
    )


def count_layer_paths(page) -> dict:
    """Count SVG geometry currently on the map overlay."""
    return page.evaluate(
        """() => {
          const mapEl = document.getElementById('historical-map');
          const overlay = mapEl.querySelector('.leaflet-overlay-pane svg');
          if (!overlay) return { paths: 0, circles: 0, linePaths: 0, filledPaths: 0 };
          const paths = [...overlay.querySelectorAll('path')];
          const circles = [...overlay.querySelectorAll('circle')];
          const linePaths = paths.filter(p => {
            const fill = (p.getAttribute('fill') || '').toLowerCase();
            return fill === 'none';
          });
          const filledPaths = paths.filter(p => {
            const fill = (p.getAttribute('fill') || '').toLowerCase();
            return fill !== 'none' && fill !== '';
          });
          return {
            paths: paths.length,
            circles: circles.length,
            linePaths: linePaths.length,
            filledPaths: filledPaths.length,
            markerClusters: mapEl.querySelectorAll('.marker-cluster').length,
            markerIcons: mapEl.querySelectorAll('.leaflet-marker-icon').length,
          };
        }"""
    )


def count_circle_markers_via_map(page) -> dict:
    return page.evaluate(
        """() => {
          const map = window.__sfpsTestMap;
          if (!map) return { error: 'no map' };
          // Leaflet promotes nested layers onto the map, so dedupe by _leaflet_id.
          const seen = new Set();
          let circleMarkers = 0;
          let polylines = 0;
          let polygons = 0;
          const geoJsonGroupsByCircuit = {};

          map.eachLayer(layer => {
            const id = layer._leaflet_id;
            if (id != null) {
              if (seen.has(id)) return;
              seen.add(id);
            }
            if (layer instanceof L.CircleMarker && !(layer instanceof L.Circle)) {
              circleMarkers += 1;
            }
            if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
              polylines += 1;
            }
            if (layer instanceof L.Polygon) {
              polygons += 1;
            }
            // Count each circuit GeoJSON group once (renderEpssCircuitLayers adds one per circuit).
            if (layer instanceof L.GeoJSON) {
              const circuitIds = new Set();
              layer.eachLayer(sub => {
                const cid = sub.feature && sub.feature.properties && sub.feature.properties.circuit_id;
                if (cid) circuitIds.add(String(cid).padStart(9, '0'));
              });
              circuitIds.forEach(cid => {
                geoJsonGroupsByCircuit[cid] = (geoJsonGroupsByCircuit[cid] || 0) + 1;
              });
            }
          });
          return {
            circleMarkers,
            polylines,
            polygons,
            uniqueCircuits: Object.keys(geoJsonGroupsByCircuit).length,
            targetCircuitGroupCount: geoJsonGroupsByCircuit['183052113'] || 0,
            geoJsonGroupsByCircuitSample: Object.entries(geoJsonGroupsByCircuit).slice(0, 5),
          };
        }"""
    )


def open_circuit_popup(page, circuit_id: str) -> str:
    return page.evaluate(
        """(circuitId) => {
          const map = window.__sfpsTestMap;
          if (!map) throw new Error('no map');
          let found = null;
          const seen = new Set();
          map.eachLayer(layer => {
            if (layer._leaflet_id != null) {
              if (seen.has(layer._leaflet_id)) return;
              seen.add(layer._leaflet_id);
            }
            // Popup is bound on the L.GeoJSON group, not each MultiLineString part.
            if (layer instanceof L.GeoJSON) {
              let match = false;
              layer.eachLayer(sub => {
                const cid = sub.feature && sub.feature.properties && sub.feature.properties.circuit_id;
                if (cid && String(cid).padStart(9, '0') === circuitId) match = true;
              });
              if (match) found = layer;
            }
          });
          if (!found) return '';
          found.openPopup();
          const popup = document.querySelector('.leaflet-popup-content');
          return popup ? popup.innerText : '';
        }""",
        circuit_id,
    )


def open_psps_popup_and_colors(page) -> dict:
    return page.evaluate(
        """() => {
          const map = window.__sfpsTestMap;
          if (!map) return { error: 'no map' };
          let poly = null;
          map.eachLayer(layer => {
            const visit = (ly) => {
              if (ly.feature && ly.feature.properties && ly.feature.properties.IOU != null) {
                poly = ly;
              }
              if (ly instanceof L.Polygon && ly.feature && ly.feature.properties &&
                  ly.feature.properties.EventName != null) {
                poly = ly;
              }
              if (ly.eachLayer) ly.eachLayer(visit);
            };
            visit(layer);
          });
          if (!poly) {
            // any filled path style from PSPS layer group
            const paths = [...document.querySelectorAll('#historical-map .leaflet-overlay-pane path')];
            const filled = paths.filter(p => (p.getAttribute('fill')||'').toLowerCase() !== 'none');
            if (!filled.length) return { error: 'no polygon path' };
            const cs = getComputedStyle(filled[0]);
            return {
              fill: cs.fill,
              stroke: cs.stroke,
              fillHex: null,
              via: 'dom-fallback',
              pathCount: filled.length,
            };
          }
          poly.openPopup();
          const el = poly.getElement && poly.getElement();
          const cs = el ? getComputedStyle(el) : null;
          const opts = poly.options || {};
          return {
            fill: cs ? cs.fill : null,
            stroke: cs ? cs.stroke : null,
            optionColor: opts.color,
            optionFillColor: opts.fillColor,
            popup: (document.querySelector('.leaflet-popup-content') || {}).innerText || '',
            via: 'layer',
          };
        }"""
    )


def chart_trace_values(page) -> dict:
    """Read Plotly chart bar values by dataset label if present."""
    return page.evaluate(
        """() => {
          const el = document.getElementById('historical-summary-chart');
          if (!el || !el.data) return {};
          const out = {};
          el.data.forEach(trace => {
            if (trace.x && trace.y) {
              trace.x.forEach((label, i) => { out[label] = trace.y[i]; });
            }
            if (trace.labels && trace.values) {
              trace.labels.forEach((label, i) => { out[label] = trace.values[i]; });
            }
          });
          return out;
        }"""
    )


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    expected_count, circuit_name = load_expected_epss_count(TARGET_CIRCUIT_ID, TARGET_YEAR)
    expected_points = load_expected_point_counts(TARGET_YEAR, UTILITY)
    lat, lon = load_circuit_midpoint(TARGET_CIRCUIT_ID)

    results: list[tuple[str, bool, str]] = []
    console_lines: list[str] = []
    screenshots: list[Path] = []

    print(f"Expected EPSS events for {circuit_name} ({TARGET_CIRCUIT_ID}) in {TARGET_YEAR}: {expected_count}")
    print(f"Expected CPUC {UTILITY}/{TARGET_YEAR}: {expected_points['cpuc_util']} (all: check decrease)")
    print(f"Expected CAL FIRE {UTILITY}/{TARGET_YEAR}: {expected_points['calfire_util']}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        def on_console(msg):
            console_lines.append(f"[{msg.type}] {msg.text}")

        def on_request_failed(request):
            console_lines.append(
                f"[requestfailed] {request.method} {request.url} -> {request.failure}"
            )

        def on_response(response):
            if response.status >= 400:
                console_lines.append(f"[http{response.status}] {response.url}")

        page.on("console", on_console)
        page.on("pageerror", lambda err: console_lines.append(f"[pageerror] {err}"))
        page.on("requestfailed", on_request_failed)
        page.on("response", on_response)

        # --- Step 1: open tab ---
        page.goto(f"{BASE_URL}/", wait_until="domcontentloaded", timeout=60000)
        page.locator("#sfps-tab-btn-historical").click()
        page.locator("#historical-map").wait_for(state="visible", timeout=15000)
        # Wait for data load (CAL FIRE log or layer toggles populated)
        page.wait_for_function(
            """() => {
              const toggles = document.querySelectorAll('#historical-layer-toggles label[data-layer-key]');
              return toggles.length >= 4;
            }""",
            timeout=60000,
        )
        page.wait_for_timeout(1500)
        hook_leaflet_map(page)
        if not page.evaluate("() => !!window.__sfpsTestMap"):
            # App calls setView on All-utilities; cycle utility to capture map.
            page.locator("#historical-utility-filter").select_option(label="PGE")
            page.wait_for_timeout(400)
            page.locator("#historical-utility-filter").select_option(value="")
            page.wait_for_timeout(400)
            hook_leaflet_map(page)

        set_year(page, TARGET_YEAR)
        page.wait_for_timeout(800)
        if not page.evaluate("() => !!window.__sfpsTestMap"):
            page.locator("#historical-utility-filter").select_option(value="")
            page.wait_for_timeout(300)
            hook_leaflet_map(page)

        screenshots.append(screenshot(page, "01_map_tab_open"))
        tab_ok = page.locator("#sfps-tab-historical.is-active").count() == 1
        results.append(("1. Open Wildfire & Outage Map tab", tab_ok, f"active={tab_ok}, mapHooked={page.evaluate('() => !!window.__sfpsTestMap')}"))

        # --- Step 2: EPSS lines ---
        set_layer(page, "cpuc", False)
        set_layer(page, "calfire", False)
        set_layer(page, "pspsEvents", False)
        set_layer(page, "fireWeather", False)
        set_layer(page, "epss", True)
        page.locator("#historical-utility-filter").select_option(value="")
        page.wait_for_timeout(1000)
        hook_leaflet_map(page)
        if not page.evaluate("() => !!window.__sfpsTestMap"):
            page.locator("#historical-utility-filter").select_option(label="PGE")
            page.wait_for_timeout(500)
            page.locator("#historical-utility-filter").select_option(value="")
            page.wait_for_timeout(500)
            hook_leaflet_map(page)

        layer_counts = count_circle_markers_via_map(page)
        dom_counts = count_layer_paths(page)
        screenshots.append(screenshot(page, "02_epss_lines_only"))

        popup_text = ""
        if page.evaluate("() => !!window.__sfpsTestMap"):
            popup_text = open_circuit_popup(page, TARGET_CIRCUIT_ID)
            page.wait_for_timeout(400)
            screenshots.append(screenshot(page, "02b_epss_circuit_popup"))
        else:
            popup_text = ""

        # Parse event count from popup
        count_match = re.search(r"Events \(filtered\)\s*(\d+)", popup_text)
        popup_count = int(count_match.group(1)) if count_match else None
        # Also accept tooltip-style "N events"
        if popup_count is None:
            m2 = re.search(r"(\d+)\s*events?", popup_text, re.I)
            popup_count = int(m2.group(1)) if m2 else None

        epss_lines_ok = (
            page.evaluate("() => !!window.__sfpsTestMap")
            and layer_counts.get("circleMarkers", 999) == 0
            and layer_counts.get("targetCircuitGroupCount", 0) == 1
            and layer_counts.get("polylines", 0) > 0
            and popup_count == expected_count
            and (circuit_name.split()[0] in popup_text or TARGET_CIRCUIT_ID in popup_text)
        )
        results.append(
            (
                "2. EPSS renders as one circuit line with correct event count",
                epss_lines_ok,
                f"layer_counts={layer_counts}, dom={dom_counts}, popup_count={popup_count}, expected={expected_count}, popup={popup_text[:200]!r}",
            )
        )

        # --- Step 3: utility filter ---
        set_layer(page, "cpuc", True)
        set_layer(page, "calfire", True)
        set_layer(page, "epss", False)
        page.wait_for_timeout(500)

        before = page.evaluate(
            """() => {
              const map = window.__sfpsTestMap;
              if (!map) return null;
              const b = map.getBounds();
              return {
                zoom: map.getZoom(),
                center: [map.getCenter().lat, map.getCenter().lng],
                bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
              };
            }"""
        )
        counts_before = chart_trace_values(page)
        # Fallback point counts via map layers
        points_before = page.evaluate(
            """() => {
              const map = window.__sfpsTestMap;
              if (!map) return { circleMarkers: -1 };
              let circleMarkers = 0;
              map.eachLayer(layer => {
                const visit = (ly) => {
                  if (ly instanceof L.CircleMarker && !(ly instanceof L.Circle)) circleMarkers++;
                  if (ly.eachLayer) ly.eachLayer(visit);
                };
                visit(layer);
              });
              return { circleMarkers };
            }"""
        )

        page.locator("#historical-utility-filter").select_option(value=UTILITY)
        page.wait_for_timeout(1000)
        screenshots.append(screenshot(page, "03_utility_sce_selected"))

        after = page.evaluate(
            """() => {
              const map = window.__sfpsTestMap;
              if (!map) return null;
              const b = map.getBounds();
              return {
                zoom: map.getZoom(),
                center: [map.getCenter().lat, map.getCenter().lng],
                bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
                territoryPolygons: (() => {
                  let n = 0;
                  map.eachLayer(layer => {
                    const visit = (ly) => {
                      if (ly.feature && ly.feature.properties && ly.feature.properties.utility === 'SCE') n++;
                      if (ly.eachLayer) ly.eachLayer(visit);
                    };
                    visit(layer);
                  });
                  return n;
                })()
              };
            }"""
        )
        points_after = page.evaluate(
            """() => {
              const map = window.__sfpsTestMap;
              if (!map) return { circleMarkers: -1 };
              let circleMarkers = 0;
              map.eachLayer(layer => {
                const visit = (ly) => {
                  if (ly instanceof L.CircleMarker && !(ly instanceof L.Circle)) circleMarkers++;
                  if (ly.eachLayer) ly.eachLayer(visit);
                };
                visit(layer);
              });
              return { circleMarkers };
            }"""
        )
        counts_after = chart_trace_values(page)

        bounds_changed = before and after and before["bounds"] != after["bounds"]
        zoom_changed = before and after and before["zoom"] != after["zoom"]
        territory_ok = after and after.get("territoryPolygons", 0) >= 1
        points_decreased = (
            points_before.get("circleMarkers", 0) > points_after.get("circleMarkers", 0)
            and points_after.get("circleMarkers", 0) > 0
        )
        # Also verify against CSV expectations via chart if available
        util_ok = territory_ok and (bounds_changed or zoom_changed) and points_decreased
        results.append(
            (
                "3. Utility select shows IOU boundary, zooms, filters points",
                util_ok,
                f"before={before}, after={after}, points_before={points_before}, points_after={points_after}, chart_before={counts_before}, chart_after={counts_after}, expected_cpuc_util={expected_points['cpuc_util']}, expected_calfire_util={expected_points['calfire_util']}",
            )
        )

        # --- Step 4: reset All utilities ---
        page.locator("#historical-utility-filter").select_option(value="")
        page.wait_for_timeout(1000)
        screenshots.append(screenshot(page, "04_all_utilities_reset"))
        reset = page.evaluate(
            """() => {
              const map = window.__sfpsTestMap;
              if (!map) return null;
              let territory = 0;
              map.eachLayer(layer => {
                const visit = (ly) => {
                  if (ly.feature && ly.feature.properties && ly.feature.properties.utility &&
                      ly.feature.properties.utility_name) territory++;
                  if (ly.eachLayer) ly.eachLayer(visit);
                };
                visit(layer);
              });
              const c = map.getCenter();
              return {
                zoom: map.getZoom(),
                center: [c.lat, c.lng],
                territoryPolygons: territory
              };
            }"""
        )
        reset_ok = (
            reset
            and reset.get("territoryPolygons", 1) == 0
            and reset.get("zoom") == 6
            and abs(reset["center"][0] - 37.6) < 0.15
            and abs(reset["center"][1] - (-120.8)) < 0.15
        )
        results.append(
            (
                "4. All utilities removes boundary and resets statewide view",
                reset_ok,
                f"reset={reset}",
            )
        )

        # --- Step 5: PSPS blue ---
        set_layer(page, "pspsEvents", True)
        set_layer(page, "cpuc", False)
        set_layer(page, "calfire", False)
        set_layer(page, "epss", False)
        set_layer(page, "fireWeather", False)
        page.wait_for_timeout(800)
        psps_info = open_psps_popup_and_colors(page)
        page.wait_for_timeout(300)
        screenshots.append(screenshot(page, "05_psps_blue"))

        fill_hex = rgb_to_hex(psps_info.get("fill") or "")
        stroke_hex = rgb_to_hex(psps_info.get("stroke") or "")
        option_color = (psps_info.get("optionColor") or "").lower()
        option_fill = (psps_info.get("optionFillColor") or "").lower()
        blue_ok = (
            option_color in {"#1d6fa5", "rgb(29, 111, 165)"}
            or option_fill in {"#1d6fa5", "rgb(29, 111, 165)"}
            or fill_hex == "#1d6fa5"
            or stroke_hex in {"#1d6fa5", "#155a85"}
        ) and not (
            (fill_hex == "#7c3aed")
            or (stroke_hex == "#7c3aed")
            or option_color == "#7c3aed"
        )
        results.append(
            (
                "5. PSPS polygon color is blue (#1d6fa5), not purple",
                blue_ok,
                f"psps_info={psps_info}, fill_hex={fill_hex}, stroke_hex={stroke_hex}",
            )
        )

        # --- Step 6: fresh reload CAL FIRE ---
        console_lines.append("--- RELOAD FOR CAL FIRE CHECK ---")
        page.goto(f"{BASE_URL}/", wait_until="domcontentloaded", timeout=60000)
        page.locator("#sfps-tab-btn-historical").click()
        page.wait_for_function(
            """() => document.querySelectorAll('#historical-layer-toggles label[data-layer-key]').length >= 4""",
            timeout=60000,
        )
        page.wait_for_timeout(2500)
        screenshots.append(screenshot(page, "06_calfire_fresh_reload"))

        calfire_warns = [
            line
            for line in console_lines
            if "CAL FIRE:" in line
            and ("[warning]" in line or "failed to load" in line or "0 rows" in line)
        ]
        calfire_logs = [line for line in console_lines if "CAL FIRE:" in line]
        # Pass if we got a positive load log and no failure warns
        load_ok = any(
            re.search(r"CAL FIRE: (\d+) rows", line) and int(re.search(r"CAL FIRE: (\d+) rows", line).group(1)) > 0
            for line in calfire_logs
        )
        no_fail_warn = not any("failed to load" in line or "0 rows loaded" in line for line in calfire_warns)
        # Also no pageerrors after reload section — checked in step 7
        results.append(
            (
                "6. Fresh reload: CAL FIRE loads without failure console.warn",
                load_ok and no_fail_warn,
                f"calfire_logs={calfire_logs}, calfire_warns={calfire_warns}",
            )
        )

        # --- Step 7: console errors ---
        # Exclude sparse-checkout 404s for historical plot PNGs (local clone often
        # omits assets/website_plots/plots). Still fail on pageerror / other errors.
        historical_plot_404s = [
            line
            for line in console_lines
            if line.startswith("[http404]")
            and ("historical%20plots" in line or "historical plots" in line)
        ]
        resource_error_budget = len(historical_plot_404s)

        errors = []
        resource_errors_seen = 0
        for line in console_lines:
            if line.startswith("[pageerror]"):
                errors.append(line)
                continue
            if not line.startswith("[error]"):
                continue
            lower = line.lower()
            if "favicon" in lower:
                continue
            if "failed to load resource" in lower and resource_errors_seen < resource_error_budget:
                resource_errors_seen += 1
                continue
            errors.append(line)

        results.append(
            (
                "7. No browser console errors across the run",
                len(errors) == 0,
                f"errors={errors}, ignored_historical_plot_404s={len(historical_plot_404s)}",
            )
        )

        browser.close()

    # Write console log
    log_path = OUT_DIR / "console.log"
    log_path.write_text("\n".join(console_lines) + "\n", encoding="utf-8")

    print("\n===== RESULTS =====")
    all_pass = True
    for name, ok, detail in results:
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"{status}: {name}")
        print(f"       {detail}")

    print("\n===== SCREENSHOTS =====")
    for path in screenshots:
        print(path)

    print(f"\n===== CONSOLE LOG =====\n{log_path}")
    print(f"\nFull console ({len(console_lines)} lines):")
    print("\n".join(console_lines))

    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
