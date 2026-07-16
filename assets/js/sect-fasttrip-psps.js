(() => {
  const root = document.getElementById("sect-fasttrip-psps");
  if (!root) return;

  const basePath = root.dataset.basePath || "";
  const manifestUrl = `${basePath}/assets/website_plots/manifest.json`;

  const imageStatus = document.getElementById("image-status");
  const imageParams = document.getElementById("image-params");
  const decisionImage = document.getElementById("decision-image");
  const resetPart2Button = document.getElementById("reset-part2");
  const downloadResultsButton = document.getElementById("download-results");

  const historicalYearInput = document.getElementById("historical-year");
  const historicalYearValue = document.getElementById("historical-year-value");
  const historicalYearPlay = document.getElementById("historical-year-play");
  const historicalCountyFilter = document.getElementById("historical-county-filter");
  const historicalUtilityFilter = document.getElementById("historical-utility-filter");
  const historicalPlotsRank = document.getElementById("historical-plots-rank");
  const historicalPlotsSummary = document.getElementById("historical-plots-summary");
  const historicalLayerToggles = document.getElementById("historical-layer-toggles");
  const historicalMapEl = document.getElementById("historical-map");
  const historicalSummaryChartEl = document.getElementById("historical-summary-chart");
  const historicalChartToggle = document.getElementById("historical-chart-toggle");
  const weatherPlayBtn = document.getElementById("historical-weather-play");
  const weatherSpeedSelect = document.getElementById("historical-weather-speed");
  const weatherScrub = document.getElementById("historical-weather-scrub");
  const weatherDateEl = document.getElementById("historical-weather-date");
  const weatherLegendEl = document.getElementById("historical-weather-legend");
  const weatherAttributionEl = document.getElementById("historical-weather-attribution");
  const weatherSourceInfoBtn = document.getElementById("historical-weather-source-info");
  const weatherSourcePopover = document.getElementById("historical-weather-source-popover");

  const hyperparams = [
    "B_budget",
    "B_budget_multiplier",
    "C_budget",
    "C_budget_multiplier",
    "W_cap",
    "W_cap_multiplier",
    "alpha",
    "effective_alpha",
    "gamma_i_multiplier",
    "delta",
    "grouping_method",
    "ignitions",
    "mht_method"
  ];

  const paramLabels = {
    B_budget: "Fast-trip budget",
    B_budget_multiplier: "Fast-trip budget (% of circuits)",
    C_budget: "PSPS budget",
    C_budget_multiplier: "Sect. budget (% of circuits)",
    W_cap: "Reliability constraint (absolute)",
    W_cap_multiplier: "SAIFI",
    alpha: "FWER",
    effective_alpha: "Effectiveness of fast-trip (% of mitigation)",
    gamma_i_multiplier: "Reliability Impact of Fast-Trip",
    delta: "Reliability Impact of PSPS",
    grouping_method: "Declustering method",
    ignitions: "Ignitions",
    mht_method: "Decluster + MHT method"
  };

  /** Labels for Planning Tool (grid) sliders — folder names still encode a, C, B, W, ae, g, d. */
  const gridShortLabels = {
    W_cap_multiplier: "SAIFI Cap",
    C_budget_multiplier: "Sect. budget (% of circuits)",
    B_budget_multiplier: "Fast-trip budget (% of circuits)",
    effective_alpha: "Effectiveness of fast-trip (% of mitigation)",
    alpha: "FWER",
    gamma_i_multiplier: "Reliability Impact of Fast-Trip",
    delta: "Reliability Impact of PSPS",
    mht_method: "Method"
  };

  /** Slugs excluded from Planning Tool (grid) method dropdown and map image list. */
  const GRID_MHT_EXCLUDED_SLUGS = new Set(["group_conformal_oracle"]);

  /** Display labels for grid mode — internal CSV slugs unchanged for paths. */
  const gridMethodLabels = {
    group_conformal_fixed: "Ours (fix groups)",
    group_conformal_random: "Ours (random)",
    maxrank: "Max-Rank",
    ci: "C.I.",
    bonferroni: "Bonferroni",
    co_optimized: "Co-Optimized",
    planning_only: "Planning-Only"
  };

  const filterGridMhtValues = (values) =>
    values.filter((v) => !GRID_MHT_EXCLUDED_SLUGS.has(String(v)));

  /** Temporarily hide these grid slider values in the Planning Tool (numeric match). */
  const GRID_HIDDEN_SLIDER_VALUES = {
    W_cap_multiplier: [0.15],
    effective_alpha: [0.95]
  };

  /** When set, Planning Tool (grid) only offers these numeric values for the param. */
  const GRID_ALLOWED_SLIDER_VALUES = {
    B_budget_multiplier: [0.2],
    C_budget_multiplier: [0.3],
  };

  const filterGridHiddenSliderValues = (param, values) => {
    if (!gridPlotsMode) return values;
    const allowed = GRID_ALLOWED_SLIDER_VALUES[param];
    if (allowed?.length) {
      return values.filter((v) => {
        const n = Number(v);
        if (Number.isNaN(n)) return false;
        return allowed.some((a) => Math.abs(a - n) < 1e-9);
      });
    }
    const blocked = GRID_HIDDEN_SLIDER_VALUES[param];
    if (!blocked?.length) return values;
    return values.filter((v) => {
      const n = Number(v);
      if (Number.isNaN(n)) return true;
      return !blocked.some((b) => b === n);
    });
  };

  let dataset = [];
  let defaultCsvFile = "";
  let usingDefaultCsv = false;
  let imageMeta = [];
  let imageSuffixOptions = [];
  /** When true, maps/decision images load from assets/website_plots/grid_plots/… (merged_planning_grid.csv). */
  let gridPlotsMode = false;
  let imageSelection = {
    suffix: ""
  };
  const userSelected = new Set();

  const imageBasePath = `${basePath}/assets/website_plots/`;
  const fixedImageParams = {
    alpha: "0.1",
    mht_method: "Operational_MaxRank",
    gamma_i_multiplier: "0.5"
  };
  const historicalBasePath = `${basePath}/assets/website_plots/historical plots/`;

  const historicalYears = [2020, 2021, 2022, 2023, 2024, 2025];
  const historicalPlotDefinitions = [
    {
      key: "ignitions_population_map",
      label: "Ignition Map",
      filename: (year) => `ignitions_${year}_population_map.png`
    },
    {
      key: "pie_damage_pct",
      label: "Pct of Total Affected Customers",
      filename: (year) => `pie_damage_pct_${year}.png`
    },
    {
      key: "rank_damage_pct",
      label: "Pct of Total Affected Customers (Rank)",
      filename: (year) => `rank_damage_pct_${year}.png`
    },
    {
      key: "rank_ignition_x_pop",
      label: "Total Affected Customers (Rank)",
      filename: (year) => `rank_ignition_x_pop_${year}.png`
    },
    {
      key: "rank_ignitions",
      label: "Number of Ignitions (Rank)",
      filename: (year) => `rank_ignitions_${year}.png`
    }
  ];

  // ═══════════════════════════════════════════════════════════════════
  // Historical Data — interactive map + summary chart datasets.
  //
  // Each entry uses placeholder/sample data for now. To swap in a real
  // dataset later, just set `dataUrl` to a CSV with `lat`, `lon`, and
  // `year` columns (plus anything else you'd like in the popup) — that's
  // the only change needed. When `dataUrl` is set, it takes priority over
  // `sampleData` and is parsed with PapaParse.
  // ═══════════════════════════════════════════════════════════════════
  const HISTORICAL_DATASETS = {
    cpuc: {
      label: "CPUC Ignition Events",
      chartShortLabel: "CPUC Ignitions",
      color: "#c0440e", // var(--sfps-bonf)
      dataUrl: `${basePath}/assets/data/cpuc_ignitions.csv`,
      sampleData: [
        { lat: 39.76, lon: -121.62, year: 2020, name: "Butte County ignition" },
        { lat: 38.58, lon: -122.93, year: 2020, name: "Sonoma County ignition" },
        { lat: 40.59, lon: -122.39, year: 2021, name: "Shasta County ignition" },
        { lat: 37.87, lon: -122.27, year: 2021, name: "Alameda County ignition" },
        { lat: 36.78, lon: -119.42, year: 2021, name: "Fresno County ignition" },
        { lat: 39.16, lon: -121.34, year: 2022, name: "Yuba County ignition" },
        { lat: 34.42, lon: -119.7,  year: 2022, name: "Santa Barbara County ignition" },
        { lat: 38.9,  lon: -120.0,  year: 2022, name: "El Dorado County ignition" },
        { lat: 40.43, lon: -123.82, year: 2023, name: "Humboldt County ignition" },
        { lat: 37.3,  lon: -121.88, year: 2023, name: "Santa Clara County ignition" },
        { lat: 38.0,  lon: -122.5,  year: 2023, name: "Marin County ignition" },
        { lat: 39.5,  lon: -121.85, year: 2024, name: "Glenn County ignition" },
        { lat: 35.6,  lon: -118.85, year: 2024, name: "Kern County ignition" },
        { lat: 38.3,  lon: -121.0,  year: 2024, name: "Sacramento County ignition" }
      ]
    },
    epssPsps: {
      label: "EPSS / PSPS Outage Events",
      chartShortLabel: "EPSS / PSPS",
      color: "#1d6fa5", // var(--sfps-blue)
      dataUrl: `${basePath}/assets/data/epss_psps_outages.csv`,
      sampleData: [
        { lat: 39.9,  lon: -121.0,  year: 2020, name: "Plumas circuit de-energized" },
        { lat: 38.45, lon: -122.71, year: 2020, name: "Napa circuit fast-trip" },
        { lat: 37.5,  lon: -119.65, year: 2021, name: "Mariposa circuit de-energized" },
        { lat: 39.3,  lon: -121.6,  year: 2021, name: "Yuba circuit fast-trip" },
        { lat: 34.2,  lon: -118.9,  year: 2021, name: "Ventura circuit de-energized" },
        { lat: 38.7,  lon: -120.8,  year: 2022, name: "Amador circuit fast-trip" },
        { lat: 40.1,  lon: -122.2,  year: 2022, name: "Tehama circuit de-energized" },
        { lat: 36.9,  lon: -121.7,  year: 2022, name: "Monterey circuit fast-trip" },
        { lat: 39.0,  lon: -120.9,  year: 2023, name: "Placer circuit de-energized" },
        { lat: 37.0,  lon: -120.0,  year: 2023, name: "Madera circuit fast-trip" },
        { lat: 38.2,  lon: -122.65, year: 2024, name: "Sonoma circuit de-energized" },
        { lat: 35.9,  lon: -119.3,  year: 2024, name: "Tulare circuit fast-trip" },
        { lat: 40.3,  lon: -121.4,  year: 2024, name: "Lassen circuit de-energized" }
      ]
    }
  };

  // PSPS event polygons (GeoJSON) — separate from point datasets so they
  // are not clustered and are not counted in the Event Counts chart.
  const PSPS_EVENTS_LAYER = {
    key: "pspsEvents",
    label: "PSPS Event Areas",
    color: "#7c3aed", // var(--sfps-mr)
    dataUrl: `${basePath}/assets/data/psps_events.geojson`,
    style: {
      color: "#7c3aed",
      weight: 1.5,
      opacity: 0.9,
      fillColor: "#7c3aed",
      fillOpacity: 0.25
    },
    highlightStyle: {
      color: "#5b21b6",
      weight: 2.5,
      opacity: 1,
      fillColor: "#7c3aed",
      fillOpacity: 0.45
    }
  };

  const FIRE_WEATHER_LAYER = {
    key: "fireWeather",
    label: "Fire-Weather Danger",
    color: "#e34a33"
  };

  // Contour thresholds in encoded space (HDW = value * 2). Use 1 instead of 0
  // for Low so empty (0) cells outside California stay outside the contour.
  const WEATHER_THRESHOLD_BANDS = [
    { threshold: 1, encMin: 0, name: "Low", color: "#fee8c8", min_hdw: 0, max_hdw: 78 },
    { threshold: 39, encMin: 39, name: "Moderate", color: "#fdbb84", min_hdw: 78, max_hdw: 150 },
    { threshold: 75, encMin: 75, name: "High", color: "#e34a33", min_hdw: 150, max_hdw: 270 },
    { threshold: 135, encMin: 135, name: "Extreme", color: "#99000d", min_hdw: 270, max_hdw: null }
  ];

  let historicalMapInstance = null;
  let historicalLayerGroups = {};
  let historicalDatasetRecords = {};
  let historicalActiveLayers = new Set([
    ...Object.keys(HISTORICAL_DATASETS),
    PSPS_EVENTS_LAYER.key,
    FIRE_WEATHER_LAYER.key
  ]);
  let historicalChartType = "bar";
  let historicalMapChartInitialized = false;
  let historicalPspsGeoJson = null;
  let historicalPspsLayer = null;
  let historicalWeatherLayer = null;
  let historicalYearPlayTimer = null;

  const WEATHER_ANIM_BASE = `${basePath}/assets/data/weather_anim`;
  const WEATHER_UPSAMPLE = 4;
  const WEATHER_THRESHOLDS = [1, 39, 75, 135];
  const WEATHER_DAY_DURATION_MS = 100;
  const WEATHER_FILL_OPACITY = 0.55;
  const weatherDateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  let weatherMeta = null;
  let weatherCells = null;
  let weatherYearCache = {};
  let weatherAnimYear = null;
  let weatherAnimData = null;
  let weatherAnimDayT = 0;
  let weatherAnimPlaying = false;
  let weatherAnimRafId = null;
  let weatherAnimLastFrameMs = null;
  let weatherAnimSpeed = 1;
  let weatherAnimInitialized = false;
  let weatherAnimLoading = false;
  let weatherAnimLoadToken = 0;

  const loadHistoricalDatasetRecords = async (key) => {
    const config = HISTORICAL_DATASETS[key];
    if (!config) return [];
    if (!config.dataUrl) return config.sampleData || [];
    try {
      const response = await fetch(config.dataUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const rows = parseCsvText(text);
      return rows
        .map((row) => ({
          ...row,
          lat: Number(row.lat),
          lon: Number(row.lon),
          year: Number(row.year),
          name: row.name || row.description || config.label
        }))
        .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon) && Number.isFinite(row.year));
    } catch (error) {
      // Fall back to placeholder data if the real CSV isn't available yet.
      return config.sampleData || [];
    }
  };

  const loadHistoricalPspsEvents = async () => {
    try {
      const response = await fetch(PSPS_EVENTS_LAYER.dataUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      historicalPspsGeoJson = await response.json();
    } catch (error) {
      historicalPspsGeoJson = { type: "FeatureCollection", features: [] };
    }
  };

  const formatPspsPopupValue = (value) => {
    if (value === undefined || value === null || value === "") return "—";
    return String(value);
  };

  const buildHistoricalPopupTableHtml = (title, color, rows) => {
    const body = rows
      .map(
        ([label, value]) =>
          `<tr><th style="text-align:left;padding:0.15rem 0.5rem 0.15rem 0;color:#64748b;font-weight:600;white-space:nowrap;">${label}</th><td style="padding:0.15rem 0;">${value}</td></tr>`
      )
      .join("");
    return `<div style="font-family:Plus Jakarta Sans,-apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif;font-size:0.8rem;line-height:1.4;"><strong style="color:${color};">${title}</strong><table style="margin-top:0.4rem;border-collapse:collapse;">${body}</table></div>`;
  };

  const HISTORICAL_POINT_CRITICAL_COUNT_FIELDS = new Set([
    "medical_baseline",
    "life_support",
    "schools",
    "hospitals"
  ]);

  const HISTORICAL_POINT_NUMERIC_FIELDS = new Set([
    "customer_minutes",
    "restoration_min",
    ...HISTORICAL_POINT_CRITICAL_COUNT_FIELDS
  ]);

  const isHistoricalPointPopupValueEmpty = (fieldKey, value) => {
    if (value === undefined || value === null || value === "") return true;
    if (HISTORICAL_POINT_CRITICAL_COUNT_FIELDS.has(fieldKey)) {
      const num = Number(value);
      if (Number.isFinite(num) && num === 0) return true;
    }
    return false;
  };

  const formatHistoricalPointPopupValue = (fieldKey, value) => {
    if (HISTORICAL_POINT_NUMERIC_FIELDS.has(fieldKey)) {
      const num = Number(value);
      if (Number.isFinite(num)) return num.toLocaleString();
    }
    return String(value);
  };

  const buildHistoricalPointPopupHtml = (key, config, record) => {
    let rowDefs;
    if (key === "cpuc") {
      rowDefs = [
        ["Date", "date", record.date],
        ["Time", "time", record.time],
        ["Coordinates", "_coords", `${record.lat.toFixed(4)}, ${record.lon.toFixed(4)}`]
      ];
    } else if (key === "epssPsps") {
      rowDefs = [
        ["Circuit", "circuit", record.circuit],
        ["County", "county", record.county],
        ["Division", "division", record.division],
        ["Cause", "cause", record.cause],
        ["Outage Type", "outage_type", record.outage_type],
        ["Customer Minutes", "customer_minutes", record.customer_minutes],
        ["Restoration (min)", "restoration_min", record.restoration_min],
        ["Medical Baseline", "medical_baseline", record.medical_baseline],
        ["Life Support", "life_support", record.life_support],
        ["Schools", "schools", record.schools],
        ["Hospitals", "hospitals", record.hospitals]
      ];
    } else {
      rowDefs = [];
    }

    const rows = rowDefs
      .filter(([, fieldKey, value]) => !isHistoricalPointPopupValueEmpty(fieldKey, value))
      .map(([label, fieldKey, value]) => [
        label,
        fieldKey === "_coords" ? value : formatHistoricalPointPopupValue(fieldKey, value)
      ]);

    return buildHistoricalPopupTableHtml(config.label, config.color, rows);
  };

  const buildPspsPopupHtml = (properties) => {
    const p = properties || {};
    const rows = [
      ["Event Name", formatPspsPopupValue(p.EventName)],
      ["First Date of POC", formatPspsPopupValue(p.FirstDateofPOC)],
      ["IOU", formatPspsPopupValue(p.IOU)],
      ["De-energization Start Date", formatPspsPopupValue(p.DeEnergizationStartDate)],
      ["Full Restoration Date", formatPspsPopupValue(p.FullRestorationDate)],
      ["Customers De-energized", formatPspsPopupValue(p.CustomerDeEnergized)]
    ];
    return buildHistoricalPopupTableHtml(PSPS_EVENTS_LAYER.label, "#7c3aed", rows);
  };

  const appendHistoricalLayerToggle = (key, config) => {
    if (!historicalLayerToggles) return;
    const label = document.createElement("label");
    label.className = "sfps-layer-toggle is-active";
    label.dataset.layerKey = key;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        historicalActiveLayers.add(key);
      } else {
        historicalActiveLayers.delete(key);
      }
      label.classList.toggle("is-active", checkbox.checked);
      renderHistoricalMapAndChart(getCurrentHistoricalYear());
    });

    const dot = document.createElement("span");
    dot.className = "sfps-layer-toggle-dot";
    dot.style.background = config.color;

    const text = document.createElement("span");
    text.textContent = config.label;

    label.appendChild(checkbox);
    label.appendChild(dot);
    label.appendChild(text);
    historicalLayerToggles.appendChild(label);
  };

  const buildHistoricalLayerToggles = () => {
    if (!historicalLayerToggles) return;
    historicalLayerToggles.innerHTML = "";
    Object.entries(HISTORICAL_DATASETS).forEach(([key, config]) => {
      appendHistoricalLayerToggle(key, config);
    });
    appendHistoricalLayerToggle(PSPS_EVENTS_LAYER.key, PSPS_EVENTS_LAYER);
    appendHistoricalLayerToggle(FIRE_WEATHER_LAYER.key, FIRE_WEATHER_LAYER);
  };

  const createHistoricalClusterGroup = (config) => {
    if (typeof L.markerClusterGroup !== "function") {
      return L.layerGroup();
    }
    return L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        let sizeClass = " marker-cluster-small";
        if (count >= 100) sizeClass = " marker-cluster-large";
        else if (count >= 10) sizeClass = " marker-cluster-medium";
        return L.divIcon({
          html: `<div style="background-color:${config.color}"><span>${count}</span></div>`,
          className: `marker-cluster${sizeClass}`,
          iconSize: L.point(40, 40)
        });
      }
    });
  };

  const initHistoricalMap = () => {
    if (!historicalMapEl || typeof L === "undefined" || historicalMapInstance) return;
    historicalMapInstance = L.map(historicalMapEl, {
      scrollWheelZoom: false
    }).setView([37.6, -120.8], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 12
    }).addTo(historicalMapInstance);

    historicalWeatherLayer = L.geoJSON(null, {
      style(feature) {
        const color = feature?.properties?.color || FIRE_WEATHER_LAYER.color;
        return {
          fillColor: color,
          fillOpacity: WEATHER_FILL_OPACITY,
          stroke: false,
          weight: 0,
          opacity: 0
        };
      },
      interactive: false
    }).addTo(historicalMapInstance);

    // Polygons next so they sit beneath point markers / clusters.
    historicalPspsLayer = L.geoJSON(null, {
      style: () => PSPS_EVENTS_LAYER.style,
      onEachFeature(feature, layer) {
        const properties = feature.properties || {};
        layer.bindPopup(buildPspsPopupHtml(properties), { maxWidth: 320 });
        layer.on({
          mouseover(e) {
            e.target.setStyle(PSPS_EVENTS_LAYER.highlightStyle);
            if (!e.target.isPopupOpen()) e.target.openPopup();
          },
          mouseout(e) {
            if (historicalPspsLayer) historicalPspsLayer.resetStyle(e.target);
          }
        });
      }
    }).addTo(historicalMapInstance);

    Object.keys(HISTORICAL_DATASETS).forEach((key) => {
      const config = HISTORICAL_DATASETS[key];
      historicalLayerGroups[key] = createHistoricalClusterGroup(config).addTo(historicalMapInstance);
    });
  };

  const getCurrentHistoricalYear = () => {
    if (!historicalYearInput || !historicalYears.length) return historicalYears[0];
    return historicalYears[Number(historicalYearInput.value)] ?? historicalYears[0];
  };

  const titleCaseCounty = (value) =>
    String(value)
      .toLowerCase()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());

  const getSelectedHistoricalCounty = () =>
    historicalCountyFilter ? historicalCountyFilter.value : "";

  const getSelectedHistoricalUtility = () =>
    historicalUtilityFilter ? historicalUtilityFilter.value : "";

  const populateHistoricalCountyFilter = () => {
    if (!historicalCountyFilter) return;
    const previous = historicalCountyFilter.value;
    const byKey = new Map();
    (historicalDatasetRecords.epssPsps || []).forEach((record) => {
      const raw = String(record.county || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, titleCaseCounty(raw));
    });
    const counties = Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
    historicalCountyFilter.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All counties";
    historicalCountyFilter.appendChild(allOption);
    counties.forEach((county) => {
      const option = document.createElement("option");
      option.value = county;
      option.textContent = county;
      historicalCountyFilter.appendChild(option);
    });
    if (previous && counties.some((c) => c.toLowerCase() === previous.toLowerCase())) {
      const match = counties.find((c) => c.toLowerCase() === previous.toLowerCase());
      historicalCountyFilter.value = match;
    } else {
      historicalCountyFilter.value = "";
    }
  };

  const populateHistoricalUtilityFilter = () => {
    if (!historicalUtilityFilter) return;
    const previous = historicalUtilityFilter.value;
    const utilities = Array.from(
      new Set(
        (historicalPspsGeoJson?.features || [])
          .map((feature) => String(feature.properties?.IOU || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    historicalUtilityFilter.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All utilities";
    historicalUtilityFilter.appendChild(allOption);
    utilities.forEach((utility) => {
      const option = document.createElement("option");
      option.value = utility;
      option.textContent = utility;
      historicalUtilityFilter.appendChild(option);
    });
    historicalUtilityFilter.value = utilities.includes(previous) ? previous : "";
  };

  const renderHistoricalChart = (countsByDataset, year) => {
    if (!historicalSummaryChartEl || typeof Plotly === "undefined") return;
    const entries = Object.entries(HISTORICAL_DATASETS).filter(([key]) => historicalActiveLayers.has(key));
    const labels = entries.map(([, config]) => config.label);
    const shortLabels = entries.map(([, config]) => config.chartShortLabel || config.label);
    const colors = entries.map(([, config]) => config.color);
    const values = entries.map(([key]) => countsByDataset[key] || 0);

    const layout = {
      font: { family: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif", size: 12, color: "#1e293b" },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      showlegend: historicalChartType === "donut"
    };

    let data;
    if (historicalChartType === "donut") {
      layout.margin = { t: 10, r: 110, b: 10, l: 10 };
      layout.legend = {
        orientation: "v",
        yanchor: "middle",
        y: 0.5,
        x: 1.02,
        xanchor: "left",
        font: { size: 11 }
      };
      data = [{
        type: "pie",
        hole: 0.55,
        labels,
        values,
        marker: { colors },
        textinfo: "value",
        hovertemplate: "%{label}: %{value} events<extra></extra>"
      }];
    } else {
      layout.margin = { t: 10, r: 24, b: 36, l: 96 };
      layout.xaxis = {
        title: { text: "Event count", standoff: 8 },
        gridcolor: "#e2e8f0",
        zeroline: false,
        automargin: true,
        fixedrange: true
      };
      layout.yaxis = {
        automargin: true,
        tickfont: { size: 11 },
        fixedrange: true
      };
      data = [{
        type: "bar",
        orientation: "h",
        y: shortLabels,
        x: values,
        customdata: labels,
        marker: { color: colors },
        hovertemplate: "%{customdata}: %{x} events<extra></extra>"
      }];
    }

    const chartHeight = Math.max(320, historicalSummaryChartEl.clientHeight || 380);
    layout.height = chartHeight;
    layout.autosize = false;

    Plotly.react(historicalSummaryChartEl, data, layout, { displayModeBar: false, responsive: true });
  };

  const renderHistoricalMapAndChart = (year) => {
    const countsByDataset = {};
    const selectedCounty = getSelectedHistoricalCounty();
    const selectedUtility = getSelectedHistoricalUtility();
    const countyKey = selectedCounty ? selectedCounty.toLowerCase() : "";

    Object.entries(HISTORICAL_DATASETS).forEach(([key, config]) => {
      const records = historicalDatasetRecords[key] || [];
      let yearRecords = records.filter((record) => record.year === year);
      // County filter applies only to EPSS/PSPS point records (CPUC has no county).
      if (key === "epssPsps" && countyKey) {
        yearRecords = yearRecords.filter(
          (record) => String(record.county || "").trim().toLowerCase() === countyKey
        );
      }
      countsByDataset[key] = yearRecords.length;

      if (!historicalMapInstance) return;

      const group = historicalLayerGroups[key];
      if (!group) return;
      group.clearLayers();

      if (!historicalActiveLayers.has(key)) return;

      yearRecords.forEach((record) => {
        const marker = L.circleMarker([record.lat, record.lon], {
          radius: 6,
          color: config.color,
          fillColor: config.color,
          fillOpacity: 0.75,
          weight: 1.5
        });
        marker.bindPopup(buildHistoricalPointPopupHtml(key, config, record), { maxWidth: 320 });
        marker.addTo(group);
      });
    });

    if (historicalPspsLayer) {
      historicalPspsLayer.clearLayers();
      if (historicalActiveLayers.has(PSPS_EVENTS_LAYER.key) && historicalPspsGeoJson) {
        const yearFeatures = {
          type: "FeatureCollection",
          features: (historicalPspsGeoJson.features || []).filter((feature) => {
            if (Number(feature.properties?.year) !== year) return false;
            if (!selectedUtility) return true;
            return String(feature.properties?.IOU || "").trim() === selectedUtility;
          })
        };
        historicalPspsLayer.addData(yearFeatures);
        historicalPspsLayer.bringToBack();
      }
    }

    renderHistoricalChart(countsByDataset, year);
    drawWeatherContours();
  };

  const initHistoricalMapAndChart = async () => {
    if (!historicalMapEl || !historicalSummaryChartEl) return;
    buildHistoricalLayerToggles();
    initHistoricalMap();

    const keys = Object.keys(HISTORICAL_DATASETS);
    const [pointResults] = await Promise.all([
      Promise.all(keys.map((key) => loadHistoricalDatasetRecords(key))),
      loadHistoricalPspsEvents()
    ]);
    keys.forEach((key, idx) => {
      historicalDatasetRecords[key] = pointResults[idx];
    });

    populateHistoricalCountyFilter();
    populateHistoricalUtilityFilter();

    if (historicalCountyFilter) {
      historicalCountyFilter.addEventListener("change", () => {
        renderHistoricalMapAndChart(getCurrentHistoricalYear());
      });
    }
    if (historicalUtilityFilter) {
      historicalUtilityFilter.addEventListener("change", () => {
        renderHistoricalMapAndChart(getCurrentHistoricalYear());
      });
    }

    if (historicalChartToggle) {
      historicalChartToggle.querySelectorAll(".sfps-chart-toggle-btn").forEach((button) => {
        button.addEventListener("click", () => {
          historicalChartType = button.dataset.chartType || "bar";
          historicalChartToggle.querySelectorAll(".sfps-chart-toggle-btn").forEach((btn) => {
            btn.classList.toggle("is-active", btn === button);
          });
          renderHistoricalMapAndChart(getCurrentHistoricalYear());
        });
      });
    }

    renderHistoricalMapAndChart(getCurrentHistoricalYear());
    initWeatherAnim();
  };

  const ensureHistoricalMapAndChart = () => {
    if (!historicalMapChartInitialized) {
      historicalMapChartInitialized = true;
      initHistoricalMapAndChart();
      return;
    }
    if (historicalMapInstance) historicalMapInstance.invalidateSize();
    if (historicalSummaryChartEl && typeof Plotly !== "undefined" && historicalSummaryChartEl.data) {
      Plotly.Plots.resize(historicalSummaryChartEl);
    }
    if (weatherAnimInitialized && weatherAnimData && !weatherAnimLoading) {
      drawWeatherContours();
    }
  };

  const setStatus = (el, message, isError = false) => {
    if (!el) return;
    const showErr = isError && !!message;
    el.textContent = message || "";
    el.classList.toggle("sfps-status--error", showErr);
    if (!showErr) el.style.color = "";
  };

  const applyFixedImageParams = () => {
    if (gridPlotsMode) return;
    Object.entries(fixedImageParams).forEach(([param, value]) => {
      imageSelection[param] = value;
      userSelected.add(param);
    });
  };

  const renderHistoricalPlots = (year) => {
    if (!historicalPlotsRank || !historicalPlotsSummary) return;
    historicalPlotsRank.innerHTML = "";
    historicalPlotsSummary.innerHTML = "";
    historicalPlotDefinitions.forEach((plot) => {
      const wrapper = document.createElement("div");
      wrapper.className = "sfps-historical-item";

      const title = document.createElement("div");
      title.className = "sfps-historical-title";
      title.textContent = plot.label;

      const img = document.createElement("img");
      img.alt = `${plot.label} (${year})`;
      img.loading = "lazy";
      img.src = encodeURI(`${historicalBasePath}${plot.filename(year)}`);

      wrapper.appendChild(title);
      wrapper.appendChild(img);
      if (plot.key.startsWith("rank_") || plot.key === "pie_damage_pct") {
        historicalPlotsRank.appendChild(wrapper);
      } else {
        historicalPlotsSummary.appendChild(wrapper);
      }
    });
  };

  const isHistoricalYearPlaying = () => historicalYearPlayTimer != null;

  const stopHistoricalYearPlayback = () => {
    if (historicalYearPlayTimer != null) {
      clearInterval(historicalYearPlayTimer);
      historicalYearPlayTimer = null;
    }
    if (historicalYearPlay) {
      historicalYearPlay.textContent = "▶";
      historicalYearPlay.setAttribute("aria-pressed", "false");
      historicalYearPlay.setAttribute("aria-label", "Play year animation");
    }
  };

  const advanceHistoricalYearStep = () => {
    if (!historicalYearInput) return;
    const max = Number(historicalYearInput.max) || 0;
    const current = Number(historicalYearInput.value) || 0;
    const next = max > 0 ? (current + 1) % (max + 1) : 0;
    historicalYearInput.value = String(next);
    historicalYearInput.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const startHistoricalYearPlayback = () => {
    if (historicalYearPlayTimer != null) return;
    pauseWeatherAnim();
    if (historicalYearPlay) {
      historicalYearPlay.textContent = "⏸";
      historicalYearPlay.setAttribute("aria-pressed", "true");
      historicalYearPlay.setAttribute("aria-label", "Pause year animation");
    }
    historicalYearPlayTimer = setInterval(advanceHistoricalYearStep, 1500);
  };

  const weatherLerp = (a, b, t) => a + (b - a) * t;

  const formatWeatherDate = (dateStr) => {
    if (!dateStr) return "—";
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return dateStr;
    const [year, month, day] = parts;
    return weatherDateFormatter.format(new Date(year, month - 1, day));
  };

  const getWeatherBandForThreshold = (threshold) => {
    const bands = weatherMeta?.bands || [];
    // Contour Low uses threshold 1; meta Low uses enc_min 0.
    const match =
      bands.find((band) => Number(band.enc_min) === Number(threshold)) ||
      (threshold === 1 ? bands.find((band) => Number(band.enc_min) === 0) : null);
    if (match) return match;
    const fallback = WEATHER_THRESHOLD_BANDS.find((band) => band.threshold === threshold);
    return fallback || { name: "Low", color: "#fee8c8" };
  };

  const formatWeatherHdwRange = (band) => {
    const units = weatherMeta?.units || "hPa*m/s";
    const min = band.min_hdw;
    const max = band.max_hdw;
    if (min == null && max == null) return "";
    if (max == null || max === "") return `${band.name}: ≥${min} ${units}`;
    return `${band.name}: ${min}–${max} ${units}`;
  };

  const buildWeatherLegend = () => {
    if (!weatherLegendEl) return;
    const bands = weatherMeta?.bands || WEATHER_THRESHOLD_BANDS;
    weatherLegendEl.innerHTML = "";
    bands.forEach((band) => {
      const item = document.createElement("div");
      item.className = "sfps-weather-legend-item";
      const rangeLabel = formatWeatherHdwRange(band);
      if (rangeLabel) {
        item.title = rangeLabel;
        item.setAttribute("aria-label", rangeLabel);
      }
      const swatch = document.createElement("span");
      swatch.className = "sfps-weather-legend-swatch";
      swatch.style.background = band.color;
      const label = document.createElement("span");
      label.textContent = band.name;
      item.appendChild(swatch);
      item.appendChild(label);
      weatherLegendEl.appendChild(item);
    });
  };

  const setWeatherSourcePopoverOpen = (open) => {
    if (!weatherSourceInfoBtn || !weatherSourcePopover) return;
    weatherSourcePopover.hidden = !open;
    weatherSourceInfoBtn.setAttribute("aria-expanded", String(open));
  };

  const updateWeatherAttribution = (dateLabel = "—") => {
    const source =
      weatherMeta?.source_short ||
      weatherMeta?.source ||
      "Hot-Dry-Windy Index (HDW)";
    const text = dateLabel === "—" || !dateLabel ? source : `${source} · ${dateLabel}`;
    if (weatherAttributionEl) weatherAttributionEl.textContent = text;

    const longSource = weatherMeta?.source_long || weatherMeta?.citation || "";
    if (weatherSourcePopover) weatherSourcePopover.textContent = longSource;
    if (weatherSourceInfoBtn) {
      if (longSource) {
        weatherSourceInfoBtn.hidden = false;
        weatherSourceInfoBtn.title = "Full source and citation";
      } else {
        weatherSourceInfoBtn.hidden = true;
        setWeatherSourcePopoverOpen(false);
      }
    }
  };

  const updateWeatherAnimUI = () => {
    if (!weatherAnimData) return;
    const nDays = weatherAnimData.dates.length;
    const dayIndex = Math.floor(weatherAnimDayT) % nDays;
    const frac = weatherAnimDayT - Math.floor(weatherAnimDayT);
    const displayIndex = frac >= 0.5 ? (dayIndex + 1) % nDays : dayIndex;
    const dateLabel = formatWeatherDate(weatherAnimData.dates[displayIndex]);

    if (weatherScrub) {
      weatherScrub.max = String(Math.max(0, nDays - 1));
      weatherScrub.value = String(displayIndex);
    }
    if (weatherDateEl) weatherDateEl.textContent = dateLabel;
    updateWeatherAttribution(dateLabel);
  };

  const setWeatherLoadingUI = (message = "Loading…") => {
    if (weatherDateEl) weatherDateEl.textContent = message;
    updateWeatherAttribution(message);
  };

  const fillWeatherGrid = (values0, values1, frac) => {
    const { rows, cols } = weatherMeta;
    const grid = new Float32Array(rows * cols);
    for (let i = 0; i < weatherCells.length; i += 1) {
      const cell = weatherCells[i];
      const v0 = values0[i] ?? 0;
      const v1 = values1[i] ?? 0;
      grid[cell.row * cols + cell.col] = weatherLerp(v0, v1, frac);
    }
    return grid;
  };

  const sampleBilinear = (grid, cols, rows, x, y) => {
    const x0 = Math.max(0, Math.min(cols - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(rows - 1, Math.floor(y)));
    const x1 = Math.min(cols - 1, x0 + 1);
    const y1 = Math.min(rows - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const v00 = grid[y0 * cols + x0] || 0;
    const v10 = grid[y0 * cols + x1] || 0;
    const v01 = grid[y1 * cols + x0] || 0;
    const v11 = grid[y1 * cols + x1] || 0;
    return (1 - tx) * (1 - ty) * v00 + tx * (1 - ty) * v10 + (1 - tx) * ty * v01 + tx * ty * v11;
  };

  const bilinearUpsampleGrid = (grid, rows, cols, factor) => {
    const upRows = rows * factor;
    const upCols = cols * factor;
    const out = new Float32Array(upRows * upCols);
    for (let j = 0; j < upRows; j += 1) {
      for (let i = 0; i < upCols; i += 1) {
        out[j * upCols + i] = sampleBilinear(grid, cols, rows, i / factor, j / factor);
      }
    }
    return { values: out, rows: upRows, cols: upCols };
  };

  const gaussianBlurGrid = (grid, rows, cols) => {
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const norm = 16;
    const out = new Float32Array(rows * cols);
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        let sum = 0;
        let ki = 0;
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            const ni = Math.max(0, Math.min(cols - 1, i + di));
            const nj = Math.max(0, Math.min(rows - 1, j + dj));
            sum += (grid[nj * cols + ni] || 0) * kernel[ki];
            ki += 1;
          }
        }
        out[j * cols + i] = sum / norm;
      }
    }
    return out;
  };

  const gridPointToLonLat = (x, y) => {
    const { lon0, lat0, spacing } = weatherMeta;
    return [
      lon0 + (x / WEATHER_UPSAMPLE) * spacing,
      lat0 + (y / WEATHER_UPSAMPLE) * spacing
    ];
  };

  const contourGeometryToFeature = (geometry, band) => ({
    type: "Feature",
    properties: {
      band: band.name,
      threshold: geometry.value,
      color: band.color
    },
    geometry: {
      type: geometry.type,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map(([x, y]) => gridPointToLonLat(x, y)))
      )
    }
  });

  const buildWeatherContourGeoJson = () => {
    if (!weatherMeta || !weatherCells || !weatherAnimData || typeof d3 === "undefined" || typeof d3.contours !== "function") {
      return null;
    }

    const { rows, cols } = weatherMeta;
    const nDays = weatherAnimData.dates.length;
    if (!nDays) return null;

    const day0 = Math.floor(weatherAnimDayT) % nDays;
    const day1 = (day0 + 1) % nDays;
    const frac = weatherAnimDayT - Math.floor(weatherAnimDayT);
    const values0 = weatherAnimData.values[day0];
    const values1 = weatherAnimData.values[day1];

    const baseGrid = fillWeatherGrid(values0, values1, frac);
    const upsampled = bilinearUpsampleGrid(baseGrid, rows, cols, WEATHER_UPSAMPLE);
    const smoothed = gaussianBlurGrid(upsampled.values, upsampled.rows, upsampled.cols);

    const contourGen = d3.contours().size([upsampled.cols, upsampled.rows]).thresholds(WEATHER_THRESHOLDS);
    const contourGeometries = contourGen(smoothed);

    const features = contourGeometries
      .slice()
      .sort((a, b) => a.value - b.value)
      .map((geometry) => {
        const band = getWeatherBandForThreshold(geometry.value);
        return contourGeometryToFeature(geometry, band);
      });

    return { type: "FeatureCollection", features };
  };

  const drawWeatherContours = () => {
    if (!historicalWeatherLayer) return;

    if (!historicalActiveLayers.has(FIRE_WEATHER_LAYER.key)) {
      historicalWeatherLayer.clearLayers();
      return;
    }

    if (!weatherAnimData || weatherAnimLoading) return;

    const geojson = buildWeatherContourGeoJson();
    historicalWeatherLayer.clearLayers();
    if (geojson?.features?.length) {
      historicalWeatherLayer.addData(geojson);
    }
    historicalWeatherLayer.bringToBack();
    updateWeatherAnimUI();
  };

  const tickWeatherAnim = (now) => {
    if (!weatherAnimPlaying) return;
    if (weatherAnimLastFrameMs == null) weatherAnimLastFrameMs = now;
    const elapsed = now - weatherAnimLastFrameMs;
    weatherAnimLastFrameMs = now;

    if (weatherAnimData && !weatherAnimLoading) {
      const nDays = weatherAnimData.dates.length;
      if (nDays > 0) {
        weatherAnimDayT += (elapsed / WEATHER_DAY_DURATION_MS) * weatherAnimSpeed;
        while (weatherAnimDayT >= nDays) weatherAnimDayT -= nDays;
        drawWeatherContours();
      }
    }

    weatherAnimRafId = requestAnimationFrame(tickWeatherAnim);
  };

  const pauseWeatherAnim = () => {
    weatherAnimPlaying = false;
    weatherAnimLastFrameMs = null;
    if (weatherAnimRafId != null) {
      cancelAnimationFrame(weatherAnimRafId);
      weatherAnimRafId = null;
    }
    if (weatherPlayBtn) {
      weatherPlayBtn.textContent = "▶";
      weatherPlayBtn.setAttribute("aria-pressed", "false");
      weatherPlayBtn.setAttribute("aria-label", "Play fire-weather animation");
    }
  };

  const startWeatherAnim = () => {
    if (!weatherAnimData || weatherAnimLoading) return;
    if (weatherAnimPlaying) return;
    stopHistoricalYearPlayback();
    weatherAnimPlaying = true;
    weatherAnimLastFrameMs = null;
    if (weatherPlayBtn) {
      weatherPlayBtn.textContent = "⏸";
      weatherPlayBtn.setAttribute("aria-pressed", "true");
      weatherPlayBtn.setAttribute("aria-label", "Pause fire-weather animation");
    }
    weatherAnimRafId = requestAnimationFrame(tickWeatherAnim);
  };

  const loadWeatherGrid = async () => {
    if (weatherCells && weatherMeta) return weatherCells;
    const response = await fetch(`${WEATHER_ANIM_BASE}/grid_cells.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    weatherMeta = data.meta;
    weatherCells = data.cells;
    buildWeatherLegend();
    return weatherCells;
  };

  const loadWeatherYearData = async (year) => {
    if (weatherYearCache[year]) return weatherYearCache[year];
    const response = await fetch(`${WEATHER_ANIM_BASE}/weather_anim_${year}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    weatherYearCache[year] = data;
    return data;
  };

  const setWeatherAnimYear = async (year) => {
    if (!weatherPlayBtn) return;
    const loadToken = ++weatherAnimLoadToken;
    pauseWeatherAnim();
    weatherAnimYear = year;
    weatherAnimDayT = 0;
    weatherAnimData = null;
    weatherAnimLoading = true;

    if (!weatherCells) {
      try {
        await loadWeatherGrid();
      } catch (error) {
        if (loadToken !== weatherAnimLoadToken) return;
        setWeatherLoadingUI("Grid unavailable");
        weatherAnimLoading = false;
        return;
      }
    }

    if (loadToken !== weatherAnimLoadToken) return;
    setWeatherLoadingUI("Loading…");

    try {
      const data = await loadWeatherYearData(year);
      if (loadToken !== weatherAnimLoadToken) return;
      weatherAnimData = data;
      weatherAnimLoading = false;
      if (weatherScrub) {
        weatherScrub.max = String(Math.max(0, data.dates.length - 1));
        weatherScrub.value = "0";
      }
      drawWeatherContours();
    } catch (error) {
      if (loadToken !== weatherAnimLoadToken) return;
      weatherAnimLoading = false;
      setWeatherLoadingUI("Weather data unavailable");
    }
  };

  const initWeatherAnim = async () => {
    if (!weatherPlayBtn) return;
    if (!weatherAnimInitialized) {
      weatherAnimInitialized = true;

      if (weatherPlayBtn) {
        weatherPlayBtn.addEventListener("click", () => {
          if (weatherAnimPlaying) pauseWeatherAnim();
          else startWeatherAnim();
        });
      }

      if (weatherSpeedSelect) {
        weatherAnimSpeed = Number(weatherSpeedSelect.value) || 1;
        weatherSpeedSelect.addEventListener("change", () => {
          weatherAnimSpeed = Number(weatherSpeedSelect.value) || 1;
        });
      }

      if (weatherScrub) {
        weatherScrub.addEventListener("input", () => {
          pauseWeatherAnim();
          if (!weatherAnimData) return;
          const day = Number(weatherScrub.value) || 0;
          weatherAnimDayT = day;
          drawWeatherContours();
        });
      }

      if (weatherSourceInfoBtn && weatherSourcePopover) {
        weatherSourceInfoBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const open = weatherSourceInfoBtn.getAttribute("aria-expanded") !== "true";
          setWeatherSourcePopoverOpen(open);
        });
        document.addEventListener("click", (event) => {
          if (weatherSourcePopover.hidden) return;
          const target = event.target;
          if (
            weatherSourcePopover.contains(target) ||
            weatherSourceInfoBtn.contains(target)
          ) {
            return;
          }
          setWeatherSourcePopoverOpen(false);
        });
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") setWeatherSourcePopoverOpen(false);
        });
      }
    }

    try {
      await loadWeatherGrid();
      if (weatherAnimYear !== getCurrentHistoricalYear() || !weatherAnimData) {
        await setWeatherAnimYear(getCurrentHistoricalYear());
      } else {
        drawWeatherContours();
      }
    } catch (error) {
      setWeatherLoadingUI("Weather animation unavailable");
    }
  };

  const initHistorical = () => {
    if (!historicalYearInput || !historicalYearValue || !historicalPlotsRank) return;
    if (!historicalYears.length) return;

    historicalYearInput.min = "0";
    historicalYearInput.max = String(historicalYears.length - 1);
    historicalYearInput.step = "1";
    historicalYearInput.value = String(historicalYears.length - 1);

    const updateSliderFill = () => {
      const max = Number(historicalYearInput.max) || 0;
      const val = Number(historicalYearInput.value) || 0;
      const percent = max ? (val / max) * 100 : 0;
      historicalYearInput.style.setProperty("--value", `${percent}%`);
    };

    const updateYear = () => {
      const year = historicalYears[Number(historicalYearInput.value)] ?? historicalYears[0];
      historicalYearValue.textContent = String(year);
      renderHistoricalPlots(year);
      renderHistoricalMapAndChart(year);
      setWeatherAnimYear(year);
      updateSliderFill();
    };

    const handleYearInput = (event) => {
      if (event.isTrusted && isHistoricalYearPlaying()) {
        stopHistoricalYearPlayback();
      }
      updateYear();
    };

    historicalYearInput.addEventListener("input", handleYearInput);
    historicalYearInput.addEventListener("change", handleYearInput);

    if (historicalYearPlay) {
      historicalYearPlay.addEventListener("click", () => {
        if (isHistoricalYearPlaying()) {
          stopHistoricalYearPlayback();
        } else {
          startHistoricalYearPlayback();
        }
      });
    }

    updateYear();
  };

  const getLabel = (param) =>
    gridPlotsMode && gridShortLabels[param] ? gridShortLabels[param] : paramLabels[param] || param;
  const getOptionLabel = (param, value) => {
    if (param === "mht_method") {
      if (gridPlotsMode) {
        const v = String(value);
        if (Object.prototype.hasOwnProperty.call(gridMethodLabels, v)) {
          return gridMethodLabels[v];
        }
        return v.replace(/_/g, " ");
      }
      return String(value).replace(/_/g, " + ");
    }
    return value;
  };

  const parseCsvText = (text) => {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (result.errors && result.errors.length) {
      throw new Error(result.errors[0].message);
    }
    return result.data;
  };

  const initTabs = () => {
    const tabButtons = Array.from(root.querySelectorAll(".sfps-tab-button"));
    const tabPanels = Array.from(root.querySelectorAll(".sfps-tab-panel"));
    if (!tabButtons.length || !tabPanels.length) return;

    const setActiveTab = (targetId) => {
      tabButtons.forEach((button) => {
        const isActive = button.dataset.tab === targetId;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
      tabPanels.forEach((panel) => {
        const isActive = panel.id === targetId;
        panel.classList.toggle("is-active", isActive);
        panel.toggleAttribute("hidden", !isActive);
      });
      if (targetId !== "sfps-tab-historical") {
        stopHistoricalYearPlayback();
        pauseWeatherAnim();
      }
      if (targetId === "sfps-tab-historical") {
        ensureHistoricalMapAndChart();
      }
    };

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.tab;
        if (!targetId) return;
        setActiveTab(targetId);
      });
    });

    const initialButton = tabButtons.find((button) => button.classList.contains("is-active"));
    const initialTarget = initialButton?.dataset.tab || tabButtons[0].dataset.tab;
    if (initialTarget) {
      setActiveTab(initialTarget);
    }
  };

  const parseImageName = (path) => {
    if (!path) return null;
    const filename = path.split("/").pop() || "";
    const withoutExt = filename.replace(/\.(png|jpg|jpeg)$/i, "");
    let base = withoutExt;

    const suffixes = {
      hftd: base.includes("_with_hftd"),
      inset: base.includes("_with_inset")
    };

    base = base
      .replace(/_with_hftd/g, "")
      .replace(/_with_inset/g, "")
      .replace(/_no_inset/g, "");

    const mhtMarker = "_mht_method=";
    const mhtIndex = base.lastIndexOf(mhtMarker);
    if (mhtIndex === -1) return null;

    const prefix = base.slice(0, mhtIndex);
    const mhtMethod = base.slice(mhtIndex + mhtMarker.length);

    const rowMatch = prefix.match(/^map_row(\d+)_/);
    if (!rowMatch) return null;
    const row = Number(rowMatch[1]);
    const remainder = prefix.slice(rowMatch[0].length);

    const params = {};
    const regex = /([A-Za-z]+(?:_[A-Za-z]+)*)=([^_]+)/g;
    let match = regex.exec(remainder);
    while (match) {
      const key = match[1];
      const value = match[2];
      if (key && value !== undefined) {
        params[key] = value;
      }
      match = regex.exec(remainder);
    }

    return {
      path,
      row: Number.isNaN(row) ? null : row,
      params: {
        ...params,
        mht_method: mhtMethod
      },
      suffix: {
        hftd: suffixes.hftd,
        inset: suffixes.inset
      }
    };
  };

  /** Maps always use experiment id 0: grid_plots/{folder}/exp_0_{method_slug}/map.png */
  const GRID_MAP_EXP_ID = 0;

  /** Three-method comparison shown in Planning Tool (grid mode). */
  const COMPARE_METHODS = [
    { id: "ours",    slug: "group_conformal_fixed", name: "Ours", tag: "" },
    { id: "bonf",    slug: "co_optimized",          name: "Co-Optimized" },
    { id: "maxrank", slug: "planning_only",         name: "Planning-Only" },
  ];

  /** Key outcome metrics shown per method below each map. */
  const COMPARE_METRICS = [
    { key: "x_size",      label: "Sectionalized" },
    { key: "y_size",      label: "Fast-Trip" },
    { key: "z_star_size", label: "Actual PSPS" },
    {
      key: "true_cost",
      label: "Eval. Cost (10⁶)",
      fmt: (v) => (Number(v) * 1e-6).toFixed(2)
    },
  ];

  /**
   * Grid mode: default FWER, budgets, SAIFI, effectiveness, γ, and δ (initial load + Reset).
   * Must match a row in merged_planning_grid.csv (same scenario_slug for all methods).
   */
  const GRID_DEFAULT_HYPERPARAMS = {
    alpha: 0.4,
    B_budget_multiplier: 0.2,
    C_budget_multiplier: 0.3,
    W_cap_multiplier: 0.1,
    effective_alpha: 0.9,
    gamma_i_multiplier: 0.8,
    delta: 1
  };

  const buildGridImageMetaFromRow = (row) => {
    const folderSlug = row.scenario_slug;
    const methodSlug = row.method_slug;
    if (!folderSlug || !methodSlug) return null;
    const path = `grid_plots/${folderSlug}/exp_${GRID_MAP_EXP_ID}_${methodSlug}/map.png`;
    const str = (v) => (v === undefined || v === null ? "" : String(v));
    return {
      path,
      folderSlug,
      row: GRID_MAP_EXP_ID,
      params: {
        B_budget_multiplier: str(row.B_budget_multiplier),
        C_budget_multiplier: str(row.C_budget_multiplier),
        W_cap_multiplier: str(row.W_cap_multiplier),
        effective_alpha: str(row.effective_alpha),
        gamma_i_multiplier: str(row.gamma_i_multiplier),
        mht_method: str(row.mht_method),
        alpha: str(row.alpha),
        delta: str(row.delta),
        grouping_method: str(row.grouping_method || "grid")
      },
      suffix: { hftd: false, inset: false }
    };
  };

  /** Params encoded in grid folder names: a__C__B__W__ae__g__d__&lt;hash&gt; */
  const gridEncodedParamKeys = new Set([
    "alpha",
    "B_budget_multiplier",
    "C_budget_multiplier",
    "W_cap_multiplier",
    "effective_alpha",
    "gamma_i_multiplier",
    "delta"
  ]);

  const floatToToken = (val) => {
    const n = Number(val);
    if (Number.isNaN(n)) return "0p0";
    const s = n.toFixed(12).replace(/\.?0+$/, "");
    if (!s.includes(".")) return `${s}p0`;
    const [intp, frac] = s.split(".");
    const fracTrim = (frac || "").replace(/0+$/, "") || "0";
    return `${intp}p${fracTrim}`;
  };

  const encodeDelta = (val) => {
    const n = Number(val);
    if (Number.isNaN(n)) return "0";
    const s = n.toFixed(12).replace(/\.?0+$/, "");
    if (!s.includes(".")) return s;
    const [intp, frac] = s.split(".");
    if (!frac || /^0+$/.test(frac)) return intp;
    const fracTrim = frac.replace(/0+$/, "") || "0";
    return `${intp}p${fracTrim}`;
  };

  const encodeGridFolderPrefix = (sel) => {
    const a = floatToToken(sel.alpha);
    const C = floatToToken(sel.C_budget_multiplier);
    const B = floatToToken(sel.B_budget_multiplier);
    const W = floatToToken(sel.W_cap_multiplier);
    const ae = floatToToken(sel.effective_alpha);
    const g = floatToToken(sel.gamma_i_multiplier);
    const d = encodeDelta(sel.delta);
    return `a${a}__C${C}__B${B}__W${W}__ae${ae}__g${g}__d${d}`;
  };

  /**
   * Match encoded slider tuple to a folder name on disk (CSV column scenario_slug is the path segment).
   * Prefer scenario folders without legacy "__expid0__" duplicate segment when multiple names share the same prefix.
   */
  const resolveGridFolderSlug = (prefix) => {
    const folders = [...new Set(dataset.map((r) => r.scenario_slug).filter(Boolean))];
    const candidates = folders.filter((s) => s === prefix || s.startsWith(`${prefix}__`));
    if (!candidates.length) return null;
    const preferred = candidates.find((s) => !String(s).includes("expid0"));
    return preferred || candidates[0];
  };

  const getSuffixLabel = (suffix) => {
    if (suffix.hftd && suffix.inset) return "HFTD + Inset";
    if (suffix.hftd) return "HFTD";
    if (suffix.inset) return "Inset";
    return "None";
  };

  const getSuffixKey = (suffix) => {
    if (suffix.hftd && suffix.inset) return "with_hftd_with_inset";
    if (suffix.hftd) return "with_hftd";
    if (suffix.inset) return "with_inset";
    return "none";
  };

  const normalizeImagePath = (path) => {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith("assets/")) return `${basePath}/${path}`;
    return `${imageBasePath}${path}`;
  };

  const getUniqueValues = (rows, key) => {
    const values = new Set();
    rows.forEach((row) => {
      const value = row[key];
      if (value !== undefined && value !== null && value !== "") {
        values.add(value);
      }
    });
    const list = Array.from(values);
    if (list.every((val) => !Number.isNaN(Number(val)))) {
      return list.sort((a, b) => Number(a) - Number(b));
    }
    return list.sort();
  };

  const rebuildGridImageMetaFromDataset = () => {
    if (!gridPlotsMode || !dataset.length) {
      imageMeta = [];
      return;
    }
    const exp0 = dataset.filter(
      (r) =>
        Number(r.exp_id) === GRID_MAP_EXP_ID &&
        !GRID_MHT_EXCLUDED_SLUGS.has(String(r.mht_method))
    );
    const seen = new Set();
    imageMeta = [];
    exp0.forEach((row) => {
      const m = buildGridImageMetaFromRow(row);
      if (!m) return;
      const key = `${m.folderSlug}||${m.params.mht_method}`;
      if (seen.has(key)) return;
      seen.add(key);
      imageMeta.push(m);
    });
  };

  const syncGridImageDefaultsFromDataset = (rows) => {
    if (!gridPlotsMode || !rows.length) return;

    const rowMatchesDefaultHyperparams = (row) => {
      if (Number(row.exp_id) !== GRID_MAP_EXP_ID) return false;
      return [...gridEncodedParamKeys].every((k) => {
        const target = GRID_DEFAULT_HYPERPARAMS[k];
        const rn = Number(row[k]);
        const tn = Number(target);
        if (!Number.isNaN(rn) && !Number.isNaN(tn)) return rn === tn;
        return String(row[k]) === String(target);
      });
    };

    const pick =
      rows.find(rowMatchesDefaultHyperparams) ||
      rows.find(
        (row) =>
          Number(row.exp_id) === GRID_MAP_EXP_ID &&
          !GRID_MHT_EXCLUDED_SLUGS.has(String(row.mht_method))
      ) ||
      rows.find((row) => Number(row.exp_id) === GRID_MAP_EXP_ID) ||
      rows[0];

    const canonGridParam = (k, rawVal) => {
      if (rawVal === undefined || rawVal === null || rawVal === "") return;
      const uniques = getUniqueValues(dataset, k);
      const vn = Number(rawVal);
      const hit = uniques.find((x) => {
        const xn = Number(x);
        if (!Number.isNaN(vn) && !Number.isNaN(xn)) return vn === xn;
        return String(x) === String(rawVal);
      });
      imageSelection[k] = hit !== undefined ? String(hit) : String(rawVal);
    };

    [...gridEncodedParamKeys].forEach((k) => canonGridParam(k, pick[k]));
    if (pick.mht_method != null && pick.mht_method !== "") {
      imageSelection.mht_method = String(pick.mht_method);
    }
    imageSelection.suffix = "none";
  };

  const handleCsvData = (rows) => {
    dataset = rows;

    if (gridPlotsMode && rows.length) {
      rebuildGridImageMetaFromDataset();
      const exp0 = rows.filter((r) => Number(r.exp_id) === GRID_MAP_EXP_ID);
      syncGridImageDefaultsFromDataset(exp0.length ? exp0 : rows);
    }

    buildImageControls();
    renderImage();
  };

  const loadCsvFromUrl = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch CSV.");
    return await response.text();
  };

  const loadCsv = async () => {
    try {
      let text = "";
      if (defaultCsvFile) {
        const csvUrl = `${basePath}/assets/website_plots/${defaultCsvFile}`;
        text = await loadCsvFromUrl(csvUrl);
        usingDefaultCsv = true;
      } else {
        return;
      }
      const rows = parseCsvText(text);
      handleCsvData(rows);
    } catch (error) {
      usingDefaultCsv = false;
    }
  };

  const requiredSliderParams = new Set([
    "alpha",
    "B_budget_multiplier",
    "C_budget_multiplier",
    "effective_alpha",
    "gamma_i_multiplier",
    "W_cap_multiplier",
    "delta"
  ]);

  const valuesMatch = (metaValue, selectedValue) => {
    const metaNum = Number(metaValue);
    const selectedNum = Number(selectedValue);
    if (!Number.isNaN(metaNum) && !Number.isNaN(selectedNum)) {
      return metaNum === selectedNum;
    }
    return String(metaValue) === String(selectedValue);
  };

  /**
   * Map slider tuple to scenario_slug using CSV rows (authoritative), not folder-name prefix encoding alone.
   * Folder names may use a different α token (e.g. a0p5) than encodeGridFolderPrefix (a0p4) for the same optimization params.
   */
  const resolveGridFolderFromSelection = (sel) => {
    const rows = dataset.filter((r) => {
      if (Number(r.exp_id) !== GRID_MAP_EXP_ID) return false;
      for (const k of gridEncodedParamKeys) {
        if (!valuesMatch(r[k], sel[k])) return false;
      }
      return true;
    });
    const slugs = [...new Set(rows.map((r) => r.scenario_slug).filter(Boolean))];
    if (slugs.length === 1) return slugs[0];
    if (slugs.length > 1) return slugs.sort()[0];
    const prefix = encodeGridFolderPrefix(sel);
    return resolveGridFolderSlug(prefix);
  };

  /** When user selects 0.7, match images with effective_alpha 0.70 or 0.90 (combine 0.7 and 0.9). */
  const effectiveAlphaMatches = (selectedValue, metaValue) => {
    const sel = Number(selectedValue);
    const meta = Number(metaValue);
    if (Number.isNaN(sel) || Number.isNaN(meta)) return valuesMatch(metaValue, selectedValue);
    if (sel === 0.5) return meta === 0.5;
    if (sel === 0.7) return meta === 0.7 || meta === 0.9;
    return valuesMatch(metaValue, selectedValue);
  };

  const paramMatches = (key, metaValue, selectedValue) => {
    if (key === "effective_alpha" && !gridPlotsMode) {
      return effectiveAlphaMatches(selectedValue, metaValue);
    }
    return valuesMatch(metaValue, selectedValue);
  };

  const getFilteredImageMeta = (excludeParam, selection = imageSelection) => {
    return imageMeta.filter((meta) => {
      if (
        !gridPlotsMode &&
        excludeParam !== "suffix" &&
        userSelected.has("suffix")
      ) {
        if (getSuffixKey(meta.suffix) !== selection.suffix) return false;
      }

      return Object.entries(selection).every(([key, value]) => {
        if (key === "suffix" || key === excludeParam) return true;
        if (!userSelected.has(key)) return true;
        if (value === undefined || value === null || value === "") return true;
        if (key === "B_budget" || key === "C_budget" || key === "W_cap") return true;
        return paramMatches(key, meta.params[key], value);
      });
    });
  };

  const getStrictImageMeta = (selectionOverride) => {
    const sel = selectionOverride != null ? selectionOverride : imageSelection;
    const suffixKey = sel.suffix || "none";

    if (gridPlotsMode) {
      const resolvedFolder = resolveGridFolderFromSelection(sel);
      if (!resolvedFolder) return [];
      return imageMeta.filter((meta) => {
        if (meta.folderSlug !== resolvedFolder) return false;
        if (getSuffixKey(meta.suffix) !== suffixKey) return false;
        return Object.entries(sel).every(([key, value]) => {
          if (key === "suffix") return true;
          if (gridEncodedParamKeys.has(key)) return true;
          if (value === undefined || value === null || value === "") return true;
          if (key === "B_budget" || key === "C_budget" || key === "W_cap") return true;
          return paramMatches(key, meta.params[key], value);
        });
      });
    }

    return imageMeta.filter((meta) => {
      if (getSuffixKey(meta.suffix) !== suffixKey) return false;
      return Object.entries(sel).every(([key, value]) => {
        if (key === "suffix") return true;
        if (value === undefined || value === null || value === "") return true;
        if (key === "B_budget" || key === "C_budget" || key === "W_cap") return true;
        return paramMatches(key, meta.params[key], value);
      });
    });
  };

  const getImageValues = (param) => {
    return imageMeta
      .map((meta) => meta.params[param])
      .filter((value) => value !== undefined && value !== "");
  };

  const getImageValuesForSelection = (param, selection, activeKeys) => {
    return getMetaForSelection(selection, param, activeKeys)
      .map((meta) => meta.params[param])
      .filter((value) => value !== undefined && value !== "");
  };

  const getMetaForSelection = (selection, excludeParam, activeKeys = userSelected) => {
    return imageMeta.filter((meta) => {
      if (
        !gridPlotsMode &&
        excludeParam !== "suffix" &&
        selection.suffix &&
        activeKeys?.has("suffix")
      ) {
        if (getSuffixKey(meta.suffix) !== selection.suffix) return false;
      }
      return Object.entries(selection).every(([key, value]) => {
        if (key === "suffix" || key === excludeParam) return true;
        if (activeKeys && !activeKeys.has(key)) return true;
        if (value === undefined || value === null || value === "") return true;
        if (key === "B_budget" || key === "C_budget" || key === "W_cap") return true;
        return paramMatches(key, meta.params[key], value);
      });
    });
  };

  const buildImageControls = () => {
    imageParams.innerHTML = "";
    const previousSelection = { ...imageSelection };
    const workingSelection = { ...previousSelection, suffix: imageSelection.suffix || "" };
    const excludedImageParams = new Set([
      "B_budget",
      "C_budget",
      "W_cap"
    ]);
    if (!gridPlotsMode) {
      excludedImageParams.add("alpha");
      excludedImageParams.add("gamma_i_multiplier");
      excludedImageParams.add("mht_method");
    }
    if (gridPlotsMode) {
      excludedImageParams.add("grouping_method");
      // Grid mode always renders all three methods; no per-method dropdown needed.
      excludedImageParams.add("mht_method");
      // FWER is fixed at 0.4 in all grid experiments — hide the control.
      excludedImageParams.add("alpha");
      imageSelection.alpha = String(GRID_DEFAULT_HYPERPARAMS.alpha);
    }
    const imageParamSet = new Set();
    imageMeta.forEach((meta) => {
      Object.keys(meta.params || {}).forEach((key) => {
        if (!excludedImageParams.has(key)) {
          imageParamSet.add(key);
        }
      });
    });

    const preferredOrder = [
      "alpha",
      "W_cap_multiplier",
      "C_budget_multiplier",
      "B_budget_multiplier",
      "effective_alpha",
      "gamma_i_multiplier",
      "delta",
      "mht_method"
    ];

    const orderedParams = [
      ...preferredOrder.filter((param) => imageParamSet.has(param)),
      ...Array.from(imageParamSet)
        .filter((param) => !preferredOrder.includes(param))
        .sort()
    ];
    const selectControls = [];
    const sliderControls = [];

    const suffixControl = buildSuffixControl(previousSelection);
    if (suffixControl) {
      selectControls.push(suffixControl);
      workingSelection.suffix = imageSelection.suffix;
    }

    applyFixedImageParams();
    if (!gridPlotsMode) {
      Object.entries(fixedImageParams).forEach(([param, value]) => {
        workingSelection[param] = value;
      });
    }

    orderedParams.forEach((param) => {
      const selectionForFilter = { ...workingSelection };
      const wrapper = document.createElement("div");
      wrapper.className = "sfps-field";
      const label = document.createElement("label");
      label.textContent = getLabel(param);

      let values =
        gridPlotsMode && gridEncodedParamKeys.has(param)
          ? getUniqueValues(dataset, param)
          : getImageValuesForSelection(param, selectionForFilter, userSelected);

      if (gridPlotsMode) {
        values = filterGridHiddenSliderValues(param, values);
      }

      if (param === "mht_method" && gridPlotsMode) {
        values = filterGridMhtValues(values);
      }

      if (param === "effective_alpha" && !gridPlotsMode) {
        const canonical = new Set();
        values.forEach((v) => {
          const n = Number(v);
          if (n === 0.5) canonical.add("0.5");
          else if (n === 0.7 || n === 0.9) canonical.add("0.7");
        });
        values = ["0.5", "0.7"].filter((opt) => canonical.has(opt));
      }

      const uniqueValues = Array.from(new Set(values));
      if (!uniqueValues.length) return;

      const numericValues = uniqueValues.filter((val) => !Number.isNaN(Number(val)));
      const allNumeric = numericValues.length === uniqueValues.length;
      const sortedValues = allNumeric
        ? uniqueValues.sort((a, b) => Number(a) - Number(b))
        : uniqueValues.sort();

      let defaultValue = sortedValues[0];
      if (param === "mht_method" && gridPlotsMode && sortedValues.includes("co_optimized")) {
        defaultValue = "co_optimized";
      }
      if (param === "mht_method" && !gridPlotsMode && sortedValues.includes("Random_Bonferroni")) {
        defaultValue = "Random_Bonferroni";
      }
      if (param === "C_budget_multiplier") {
        const half = sortedValues.find((v) => Number(v) === 0.5);
        if (half !== undefined) defaultValue = half;
      }
      if (requiredSliderParams.has(param) || (allNumeric && sortedValues.length > 1)) {
        const preferredValue =
          previousSelection[param] && sortedValues.includes(previousSelection[param])
            ? previousSelection[param]
            : defaultValue;
        const preferredIndex = Math.max(0, sortedValues.indexOf(preferredValue));
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = String(Math.max(sortedValues.length - 1, 0));
        slider.step = "1";
        slider.value = String(preferredIndex);
        slider.dataset.param = param;
        slider.dataset.values = JSON.stringify(sortedValues);
        const updateSliderFill = () => {
          const max = Number(slider.max) || 0;
          const val = Number(slider.value) || 0;
          const percent = max ? (val / max) * 100 : 0;
          slider.style.setProperty("--value", `${percent}%`);
        };
        updateSliderFill();

        const valueDisplay = document.createElement("div");
        valueDisplay.className = "sfps-status sfps-slider-value";
        valueDisplay.textContent = preferredValue;
        valueDisplay.dataset.param = param;

        slider.addEventListener("input", () => {
          const list = JSON.parse(slider.dataset.values || "[]");
          const current = list[Number(slider.value)] ?? "";
          valueDisplay.textContent = current;
          imageSelection[param] = current;
          userSelected.add(param);
          updateSliderFill();
          renderImage();
        });
        slider.addEventListener("change", () => {
          updateSliderFill();
          buildImageControls();
          renderImage();
        });

        wrapper.appendChild(label);
        wrapper.appendChild(slider);
        wrapper.appendChild(valueDisplay);
        sliderControls.push(wrapper);
        imageSelection[param] = preferredValue;
        workingSelection[param] = preferredValue;
      } else {
        const input = document.createElement("select");
        input.id = `image-${param}`;
        input.dataset.param = param;

        sortedValues.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = getOptionLabel(param, value);
          input.appendChild(option);
        });

        const preferredValue =
          previousSelection[param] && sortedValues.includes(previousSelection[param])
            ? previousSelection[param]
            : defaultValue;
        input.value = preferredValue;
        input.addEventListener("change", () => {
          imageSelection[param] = input.value;
          userSelected.add(param);
          buildImageControls();
          renderImage();
        });
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        selectControls.push(wrapper);
        imageSelection[param] = preferredValue;
        workingSelection[param] = preferredValue;
      }
    });

    selectControls.forEach((node) => imageParams.appendChild(node));
    sliderControls.forEach((node) => imageParams.appendChild(node));
  };

  const buildSuffixControl = (previousSelection) => {
    if (gridPlotsMode) return null;
    const filtered = getFilteredImageMeta("suffix");
    const source = filtered.length ? filtered : imageMeta;
    const options = Array.from(
      new Map(
        source.map((meta) => {
          const key = getSuffixKey(meta.suffix);
          return [key, { key, label: getSuffixLabel(meta.suffix) }];
        })
      ).values()
    );
    const lastKey = "with_hftd_with_inset";
    options.sort((a, b) => {
      if (a.key === lastKey) return 1;
      if (b.key === lastKey) return -1;
      return a.label.localeCompare(b.label);
    });

    if (!options.length) return null;

    const label = document.createElement("label");
    label.setAttribute("for", "image-suffix");
    label.textContent = "Layer option";

    const select = document.createElement("select");
    select.id = "image-suffix";
    options.forEach((suffix) => {
      const option = document.createElement("option");
      option.value = suffix.key;
      option.textContent = suffix.label;
      select.appendChild(option);
    });

    const defaultOption =
      options.find((option) => option.key === "with_hftd_with_inset") || options[0];
    const preferredSuffix =
      previousSelection?.suffix && options.some((option) => option.key === previousSelection.suffix)
        ? previousSelection.suffix
        : defaultOption.key;
    imageSelection.suffix = preferredSuffix;
    select.value = imageSelection.suffix;
    userSelected.add("suffix");
    select.addEventListener("change", () => {
      imageSelection.suffix = select.value;
      userSelected.add("suffix");
      buildImageControls();
      renderImage();
    });

    const wrapper = document.createElement("div");
    wrapper.className = "sfps-field";
    wrapper.appendChild(label);
    wrapper.appendChild(select);
    return wrapper;
  };

  const renderImage = () => {
    if (gridPlotsMode) {
      // ── Grid mode: render three-method comparison ──────────────────
      const folder = resolveGridFolderFromSelection(imageSelection);

      if (!folder) {
        setStatus(
          imageStatus,
          "No plot folder for this combination of FWER, SAIFI, sect. budget, fast-trip budget, effectiveness, γ, and δ.",
          true
        );
        COMPARE_METHODS.forEach((m) => {
          const imgEl = document.getElementById(`decision-image-${m.id}`);
          if (imgEl) imgEl.removeAttribute("src");
          const metricsEl = document.getElementById(`metrics-${m.id}`);
          if (metricsEl) metricsEl.innerHTML = "";
        });
        return;
      }

      setStatus(imageStatus, "", false);

      let pendingLoads = 0;
      let anyImageError = false;
      COMPARE_METHODS.forEach((method) => {
        const imgEl = document.getElementById(`decision-image-${method.id}`);
        const metricsEl = document.getElementById(`metrics-${method.id}`);

        if (imgEl) {
          pendingLoads += 1;
          const imgPath = `grid_plots/${folder}/exp_${GRID_MAP_EXP_ID}_${method.slug}/map.png`;
          imgEl.onload = null;
          imgEl.onerror = null;
          imgEl.onload = () => {
            pendingLoads -= 1;
            if (pendingLoads === 0 && !anyImageError) setStatus(imageStatus, "", false);
          };
          imgEl.onerror = () => {
            anyImageError = true;
            setStatus(imageStatus, `Image failed to load for ${method.name}.`, true);
            pendingLoads -= 1;
          };
          imgEl.src = normalizeImagePath(imgPath);
        }

        if (metricsEl && dataset.length) {
          const row = dataset.find(
            (r) =>
              r.scenario_slug === folder &&
              r.mht_method === method.slug &&
              Number(r.exp_id) === GRID_MAP_EXP_ID
          );
          if (row) {
            metricsEl.innerHTML = COMPARE_METRICS.map((m) => {
              const val = Number(row[m.key]);
              const display = Number.isNaN(val) ? "—" : (m.fmt ? m.fmt(val) : Math.round(val));
              return `<div class="sfps-metric-card">
                <span class="sfps-metric-value">${display}</span>
                <span class="sfps-metric-label">${m.label}</span>
              </div>`;
            }).join("");
          } else {
            metricsEl.innerHTML = "";
          }
        }
      });
      return;
    }

    // ── Legacy single-image mode ────────────────────────────────────
    if (!imageMeta.length) {
      setStatus(imageStatus, "No plot images available.", true);
      return;
    }

    const legacyImg = document.getElementById("decision-image");
    if (!legacyImg) return;

    let matches = getStrictImageMeta();
    let fallbackMessage = "";

    if (!matches.length && imageSelection.effective_alpha === "0.5") {
      matches = getStrictImageMeta({ ...imageSelection, effective_alpha: "0.7" });
      if (matches.length) {
        fallbackMessage = "No image for Effectiveness 0.5 for this combination; showing 0.7.";
      }
    }

    if (!matches.length) {
      setStatus(imageStatus, "Image not found.", true);
      legacyImg.removeAttribute("src");
      return;
    }

    const sortedMatches = matches.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
    const selected = sortedMatches[0];
    if (!selected) {
      setStatus(imageStatus, "", false);
      legacyImg.removeAttribute("src");
      return;
    }

    legacyImg.src = normalizeImagePath(selected.path);
    setStatus(imageStatus, fallbackMessage, !!fallbackMessage);
  };

  const fetchManifest = async () => {
    const cacheBustUrl = `${manifestUrl}?t=${Date.now()}`;
    const response = await fetch(cacheBustUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("No manifest.");
    return await response.json();
  };

  const refreshImageMeta = async () => {
    if (gridPlotsMode) {
      rebuildGridImageMetaFromDataset();
      return;
    }
    const manifest = await fetchManifest();
    const images = manifest.images || manifest.imageFiles || [];
    imageMeta = images.map(parseImageName).filter(Boolean);
  };

  const init = async () => {
    initTabs();
    initHistorical();
    try {
      const manifest = await fetchManifest();
      gridPlotsMode = Boolean(manifest.gridPlots);
      defaultCsvFile = (manifest.csvFiles || [])[0] || "";
      const images = manifest.images || manifest.imageFiles || [];
      imageMeta = gridPlotsMode ? [] : images.map(parseImageName).filter(Boolean);

      applyFixedImageParams();
      await loadCsv();
      if (!usingDefaultCsv) {
        buildImageControls();
        renderImage();
      }
    } catch (error) {
      defaultCsvFile = "";
      gridPlotsMode = false;
    }
  };

  resetPart2Button.addEventListener("click", async () => {
    imageSelection = { suffix: gridPlotsMode ? "none" : "" };
    userSelected.clear();
    applyFixedImageParams();
    try {
      await refreshImageMeta();
    } catch (error) {
      // ignore refresh failures, keep existing options
    }
    if (gridPlotsMode && dataset.length) syncGridImageDefaultsFromDataset(dataset);
    buildImageControls();
    renderImage();
  });
  if (downloadResultsButton) {
    downloadResultsButton.addEventListener("click", async () => {
      const triggerDownload = (url, filename) => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      // Download the three visible method images directly from their <img> src
      const methodFileNames = {
        ours:    "ours",
        bonf:    "co_optimized",
        maxrank: "planning_only",
      };
      COMPARE_METHODS.forEach((method) => {
        const imgEl = document.getElementById(`decision-image-${method.id}`);
        if (!imgEl || !imgEl.src) return;
        triggerDownload(imgEl.src, `${methodFileNames[method.id]}.png`);
      });

      // Also fetch and download the hidden methods for the current folder
      const EXTRA_METHODS = [
        { slug: "bonferroni", filename: "bonferroni" },
        { slug: "ci",         filename: "ci" },
        { slug: "maxrank",    filename: "maxrank" },
      ];
      const folder = resolveGridFolderFromSelection(imageSelection);
      if (!folder) return;
      for (const method of EXTRA_METHODS) {
        const imgPath = `grid_plots/${folder}/exp_${GRID_MAP_EXP_ID}_${method.slug}/map.png`;
        const url = normalizeImagePath(imgPath);
        try {
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const blob = await resp.blob();
          const objUrl = URL.createObjectURL(blob);
          triggerDownload(objUrl, `${method.filename}.png`);
          URL.revokeObjectURL(objUrl);
        } catch (_) {
          // skip if image not available
        }
      }
    });
  }

  if (decisionImage) {
    decisionImage.addEventListener("error", () => {
      setStatus(imageStatus, "Image failed to load. Check the path.", true);
    });
    decisionImage.addEventListener("load", () => {
      setStatus(imageStatus, "", false);
    });
  }

  init();
})();
