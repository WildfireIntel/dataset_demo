(() => {
  const root = document.getElementById("sect-fasttrip-psps");
  if (!root) return;

  const basePath = root.dataset.basePath || "";
  const manifestUrl = `${basePath}/assets/website_plots/manifest.json`;

  const xAxisSelect = document.getElementById("x-axis");
  const yAxisLeftSelect = document.getElementById("y-axis-left");
  const yAxisRightSelect = document.getElementById("y-axis-right");
  const methodLeftSelect = document.getElementById("method-left");
  const methodRightSelect = document.getElementById("method-right");
  const filterControls = document.getElementById("filter-controls");
  const trendPlotOpt = document.getElementById("trend-plot-opt");
  const trendPlotTrue = document.getElementById("trend-plot-true");
  const plotTitleLeft = document.getElementById("plot-title-left");
  const plotTitleRight = document.getElementById("plot-title-right");
  const resetPart1Button = document.getElementById("reset-part1");

  const imageStatus = document.getElementById("image-status");
  const imageParams = document.getElementById("image-params");
  const decisionImage = document.getElementById("decision-image");
  const resetPart2Button = document.getElementById("reset-part2");
  const downloadResultsButton = document.getElementById("download-results");

  const historicalYearInput = document.getElementById("historical-year");
  const historicalYearValue = document.getElementById("historical-year-value");
  const historicalPlotsRank = document.getElementById("historical-plots-rank");
  const historicalPlotsSummary = document.getElementById("historical-plots-summary");

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

  const yMetricOptions = [
    { key: "opt_cost", label: "Worst Case Cost", type: "direct" },
    {
      key: "true_cost",
      label: "Evaluation cost (×10⁶)",
      type: "direct",
      /** CSV values are absolute cost; plot uses units of 10⁶. */
      valueScale: 1e-6
    },
    { key: "x_size", label: "Sect. circuits", type: "direct" },
    { key: "y_size", label: "Fast-trip config. circuits", type: "direct" },
    { key: "z_star_size", label: "PSPS enacted circuits", type: "direct" },
    { key: "population_psps_actual", label: "Population affected by PSPS (actual)", type: "direct" },
    { key: "population_fast_trip", label: "Population affected by fast-trip", type: "direct" },
    { key: "population_psps", label: "Population affected by PSPS (planned)", type: "direct" },
    {
      key: "x_size_budget_pct",
      label: "Pct of sect. budget usage",
      type: "ratio",
      numerator: "x_size",
      denominator: "C_budget"
    },
    {
      key: "y_size_budget_pct",
      label: "Pct of fast-trip budget usage",
      type: "ratio",
      numerator: "y_size",
      denominator: "B_budget"
    },
    {
      key: "psps_reliability_pct",
      label: "Pct of PSPS impact on reliability constraint",
      type: "ratio",
      numerator: "population_psps_actual",
      denominator: "W_cap"
    },
    {
      key: "fast_trip_reliability_pct",
      label: "Pct of fast-trip impact on reliability constraint",
      type: "ratio",
      numerator: "population_fast_trip",
      denominator: "W_cap"
    },
    {
      key: "x_size_total_pct",
      label: "Pct of circuits sectionalized",
      type: "ratio",
      numerator: "x_size",
      denominator: "808"
    },
    {
      key: "y_size_total_pct",
      label: "Pct of circuits with fast-trip",
      type: "ratio",
      numerator: "y_size",
      denominator: "808"
    },
    {
      key: "prevented_fast_trip_pct",
      label: "Pct of ignitions prevented by fast-trip",
      type: "ratio",
      numerator: "prevented_by_fast_trip_y_total",
      denominator: "ignitions"
    },
    {
      key: "prevented_psps_pct",
      label: "Pct of ignitions prevented by PSPS",
      type: "ratio",
      numerator: "prevented_by_psps_z_total",
      denominator: "ignitions"
    }
  ];

  let dataset = [];
  let columns = [];
  let numericColumns = [];
  let availableParams = [];
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

  const hiddenParamsForDefault = new Set([
    "B_budget",
    "W_cap",
    "C_budget",
    "ignitions"
  ]);

  const hiddenParamsForControls = new Set(["alpha"]);

  const allowedMhtMethods = new Set(["Operational_MaxRank"]);

  const imageBasePath = `${basePath}/assets/website_plots/`;
  const fixedImageParams = {
    alpha: "0.1",
    mht_method: "Operational_MaxRank",
    gamma_i_multiplier: "0.5"
  };
  const historicalBasePath = `${basePath}/assets/website_plots/historical plots/`;

  const historicalYears = [2020, 2021, 2022, 2023, 2024];
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
      updateSliderFill();
    };

    historicalYearInput.addEventListener("input", updateYear);
    historicalYearInput.addEventListener("change", updateYear);
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
  const getMetricLabel = (key) =>
    (yMetricOptions.find((option) => option.key === key) || {}).label || key;

  const getDisplayParams = () => {
    const params = availableParams.length ? availableParams : hyperparams;
    const hideControls = new Set(hiddenParamsForControls);
    if (gridPlotsMode) hideControls.delete("alpha");
    let filtered = params.filter((param) => !hideControls.has(param));
    if (gridPlotsMode) {
      filtered = filtered.filter((param) => param !== "grouping_method");
    }
    if (!usingDefaultCsv) return filtered;
    return filtered.filter((param) => !hiddenParamsForDefault.has(param));
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

  const isNumericColumn = (rows, key) => {
    let hasValue = false;
    for (const row of rows) {
      const value = row[key];
      if (value === undefined || value === null || value === "") continue;
      hasValue = true;
      if (Number.isNaN(Number(value))) return false;
    }
    return hasValue;
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

  const buildAxisSelects = () => {
    xAxisSelect.innerHTML = "";
    yAxisLeftSelect.innerHTML = "";
    yAxisRightSelect.innerHTML = "";

    getDisplayParams().forEach((param) => {
      const option = document.createElement("option");
      option.value = param;
      option.textContent = getLabel(param);
      xAxisSelect.appendChild(option);
    });

    const availableMetricOptions = yMetricOptions.filter((metric) => {
      if (metric.type === "direct") {
        return columns.includes(metric.key);
      }
      if (metric.type === "ratio") {
        return columns.includes(metric.numerator) && columns.includes(metric.denominator);
      }
      return false;
    });

    const isPctLabel = (metric) => String(metric.label || "").startsWith("Pct");
    const orderedMetricOptions = [
      ...availableMetricOptions.filter((metric) => !isPctLabel(metric)),
      ...availableMetricOptions.filter(isPctLabel)
    ];

    orderedMetricOptions.forEach((metric) => {
      const optionLeft = document.createElement("option");
      optionLeft.value = metric.key;
      optionLeft.textContent = metric.label;
      yAxisLeftSelect.appendChild(optionLeft);

      const optionRight = document.createElement("option");
      optionRight.value = metric.key;
      optionRight.textContent = metric.label;
      yAxisRightSelect.appendChild(optionRight);
    });

    const displayParams = getDisplayParams();
    if (displayParams.length) {
      xAxisSelect.value = displayParams[0];
    }

    const evalCostDefault =
      orderedMetricOptions.find((metric) => metric.key === "true_cost") ||
      orderedMetricOptions[0];

    if (evalCostDefault) yAxisLeftSelect.value = evalCostDefault.key;
    if (evalCostDefault) yAxisRightSelect.value = evalCostDefault.key;

    // Populate per-plot method selects
    const methodValues = getUniqueValues(dataset, "mht_method");
    const filteredMethodValues = gridPlotsMode
      ? filterGridMhtValues(methodValues)
      : methodValues.filter((v) => allowedMhtMethods.has(String(v)));
    [
      { sel: methodLeftSelect,  preferredSlug: "group_conformal_random" },
      { sel: methodRightSelect, preferredSlug: "co_optimized" },
    ].forEach(({ sel, preferredSlug }) => {
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = "";
      filteredMethodValues.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = getOptionLabel("mht_method", v);
        sel.appendChild(opt);
      });
      if (prev && filteredMethodValues.includes(prev)) sel.value = prev;
      else sel.value = filteredMethodValues.includes(preferredSlug)
        ? preferredSlug
        : filteredMethodValues[0] || "";
    });
  };

  const getCurrentFilters = () => {
    const filters = {};
    filterControls.querySelectorAll("select").forEach((select) => {
      if (select.value) {
        filters[select.dataset.param] = select.value;
      }
    });
    return filters;
  };

  const buildFilterControls = () => {
    filterControls.innerHTML = "";
    const xAxis = xAxisSelect.value;
    const currentFilters = getCurrentFilters();

    getDisplayParams()
      .filter((param) => param !== xAxis && param !== "mht_method")
      .forEach((param) => {
        const wrapper = document.createElement("div");
        wrapper.className = "sfps-field";
        const label = document.createElement("label");
        label.textContent = getLabel(param);
        label.setAttribute("for", `filter-${param}`);
        const select = document.createElement("select");
        select.id = `filter-${param}`;
        select.dataset.param = param;

        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "All";
        select.appendChild(allOption);

        const filteredRows = dataset.filter((row) =>
          Object.entries(currentFilters).every(([key, value]) => {
            if (key === param) return true;
            return String(row[key]) === value;
          })
        );

        let values = getUniqueValues(filteredRows, param);
        if (param === "mht_method" && !gridPlotsMode) {
          values = values.filter((value) => allowedMhtMethods.has(String(value)));
        }
        if (param === "mht_method" && gridPlotsMode) {
          values = filterGridMhtValues(values);
        }
        values.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent =
            param === "mht_method" ? getOptionLabel(param, value) : value;
          select.appendChild(option);
        });

        select.addEventListener("change", renderPlot);
        if (currentFilters[param]) {
          select.value = currentFilters[param];
          if (select.value !== currentFilters[param]) {
            select.value = "";
          }
        }
        wrapper.appendChild(label);
        wrapper.appendChild(select);
        filterControls.appendChild(wrapper);
      });
  };

  const computeStats = (values) => {
    const nums = values.map((val) => Number(val)).filter((val) => !Number.isNaN(val));
    if (!nums.length) return { mean: 0, std: 0 };
    const mean = nums.reduce((sum, val) => sum + val, 0) / nums.length;
    const variance =
      nums.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / nums.length;
    return { mean, std: Math.sqrt(variance) };
  };

  const renderPlot = () => {
    if (!dataset.length) return;
    const xAxis = xAxisSelect.value;
    const leftMetric = yAxisLeftSelect.value;
    const rightMetric = yAxisRightSelect.value;

    const filters = getCurrentFilters();

    const filteredRows = dataset.filter((row) =>
      Object.entries(filters).every(([key, value]) => String(row[key]) === value)
    );

    const getMetricConfig = (metricKey) =>
      yMetricOptions.find((metric) => metric.key === metricKey);

    const isMetricAvailable = (metric) => {
      if (!metric) return false;
      if (metric.type === "direct") {
        return numericColumns.includes(metric.key);
      }
      if (metric.type === "ratio") {
        return columns.includes(metric.numerator) && columns.includes(metric.denominator);
      }
      return false;
    };

    const getMetricValue = (row, metric) => {
      if (metric.type === "direct") {
        const raw = Number(row[metric.key]);
        if (Number.isNaN(raw)) return NaN;
        return metric.valueScale != null ? raw * metric.valueScale : raw;
      }
      if (metric.type === "ratio") {
        const numerator = Number(row[metric.numerator]);
        const denominator = Number(row[metric.denominator]);
        if (Number.isNaN(numerator) || Number.isNaN(denominator) || denominator === 0) {
          return NaN;
        }
        return (numerator / denominator) * 100;
      }
      return NaN;
    };

    const renderMetricPlot = (targetEl, metricKey, methodFilter) => {
      const metric = getMetricConfig(metricKey);
      const yLabel = getMetricLabel(metricKey);
      if (!isMetricAvailable(metric)) {
        targetEl.innerHTML = `<div class="sfps-status">${yLabel} unavailable</div>`;
        return;
      }

      const plotRows = methodFilter
        ? filteredRows.filter((r) => r.mht_method === methodFilter)
        : filteredRows;

      const grouped = new Map();
      plotRows.forEach((row) => {
        const xValue = row[xAxis];
        if (xValue === undefined || xValue === null || xValue === "") return;
        if (!grouped.has(xValue)) grouped.set(xValue, []);
        grouped.get(xValue).push(getMetricValue(row, metric));
      });

      const xValues = Array.from(grouped.keys());
      const sortedXValues = xValues.every((val) => !Number.isNaN(Number(val)))
        ? xValues.sort((a, b) => Number(a) - Number(b))
        : xValues.sort();

      // Map raw mht_method slugs to human-readable labels on the x-axis
      const xDisplayValues = xAxis === "mht_method"
        ? sortedXValues.map((v) => getOptionLabel("mht_method", v))
        : sortedXValues;

      const means = [];
      const uppers = [];
      const lowers = [];

      sortedXValues.forEach((xValue) => {
        const stats = computeStats(grouped.get(xValue));
        means.push(stats.mean);
        uppers.push(stats.mean + stats.std);
        lowers.push(stats.mean - stats.std);
      });

      const meanTrace = {
        x: xDisplayValues,
        y: means,
        type: "scatter",
        mode: "lines+markers",
        name: `${yLabel} mean`,
        line: { color: "#1f77b4" }
      };

      const upperTrace = {
        x: xDisplayValues,
        y: uppers,
        type: "scatter",
        mode: "lines",
        line: { width: 0 },
        hoverinfo: "skip",
        showlegend: false
      };

      const lowerTrace = {
        x: xDisplayValues,
        y: lowers,
        type: "scatter",
        mode: "lines",
        fill: "tonexty",
        fillcolor: "rgba(31, 119, 180, 0.2)",
        line: { width: 0 },
        name: "±1 std",
        hoverinfo: "skip"
      };

      const yAxisConfig = { title: yLabel };
      if (metric.type === "ratio") {
        yAxisConfig.rangemode = "tozero";
      }

      const layout = {
        xaxis: { title: getLabel(xAxis) },
        yaxis: yAxisConfig,
        margin: { t: 20, r: 20, b: 80, l: 60 },
        legend: {
          orientation: "h",
          x: 0.5,
          xanchor: "center",
          y: -0.25,
          yanchor: "top"
        }
      };

      Plotly.newPlot(targetEl, [upperTrace, lowerTrace, meanTrace], layout, {
        responsive: true
      });
    };

    renderMetricPlot(trendPlotOpt, leftMetric, methodLeftSelect ? methodLeftSelect.value : "");
    renderMetricPlot(trendPlotTrue, rightMetric, methodRightSelect ? methodRightSelect.value : "");
    plotTitleLeft.textContent = getMetricLabel(leftMetric);
    plotTitleRight.textContent = getMetricLabel(rightMetric);
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
    columns = rows.length ? Object.keys(rows[0]) : [];
    numericColumns = columns.filter((col) => isNumericColumn(rows, col));
    availableParams = hyperparams.filter((param) => columns.includes(param));

    if (gridPlotsMode && rows.length) {
      rebuildGridImageMetaFromDataset();
      const exp0 = rows.filter((r) => Number(r.exp_id) === GRID_MAP_EXP_ID);
      syncGridImageDefaultsFromDataset(exp0.length ? exp0 : rows);
    }

    if (!numericColumns.length || !availableParams.length) {
      return;
    }

    buildAxisSelects();
    buildFilterControls();
    buildImageControls();
    renderPlot();
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

  xAxisSelect.addEventListener("change", () => {
    buildFilterControls();
    renderPlot();
  });
  yAxisLeftSelect.addEventListener("change", renderPlot);
  yAxisRightSelect.addEventListener("change", renderPlot);
  if (methodLeftSelect) methodLeftSelect.addEventListener("change", renderPlot);
  if (methodRightSelect) methodRightSelect.addEventListener("change", renderPlot);
  resetPart1Button.addEventListener("click", () => {
    buildAxisSelects();
    filterControls.querySelectorAll("select").forEach((select) => {
      select.value = "";
    });
    buildFilterControls();
    renderPlot();
  });
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
