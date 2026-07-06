// OSMSG Leaderboard 
const CHART_BAR_COLORS = [
  "#2D6A4F",
  "#E76F51",
  "#457B9D",
  "#F4A261",
  "#6A4C93",
];

const CHART_HASHTAG_COLORS = [
  "#264653", "#2A9D8F", "#E9C46A", "#F4A261", "#E76F51",
  "#457B9D", "#6A4C93", "#81B29A", "#F2CC8F", "#A8DADC",
  "#3D405B", "#81B29A", "#F2CC8F", "#E07A5F", "#3D7068",
  "#B5838D", "#6D6875", "#A2D2FF", "#CDB4DB", "#FFAFCC",
];

let _editorBarChart   = null;
let _hashtagBarChart  = null;
let _hashtagMetric    = "users";

function _isDark() {
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

function _chartColors() {
  const dark = _isDark();
  return {
    grid  : dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
    tick  : dark ? "#a0a89e"                : "#717D78",
    border: dark ? "#1A2421"                : "#ffffff",
    bg    : dark ? "#111815"                : "#ffffff",
  };
}

const CHART_HEIGHT = 260;

function _ensureChartsSection() {
  if (document.getElementById("osmsg-charts-row")) return;

  const main = document.querySelector("main[role='main']");
  if (!main) return;

  const style = document.createElement("style");
  style.textContent = `
    #osmsg-charts-section { margin-top: 0; }
    #osmsg-charts-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: stretch;
    }
    .osmsg-chart-card {
      background: var(--surface);
      border: 1px solid var(--bd);
      border-radius: 16px;
      box-shadow: var(--shadow-s1);
      padding: 20px;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .osmsg-chart-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
      font-weight: 600;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .osmsg-bar-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      margin-bottom: 14px;
    }
    .osmsg-bar-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      color: var(--muted);
      white-space: nowrap;
    }
    .osmsg-bar-legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .osmsg-chart-canvas-wrap {
      position: relative;
      width: 100%;
      flex: 1;
    }
    .osmsg-metric-toggle {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .osmsg-metric-btn {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 20px;
      border: 1px solid var(--bd);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      font-weight: 500;
      letter-spacing: 0.03em;
    }
    .osmsg-metric-btn:hover {
      background: var(--surface-hover, rgba(0,0,0,0.05));
    }
    .osmsg-metric-btn.active {
      background: var(--ink, #1A2421);
      color: var(--surface, #fff);
      border-color: transparent;
    }
    .osmsg-hashtag-stat-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 8px;
      padding: 0 2px;
    }
    @media (max-width: 720px) {
      #osmsg-charts-row { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  const section = document.createElement("section");
  section.setAttribute("aria-label", "Charts");
  section.id = "osmsg-charts-section";
  section.innerHTML = `
    <div id="osmsg-charts-row">

      <div id="editor-chart-card" class="osmsg-chart-card" hidden>
        <div class="osmsg-chart-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          Editors
        </div>
        <div id="editor-bar-legend" class="osmsg-bar-legend"></div>
        <div class="osmsg-chart-canvas-wrap" style="height:${CHART_HEIGHT}px;">
          <canvas id="editor-bar-canvas" role="img"
            aria-label="Bar chart of map changes by editor software"></canvas>
        </div>
      </div>

      <div id="hashtag-chart-card" class="osmsg-chart-card" hidden>
        <div class="osmsg-chart-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="4" y1="9" x2="20" y2="9"/>
            <line x1="4" y1="15" x2="20" y2="15"/>
            <line x1="10" y1="3" x2="8" y2="21"/>
            <line x1="16" y1="3" x2="14" y2="21"/>
          </svg>
          Contributions by hashtag
        </div>
        <div class="osmsg-hashtag-stat-row">
          <span id="hashtag-stat-total"></span>
          <span id="hashtag-stat-count"></span>
        </div>
        <div class="osmsg-chart-canvas-wrap" id="hashtag-canvas-wrap">
          <canvas id="hashtag-bar-canvas" role="img"
            aria-label="Horizontal bar chart of contributions per hashtag"></canvas>
        </div>
      </div>

    </div>`;

  main.appendChild(section);
}

function renderEditorBarChart() {
  _ensureChartsSection();

  const card     = document.getElementById("editor-chart-card");
  const canvasEl = document.getElementById("editor-bar-canvas");
  const legendEl = document.getElementById("editor-bar-legend");

  if (!card || !canvasEl || !legendEl) return;

  const stats = state.editorStats;
  if (!stats || !stats.top5 || stats.top5.length === 0) {
    card.hidden = true;
    return;
  }

  card.hidden = false;

  const { grid, tick } = _chartColors();
  const top5 = stats.top5;
  const colors = top5.map((_, i) => CHART_BAR_COLORS[i % CHART_BAR_COLORS.length]);


  legendEl.innerHTML = top5
    .map((e, i) => `
      <span class="osmsg-bar-legend-item">
        <span class="osmsg-bar-legend-dot" style="background:${colors[i]}"></span>
        ${escapeHtml(shortEditor(e.editor))}
      </span>`)
    .join("");

  if (_editorBarChart) {
    _editorBarChart.destroy();
    _editorBarChart = null;
  }

  _editorBarChart = new Chart(canvasEl, {
    type: "bar",
    data: {
      labels: top5.map(e => shortEditor(e.editor)),
      datasets: [{
        label: "Map changes",
        data: top5.map(e => e.changes),
        backgroundColor: colors,
        borderRadius: 5,
        borderSkipped: false,
        barPercentage: 0.6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          padding: 10,
          callbacks: {
            title: items => items[0].label,
            label: ctx => {
              const e = top5[ctx.dataIndex];
              return [
                `  Changes: ${fmt.format(e.changes)}`,
                `  Users: ${fmt.format(e.users)}`,
                `  Changesets: ${fmt.format(e.changesets)}`,
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: tick,
            font: {
              size: 11
            }
          }
        },
        y: {
          grid: {
            color: grid
          },
          border: {
            dash: [3, 3]
          },
          ticks: {
            color: tick,
            font: {
              size: 11
            },
            callback: v =>
              v >= 1000000
                ? (v / 1000000).toFixed(1) + "M"
                : v >= 1000
                ? (v / 1000).toFixed(0) + "k"
                : v
          }
        }
      }
    }
  });
}


const HASHTAG_METRIC_CONFIG = {
  users:      { field: null,           label: "Users" },      
  changes:    { field: "map_changes",  label: "Changes" },
  changesets: { field: "changesets",   label: "Changesets" },
};

function renderHashtagPieChart() {
  _ensureChartsSection();

  const card     = document.getElementById("hashtag-chart-card");
  const canvasEl = document.getElementById("hashtag-bar-canvas");
  const wrapEl   = document.getElementById("hashtag-canvas-wrap");
  const totalEl  = document.getElementById("hashtag-stat-total");
  const countEl  = document.getElementById("hashtag-stat-count");

  if (!card || !canvasEl || !wrapEl) return;

  function normalizeHashtags(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") return raw.split(/[,\s]+/);
    return [];
  }

  const metricCfg = HASHTAG_METRIC_CONFIG[_hashtagMetric] || HASHTAG_METRIC_CONFIG.users;

  
  const aggData = {};
  let rowsWithNoTags = 0;
  let rowsSeen = 0;

  for (const r of (state.rows || [])) {
    rowsSeen++;

    const tags = [...new Set(
      normalizeHashtags(r.hashtags)
        .map(h => String(h || "").trim())
        .filter(h =>
          h.length > 0 &&
          h !== "-" &&
          h !== "--" &&
          h.toLowerCase() !== "null" &&
          h.toLowerCase() !== "undefined" &&
          h.toLowerCase() !== "none" &&
          h.toLowerCase() !== "n/a"
        )
        .map(h => "#" + h.replace(/^#/, "").toLowerCase())
        .filter(h => h.length > 1)
    )];

    if (tags.length === 0) {
      rowsWithNoTags++;
      continue;
    }

    const value = metricCfg.field === null
      ? 1                                   
      : Number(r[metricCfg.field]) || 0;

    if (value === 0) continue;
    const share = value / tags.length;

    for (const tag of tags) {
      aggData[tag] = (aggData[tag] || 0) + share;
    }
  }

  const entries = Object.entries(aggData)
    .map(([tag, value]) => ({ tag, value: Math.round(value) }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value);

  if (entries.length === 0) {
    console.warn(
      `[hashtag-chart] No entries to show. rowsSeen=${rowsSeen}, rowsWithNoTags=${rowsWithNoTags}, metric=${_hashtagMetric}`
    );
    card.hidden = true;
    return;
  }

  card.hidden = false;

  const MAX_BARS = 5;
  const shown = entries.slice(0, MAX_BARS);
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  const metricLabel = metricCfg.label;

  totalEl.textContent = `Total: ${fmt.format(total)} ${metricLabel}`;

  countEl.textContent =
    entries.length > MAX_BARS
      ? `Showing top ${MAX_BARS} of ${entries.length} hashtags`
      : `${entries.length} hashtag${entries.length === 1 ? "" : "s"}`;

  const barH = 34;
  const canvasH = shown.length * barH + 60;
  wrapEl.style.height = canvasH + "px";

  if (_hashtagBarChart) {
    _hashtagBarChart.destroy();
    _hashtagBarChart = null;
  }

  const { grid, tick } = _chartColors();

  function tagColor(tag) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) {
      h = (h * 31 + tag.charCodeAt(i)) >>> 0;
    }
    return CHART_HASHTAG_COLORS[h % CHART_HASHTAG_COLORS.length];
  }

  const colors = shown.map(e => tagColor(e.tag));

  _hashtagBarChart = new Chart(canvasEl, {
    type: "bar",
    data: {
      labels: shown.map(e => e.tag),
      datasets: [{
        label: metricLabel,
        data: shown.map(e => e.value),
        backgroundColor: colors,
        borderRadius: 5,
        borderSkipped: false,
        barPercentage: 0.72,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 60 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          padding: 10,
          callbacks: {
            title: items => items[0].label,
            label: ctx => {
              const e = shown[ctx.dataIndex];
              const pct = total ? ((e.value / total) * 100).toFixed(1) : "0";
              return [
                `  ${metricLabel}: ${fmt.format(e.value)}`,
                `  Share: ${pct}%`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: grid },
          border: { dash: [3, 3] },
          ticks: {
            color: tick,
            font: { size: 11 },
            callback: v =>
              v >= 1000000 ? (v / 1000000).toFixed(1) + "M"
              : v >= 1000 ? (v / 1000).toFixed(0) + "k"
              : v
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: tick, font: { size: 12 }, autoSkip: false }
        }
      }
    },
    plugins: [{
      id: "hashtagValueLabels",
      afterDatasetsDraw(chart) {
        const { ctx, data, scales: { x, y } } = chart;
        ctx.save();
        ctx.font = "500 11px sans-serif";
        ctx.fillStyle = tick;
        ctx.textBaseline = "middle";

        data.datasets[0].data.forEach((val, i) => {
          const pct = total ? ((val / total) * 100).toFixed(1) : "0";
          const xPos = x.getPixelForValue(val) + 6;
          const yPos = y.getPixelForValue(i);
          ctx.fillText(`${fmt.format(val)}  ${pct}%`, xPos, yPos);
        });

        ctx.restore();
      }
    }]
  });
}