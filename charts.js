// OSMSG Leaderboard — charts.js

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
let _hashtagMetric    = "changes"; // "changes" | "users" | "changesets"

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
        <div class="osmsg-metric-toggle" id="hashtag-metric-toggle">
          <button class="osmsg-metric-btn active" data-metric="changes">Map changes</button>
          <button class="osmsg-metric-btn" data-metric="users">Users</button>
          <button class="osmsg-metric-btn" data-metric="changesets">Changesets</button>
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


  document.getElementById("hashtag-metric-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest(".osmsg-metric-btn");
    if (!btn) return;
    document.querySelectorAll(".osmsg-metric-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    _hashtagMetric = btn.dataset.metric;
    renderHashtagPieChart(); // re-render with new metric
  });
}



function renderEditorBarChart() {
  _ensureChartsSection();

  const card    = document.getElementById("editor-chart-card");
  const legendEl = document.getElementById("editor-bar-legend");
  const canvasEl = document.getElementById("editor-bar-canvas");
  if (!card || !legendEl || !canvasEl) return;

  const editorStats = state.editorStats;
  if (!editorStats || !editorStats.top5 || !editorStats.top5.length) {
    card.hidden = true;
    return;
  }

  const top5 = editorStats.top5;
  card.hidden = false;

  legendEl.innerHTML = top5.map((r, i) => {
    const color = CHART_BAR_COLORS[i] || CHART_BAR_COLORS[4];
    return `<span class="osmsg-bar-legend-item">
      <span class="osmsg-bar-legend-dot" style="background:${color}"></span>
      ${escapeHtml(r.editor)}
      <span style="color:var(--ink-2);font-weight:500;">${fmt.format(r.users)}u</span>
    </span>`;
  }).join("");

  if (_editorBarChart) {
    _editorBarChart.destroy();
    _editorBarChart = null;
  }

  const { grid, tick } = _chartColors();

  _editorBarChart = new Chart(canvasEl, {
    type: "bar",
    data: {
      labels: top5.map(r => r.editor),
      datasets: [{
        label: "Map changes",
        data: top5.map(r => r.changes),
        backgroundColor: top5.map((_, i) => CHART_BAR_COLORS[i] || CHART_BAR_COLORS[4]),
        borderRadius: 7,
        borderSkipped: false,
        barPercentage: 0.65,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          padding: 10,
          callbacks: {
            title: items => items[0].label,
            label: ctx => {
              const r = top5[ctx.dataIndex];
              return [
                `  Changes    : ${fmt.format(r.changes)}`,
                `  Users      : ${fmt.format(r.users)}`,
                `  Changesets : ${fmt.format(r.changesets)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tick, maxRotation: 20, font: { size: 11 } },
        },
        y: {
          grid: { color: grid },
          border: { dash: [3, 3] },
          ticks: {
            color: tick,
            font: { size: 11 },
            callback: v =>
              v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M"
              : v >= 1_000   ? (v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1) + "k"
              : v,
          },
        },
      },
    },
  });
}



function renderHashtagPieChart() {   
  _ensureChartsSection();

  const card     = document.getElementById("hashtag-chart-card");
  const canvasEl = document.getElementById("hashtag-bar-canvas");
  const wrapEl   = document.getElementById("hashtag-canvas-wrap");
  const totalEl  = document.getElementById("hashtag-stat-total");
  const countEl  = document.getElementById("hashtag-stat-count");
  if (!card || !canvasEl || !wrapEl) return;


  const aggChanges    = {};
  const aggUsers      = {};
  const aggChangesets = {};

  for (const r of state.rows) {
    const tags = (r.hashtags || [])
      .filter(Boolean)
      .map(h => "#" + String(h).replace(/^#/, "").toLowerCase());

    const keys = tags.length ? tags : ["(no hashtag)"];
    const share = 1 / keys.length; 

    for (const t of keys) {
      aggChanges[t]    = (aggChanges[t]    || 0) + r.map_changes    * share;
      aggChangesets[t] = (aggChangesets[t] || 0) + r.changesets     * share;
      
      aggUsers[t]      = (aggUsers[t]      || 0) + share;
    }
  }

  for (const k of Object.keys(aggUsers)) aggUsers[k] = Math.round(aggUsers[k]);

  const aggMap = {
    changes   : aggChanges,
    users     : aggUsers,
    changesets: aggChangesets,
  };
  const dataMap = aggMap[_hashtagMetric] || aggChanges;

  const entries = Object.entries(dataMap)
    .map(([k, v]) => ({ tag: k, value: Math.round(v) }))
    .filter(e => e.value > 0)
    .sort((a, b) => b.value - a.value);

  if (entries.length < 2) {
    card.hidden = true;
    return;
  }

  card.hidden = false;

  const MAX_BARS  = 15;
  const shown     = entries.slice(0, MAX_BARS);
  const total     = entries.reduce((s, e) => s + e.value, 0);
  const shownSum  = shown.reduce((s, e) => s + e.value, 0);

  const metricLabel = { changes: "map changes", users: "users", changesets: "changesets" }[_hashtagMetric];
  totalEl.textContent = `Total: ${fmt.format(total)} ${metricLabel}`;
  countEl.textContent = entries.length > MAX_BARS
    ? `Showing top ${MAX_BARS} of ${entries.length} hashtags`
    : `${entries.length} hashtag${entries.length === 1 ? "" : "s"}`;

  const barH = 34;
  const canvasH = shown.length * barH + 60;
  wrapEl.style.height = canvasH + "px";

  if (_hashtagBarChart) {
    _hashtagBarChart.destroy();
    _hashtagBarChart = null;
  }

  const { grid, tick, bg } = _chartColors();


  function tagColor(tag) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
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
                `  Share: ${pct}%`,
              ];
            },
          },
        },
        afterDraw: null,
      },
      scales: {
        x: {
          grid: { color: grid },
          border: { dash: [3, 3] },
          ticks: {
            color: tick,
            font: { size: 11 },
            callback: v =>
              v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M"
              : v >= 1_000   ? (v / 1_000).toFixed(0) + "k"
              : v,
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: tick,
            font: { size: 12 },
            autoSkip: false,
          },
        },
      },
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
      },
    }],
  });
}