// OSMSG Leaderboard : app logic
const API_BASE = "https://osmsg.osgeonepal.org";
const ENDPOINT = "/api/v1/stats";
const HEALTH_ENDPOINT = "/health";
const ALL_TIME_START = "2004-08-09T00:00:00Z";
const RANGE_HOURS = { "1h": 1, "24h": 24, "7d": 168, "30d": 720, "90d": 2160 };
const RANGE_LABELS = { "1h": "last hour", "24h": "last 24 hours", "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days", "all": "all-time", "custom": "custom range" };
const REFRESH_INTERVAL_MS = 60_000;
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const state = {
    hashtags: [], range: "24h", customStart: null, customEnd: null,
    live: true, rows: [], filteredRows: [],
    sort: { key: "map_changes", dir: "desc" }, filter: "all", search: "",
    windowStart: null, windowEnd: null, lastFetched: null, lastError: null,
    health: null,
    loading: false, status: "loading", refreshTimer: null, agoTimer: null,
    clockTimer: null, inflight: null, page: 1, pageSize: 25,
    osmAvatars: new Map(),
};

function fetchOsmAvatar(uid) {
    if (uid == null) return Promise.resolve(null);
    const key = String(uid);
    if (state.osmAvatars.has(key)) return state.osmAvatars.get(key);
    const p = fetch(`https://api.openstreetmap.org/api/0.6/user/${encodeURIComponent(key)}.json`, {
        headers: { "Accept": "application/json" },
    }).then(r => r.ok ? r.json() : null)
        .then(j => j?.user?.img?.href || null)
        .catch(() => null);
    state.osmAvatars.set(key, p);
    return p;
}

function applyAvatar(el, uid, fallbackText) {
    if (!el) return;
    fetchOsmAvatar(uid).then(url => {
        if (!url) return;
        if (el.dataset.osmUid !== String(uid)) return;
        el.innerHTML = `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=${JSON.stringify(fallbackText)}">`;
    });
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = new Intl.NumberFormat("en-US");
const dtf = (opts) => new Intl.DateTimeFormat(undefined, { ...opts, hour12: false, timeZone: TZ });
const dtfFull = dtf({ year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dtfShort = dtf({ month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const dtfDate = dtf({ year: "numeric", month: "short", day: "2-digit" });
const dtfClock = dtf({ hour: "2-digit", minute: "2-digit", second: "2-digit" });

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const refreshIcons = (root) => window.lucide?.createIcons?.(root ? { attrs: { "stroke-width": 2 }, nameAttr: "data-lucide", icons: window.lucide.icons } : { attrs: { "stroke-width": 2 } });
const isoUTC = (d) => d.toISOString().replace(/\.\d+Z$/, "Z");
const nowUTC = () => new Date();

function tzOffsetLabel() {
    const m = -new Date().getTimezoneOffset(), s = m >= 0 ? "+" : "−", a = Math.abs(m);
    return `UTC${s}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
function rangeWindow(k) {
    const end = nowUTC();
    if (k === "all") return { start: new Date(ALL_TIME_START), end };
    if (k === "custom") return { start: state.customStart || new Date(end - 86400000), end: state.customEnd || end };
    return { start: new Date(end - (RANGE_HOURS[k] || 24) * 3600000), end };
}
function ago(d) {
    if (!d) return "never";
    const s = Math.max(0, Math.round((Date.now() - d) / 1000));
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = s / 60 | 0; if (m < 60) return `${m}m ago`;
    const h = m / 60 | 0; if (h < 24) return `${h}h ago`;
    return `${h / 24 | 0}d ago`;
}
function avatarColor(name) {
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return ["#2D5F3F", "#3A6E4A", "#1F4D2E", "#4A7C5C", "#1F5C3D"][h % 5];
}
function initials(name) {
    if (!name) return "?";
    const p = name.replace(/[_\-]+/g, " ").split(/\s+/).filter(Boolean);
    return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p.at(-1)[0]).toUpperCase();
}
function sumTagKey(ts, k) {
    const n = ts[k]; if (!n) return { c: 0, m: 0 };
    let c = 0, m = 0;
    for (const v in n) { c += n[v].c; m += n[v].m; }
    return { c, m };
}

function transform(row) {
    const ts = row.tag_stats || {};
    const b = sumTagKey(ts, "building"), h = sumTagKey(ts, "highway");
    const lu = sumTagKey(ts, "landuse"), wt = sumTagKey(ts, "waterway");
    const nt = sumTagKey(ts, "natural"), am = sumTagKey(ts, "amenity");
    return {
        uid: row.uid,
        username: row.name,
        rank: row.rank,
        changesets: row.changesets,
        map_changes: row.map_changes,
        nodes_created: row.nodes_create, nodes_modified: row.nodes_modify, nodes_deleted: row.nodes_delete,
        ways_created: row.ways_create, ways_modified: row.ways_modify, ways_deleted: row.ways_delete,
        rels_created: row.rels_create, rels_modified: row.rels_modify, rels_deleted: row.rels_delete,
        pois_created: row.poi_create, pois_modified: row.poi_modify,
        buildings_created: b.c, buildings_modified: b.m,
        highways_created: h.c, highways_modified: h.m,
        landuse_created: lu.c, landuse_modified: lu.m,
        waterways_created: wt.c, waterways_modified: wt.m,
        natural_created: nt.c, natural_modified: nt.m,
        amenities_created: am.c, amenities_modified: am.m,
        created: row.nodes_create + row.ways_create + row.rels_create,
        modified: row.nodes_modify + row.ways_modify + row.rels_modify,
        deleted: row.nodes_delete + row.ways_delete + row.rels_delete,
        tag_stats: ts,
    };
}

const hashtagInput = $("#hashtag-input"), chipsEl = $("#chips");
function renderChips() {
    chipsEl.innerHTML = state.hashtags.map((h, i) =>
        `<span class="chip">#${escapeHtml(h)}<button type="button" data-i="${i}" aria-label="Remove ${escapeHtml(h)}"><i data-lucide="x"></i></button></span>`
    ).join("");
    chipsEl.querySelectorAll("button").forEach(b => b.onclick = () => {
        state.hashtags.splice(+b.dataset.i, 1); renderChips(); apply();
    });
    refreshIcons();
}
function addHashtag(raw) {
    const h = raw.trim().replace(/^#/, "").toLowerCase();
    if (!h || state.hashtags.includes(h)) return false;
    state.hashtags.push(h); renderChips(); return true;
}
hashtagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        if (hashtagInput.value.trim() && addHashtag(hashtagInput.value)) { hashtagInput.value = ""; apply(); }
        else hashtagInput.value = "";
    } else if (e.key === "Backspace" && !hashtagInput.value && state.hashtags.length) {
        state.hashtags.pop(); renderChips(); apply();
    }
});
hashtagInput.addEventListener("blur", () => {
    if (hashtagInput.value.trim() && addHashtag(hashtagInput.value)) { hashtagInput.value = ""; apply(); }
});

const customRangePanel = $("#custom-range"), crRangeInput = $("#cr-range"), crClearBtn = $("#cr-clear");

const dateToUtcInput = (d) => {
    const p = n => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const utcInputToDate = (d) => new Date(Date.UTC(
    d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0
));

let crPicker = null;
function initCustomRangePicker() {
    if (crPicker || typeof window.flatpickr !== "function") return;
    crPicker = window.flatpickr(crRangeInput, {
        mode: "range",
        enableTime: true,
        time_24hr: true,
        dateFormat: "Y-m-d H:i",
        minuteIncrement: 5,
        allowInput: false,
        disableMobile: true,
        onChange: (dates) => {
            crClearBtn.hidden = dates.length === 0;
            if (dates.length !== 2) return;
            const s = utcInputToDate(dates[0]), e = utcInputToDate(dates[1]);
            if (s >= e) return toast({ msg: "Start must be before end", icon: "alert-triangle", err: true });
            state.customStart = s; state.customEnd = e; state.range = "custom"; apply();
        },
    });
}
crClearBtn?.addEventListener("click", () => {
    crPicker?.clear();
    state.customStart = state.customEnd = null;
    crClearBtn.hidden = true;
});

function setRangePreset(k) {
    $$(".preset button").forEach(b => b.setAttribute("aria-pressed", b.dataset.range === k ? "true" : "false"));
    state.range = k;
    customRangePanel.classList.toggle("show", k === "custom");
    if (k === "custom") {
        initCustomRangePicker();
        if (!state.customStart || !state.customEnd) {
            const end = nowUTC(), start = new Date(end - 86400000);
            crPicker?.setDate([dateToUtcInput(start), dateToUtcInput(end)], false);
            crClearBtn.hidden = false;
        } else {
            crPicker?.setDate([dateToUtcInput(state.customStart), dateToUtcInput(state.customEnd)], false);
            crClearBtn.hidden = false;
        }
    }
}
$$(".preset button").forEach(b => b.onclick = () => {
    setRangePreset(b.dataset.range);
    if (b.dataset.range !== "custom") { state.customStart = state.customEnd = null; apply(); }
});

const statusPill = $("#status-pill"), statusIconEl = $("#status-icon"), statusText = $("#status-text");
const STATUS_CFG = {
    loading: ["loader", true, "Connecting", "Fetching latest stats from the OSMSG API…"],
    live: ["cloud", false, "Connected", "Connected. Auto-refreshing every 60 seconds. Click to pause."],
    paused: ["pause", false, "Paused", "Auto-refresh paused. Click to resume."],
    error: ["cloud-off", false, "Disconnected", "Couldn't reach the OSMSG API. Click to retry."],
};
function setStatus(s) {
    state.status = s; statusPill.dataset.state = s;
    const [ic, spin, txt, title] = STATUS_CFG[s];
    statusIconEl.setAttribute("data-lucide", ic);
    statusIconEl.classList.toggle("ico-spin", spin);
    statusText.textContent = txt; statusPill.title = title;
    refreshIcons();
}
statusPill.addEventListener("click", () => {
    if (state.status === "loading") return;
    if (state.status === "error") return fetchData({});
    state.live = !state.live;
    if (state.live) { setStatus("live"); startAutoRefresh(); fetchData({ silent: true }); }
    else { setStatus("paused"); stopAutoRefresh(); }
});

const startAutoRefresh = () => {
    stopAutoRefresh();
    if (state.range === "all" || state.range === "custom") return;
    state.refreshTimer = setInterval(() => fetchData({ silent: true }), REFRESH_INTERVAL_MS);
};
const stopAutoRefresh = () => { if (state.refreshTimer) clearInterval(state.refreshTimer); state.refreshTimer = null; };

$("#query-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (hashtagInput.value.trim()) { addHashtag(hashtagInput.value); hashtagInput.value = ""; }
    apply();
});

function apply() {
    state.page = 1; writeURL(); fetchData({});
    state.live ? startAutoRefresh() : stopAutoRefresh();
}
async function fetchData({ silent = false } = {}) {
    state.inflight?.abort();
    state.loading = true;
    if (!silent) showLoading();
    setStatus("loading");
    const { start, end } = rangeWindow(state.range);
    state.windowStart = start; state.windowEnd = end;
    const url = new URL(ENDPOINT, API_BASE);
    url.searchParams.set("start", isoUTC(start));
    url.searchParams.set("end", isoUTC(end));
    state.hashtags.forEach(h => url.searchParams.append("hashtag", h));
    const ctrl = new AbortController(); state.inflight = ctrl;
    const timeout = setTimeout(() => ctrl.abort(), 30_000);
    renderWindowBar();
    try {
        const res = await fetch(url, { headers: { accept: "application/json" }, mode: "cors", signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
        const json = await res.json();
        state.rows = json.users.map(transform);
        state.lastFetched = new Date(); state.lastError = null;
        render(); fetchHealth(); updateLastUpdated();
        if (!silent && state.rows.length) toast({ msg: "Updated", icon: "check-circle-2" });
        setStatus(state.live ? "live" : "paused");
    } catch (err) {
        if (err?.name === "AbortError" && state.inflight !== ctrl) return;
        console.warn("OSMSG API fetch failed:", err);
        state.lastError = err; setStatus("error");
        if (!silent) showError(err);
        else toast({ msg: "Reconnect failed", icon: "cloud-off", err: true });
    } finally {
        clearTimeout(timeout); state.loading = false;
        if (state.inflight === ctrl) state.inflight = null;
    }
}

let toastTimer;
function toast({ msg, icon = "info", err = false } = {}) {
    const t = $("#toast");
    t.innerHTML = `<i data-lucide="${icon}"></i>${escapeHtml(msg)}`;
    t.classList.toggle("err", !!err); t.classList.add("show");
    refreshIcons();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function applyDerivedFilters() {
    const q = state.search.trim().toLowerCase();
    let rows = state.rows.slice();
    if (q) rows = rows.filter(r => r.username.toLowerCase().includes(q));
    if (state.filter === "creators") rows = rows.filter(r => r.created > r.modified);
    if (state.filter === "modifiers") rows = rows.filter(r => r.modified >= r.created);
    const { key, dir } = state.sort, mul = dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
        let av = a[key] ?? 0, bv = b[key] ?? 0;
        if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
        return av < bv ? -mul : av > bv ? mul : 0;
    });
    state.filteredRows = rows;
    state.page = Math.min(state.page, Math.max(1, Math.ceil(rows.length / state.pageSize)));
}
function render() {
    applyDerivedFilters();
    renderOverview(); renderPodium(); renderTable(); renderWindowBar();
}

function aggregateTagStats(rows) {
    const agg = {};
    for (const r of rows) {
        const ts = r.tag_stats;
        for (const key in ts) {
            const vals = ts[key];
            const a = agg[key] ||= { values: {}, totalC: 0, totalM: 0 };
            for (const v in vals) {
                const c = vals[v].c, m = vals[v].m;
                const slot = a.values[v] ||= { c: 0, m: 0 };
                slot.c += c; slot.m += m; a.totalC += c; a.totalM += m;
            }
        }
    }
    return agg;
}
function tagBreakdownHtml(agg, { maxKeys = 18 } = {}) {
    const keys = Object.entries(agg)
        .filter(([, v]) => v.totalC + v.totalM > 0)
        .sort((a, b) => (b[1].totalC + b[1].totalM) - (a[1].totalC + a[1].totalM));
    if (!keys.length) return { html: "", keyCount: 0, valueCount: 0 };
    const valueCount = keys.reduce((s, [, v]) => s + Object.keys(v.values).length, 0);
    const pct = (n, t) => t ? (n / t) * 100 : 0;
    const segDiv = (cls, w) => w > 0 ? `<div class="${cls}" style="width:${w}%"></div>` : "";
    const cntC = (n) => n ? `<span class="c">+${fmt.format(n)}</span>` : "";
    const cntM = (n) => n ? `<span class="m">~${fmt.format(n)}</span>` : "";

    let html = `<div class="tag-breakdown-grid">` + keys.slice(0, maxKeys).map(([key, d]) => {
        const t = d.totalC + d.totalM;
        return `<div class="tag-key-card">
      <div class="tag-key-head">
        <span class="tag-key-name">${escapeHtml(key)}</span>
        <span class="tag-key-totals">${cntC(d.totalC)}${cntM(d.totalM)}</span>
      </div>
      <div class="tag-key-bar" title="${d.totalC} created · ${d.totalM} modified">
        ${segDiv("seg-c", pct(d.totalC, t))}${segDiv("seg-m", pct(d.totalM, t))}
      </div>
    </div>`;
    }).join("") + `</div>`;
    if (keys.length > maxKeys) html += `<div class="tag-key-more" style="margin-top:10px;text-align:center">+ ${fmt.format(keys.length - maxKeys)} more key${keys.length - maxKeys === 1 ? "" : "s"} not shown</div>`;
    return { html, keyCount: keys.length, valueCount };
}

const OV_CELLS_TOTALS = [
    ["Created", "created", "plus-square", "ov-add"],
    ["Modified", "modified", "edit-3", "ov-mod"],
    ["Deleted", "deleted", "trash-2", "ov-del"],
    ["Mappers", "mappers", "users", ""],
    ["Changesets", "changesets", "git-commit-horizontal", ""],
];
const OV_CELLS = [
    ["Nodes", "nodes", "circle-dot", "elem"],
    ["Ways", "ways", "spline", "elem"],
    ["Relations", "rels", "share-2", "elem"],
    ["Buildings", "buildings", "building-2", "split"],
    ["Highways", "highways", "route", "split"],
    ["POIs", "pois", "map-pin", "split"],
    ["Landuse", "landuse", "layers", "split"],
    ["Waterways", "waterways", "waves", "split"],
    ["Natural", "natural", "trees", "split"],
    ["Amenities", "amenities", "coffee", "split"],
];
const renderOvCell = (data) => ([l, k, ic, mod]) => {
    if (mod === "split") {
        const c = data[k] || 0, m = data[k + "_mod"] || 0;
        const isZero = !c && !m;
        return `<div class="ov-cell ov-split${isZero ? " is-zero" : ""}">
      <div class="lbl"><i data-lucide="${ic}"></i>${l}</div>
      <div class="val"><span class="c">+${fmt.format(c)}</span><span class="m">~${fmt.format(m)}</span></div>
    </div>`;
    }
    if (mod === "elem") {
        const c = data[k + "_c"] || 0, m = data[k + "_m"] || 0, d = data[k + "_d"] || 0;
        const isZero = !c && !m && !d;
        return `<div class="ov-cell ov-elem${isZero ? " is-zero" : ""}">
      <div class="lbl"><i data-lucide="${ic}"></i>${l}</div>
      <div class="val"><span class="c" title="created">+${fmt.format(c)}</span><span class="m" title="modified">~${fmt.format(m)}</span><span class="d" title="deleted">−${fmt.format(d)}</span></div>
    </div>`;
    }
    return `<div class="ov-cell${mod ? " " + mod : ""}${data[k] ? "" : " is-zero"}">
    <div class="lbl"><i data-lucide="${ic}"></i>${l}</div>
    <div class="val">${fmt.format(data[k] || 0)}</div>
  </div>`;
};
const ovCellsHtml = (data) => OV_CELLS.map(renderOvCell(data)).join("");
const ovTotalsHtml = (data) => OV_CELLS_TOTALS.map(renderOvCell(data)).join("");
const rowTotals = (rows) => rows.reduce((a, r) => {
    a.created += r.created; a.modified += r.modified; a.deleted += r.deleted;
    a.changesets += r.changesets;
    a.nodes_c += r.nodes_created; a.nodes_m += r.nodes_modified; a.nodes_d += r.nodes_deleted;
    a.ways_c += r.ways_created; a.ways_m += r.ways_modified; a.ways_d += r.ways_deleted;
    a.rels_c += r.rels_created; a.rels_m += r.rels_modified; a.rels_d += r.rels_deleted;
    a.buildings += r.buildings_created; a.buildings_mod += r.buildings_modified;
    a.highways += r.highways_created; a.highways_mod += r.highways_modified;
    a.pois += r.pois_created; a.pois_mod += r.pois_modified;
    a.landuse += r.landuse_created; a.landuse_mod += r.landuse_modified;
    a.waterways += r.waterways_created; a.waterways_mod += r.waterways_modified;
    a.natural += r.natural_created; a.natural_mod += r.natural_modified;
    a.amenities += r.amenities_created; a.amenities_mod += r.amenities_modified;
    return a;
}, {
    created: 0, modified: 0, deleted: 0, changesets: 0,
    nodes_c: 0, nodes_m: 0, nodes_d: 0,
    ways_c: 0, ways_m: 0, ways_d: 0,
    rels_c: 0, rels_m: 0, rels_d: 0,
    buildings: 0, buildings_mod: 0, highways: 0, highways_mod: 0,
    pois: 0, pois_mod: 0, landuse: 0, landuse_mod: 0,
    waterways: 0, waterways_mod: 0, natural: 0, natural_mod: 0,
    amenities: 0, amenities_mod: 0,
});

function renderOverview() {
    const strip = $("#ov-strip"), totals = $("#ov-strip-totals"), breakdown = $("#ov-breakdown");
    const meta = $("#ov-breakdown-meta"), btn = $("#ov-toggle-btn"), label = $("#ov-toggle-label");
    if (!state.rows.length) {
        totals.innerHTML = "";
        strip.innerHTML = `<div class="tag-stats-empty" style="grid-column:1/-1">No data in this window. Try a wider time range or a different hashtag.</div>`;
        breakdown.innerHTML = ""; breakdown.hidden = true;
        btn.setAttribute("aria-expanded", "false"); btn.disabled = true; meta.textContent = "";
        return;
    }
    const data = { ...rowTotals(state.rows), mappers: state.rows.length };
    totals.innerHTML = ovTotalsHtml(data);
    strip.innerHTML = ovCellsHtml(data);
    const { html, keyCount, valueCount } = tagBreakdownHtml(aggregateTagStats(state.rows));
    if (keyCount) {
        breakdown.innerHTML = html;
        meta.textContent = `${fmt.format(keyCount)} tag key${keyCount === 1 ? "" : "s"} · ${fmt.format(valueCount)} value${valueCount === 1 ? "" : "s"} available`;
        btn.disabled = false;
    } else {
        breakdown.innerHTML = `<div class="tag-stats-empty">No detailed tag stats reported in this window.</div>`;
        meta.textContent = "no tag breakdown available"; btn.disabled = true;
    }
    const expanded = btn.getAttribute("aria-expanded") === "true";
    breakdown.hidden = !expanded;
    label.textContent = expanded ? "Hide tag breakdown" : "Show tag breakdown";
    refreshIcons();
}

function renderPodium() {
    const top3 = state.rows.slice().sort((a, b) => b.map_changes - a.map_changes).slice(0, 3);
    const el = $("#podium");
    if (!top3.length) {
        el.innerHTML = `<div class="empty" style="grid-column:1/-1"><i data-lucide="users"></i><h3>No contributors yet</h3><p>Try a different time range or hashtag.</p></div>`;
        return refreshIcons(el);
    }
    el.innerHTML = "";
    for (let i = 0; i < 3; i++) {
        const r = top3[i], place = i + 1;
        const div = document.createElement("div");
        div.className = `pod pod-${place} fade-in`;
        if (!r) {
            div.style.opacity = "0.4";
            div.innerHTML = `<span class="pod-rank">${place}</span><span class="pod-avatar">·</span><span class="pod-name">—</span><span class="pod-score-wrap"><span class="pod-score">0</span></span>`;
            el.appendChild(div); continue;
        }
        div.dataset.user = r.username;
        div.setAttribute("role", "button"); div.setAttribute("tabindex", "0");
        div.setAttribute("aria-label", `View ${r.username} contributions`);
        const created = (r.nodes_created || 0) + (r.ways_created || 0) + (r.rels_created || 0);
        const modified = (r.nodes_modified || 0) + (r.ways_modified || 0) + (r.rels_modified || 0);
        const deleted = (r.nodes_deleted || 0) + (r.ways_deleted || 0) + (r.rels_deleted || 0);
        div.innerHTML = `
      <span class="pod-rank">${place}</span>
      <span class="pod-avatar" data-osm-uid="${r.uid}" style="background:${avatarColor(r.username)}">${initials(r.username)}</span>
      <span class="pod-name" title="${escapeHtml(r.username)}">${escapeHtml(r.username)}</span>
      <span class="pod-score-wrap">
        <span class="pod-score">${fmt.format(r.map_changes)}</span>
        <div class="pod-score-label">changes</div>
      </span>
      <div class="pod-mini" aria-label="Created, modified, deleted">
        <span class="c" title="created"><i data-lucide="plus"></i>${fmt.format(created)}</span>
        <span class="m" title="modified"><i data-lucide="pencil"></i>${fmt.format(modified)}</span>
        <span class="d" title="deleted"><i data-lucide="minus"></i>${fmt.format(deleted)}</span>
      </div>`;
        applyAvatar(div.querySelector(".pod-avatar"), r.uid, initials(r.username));
        div.addEventListener("click", () => openUserModal(r.username));
        div.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openUserModal(r.username); }
        });
        el.appendChild(div);
    }
    refreshIcons(el);
}

const USER_TOTAL_CELLS = [
    ["Created", "created", "plus-square", "ov-add"],
    ["Modified", "modified", "edit-3", "ov-mod"],
    ["Deleted", "deleted", "trash-2", "ov-del"],
    ["Changesets", "changesets", "git-commit-horizontal", ""],
    ["Buildings", "buildings", "building-2", "split"],
    ["Highways", "highways", "route", "split"],
    ["POIs", "pois", "map-pin", "split"],
    ["Landuse", "landuse", "layers", "split"],
    ["Waterways", "waterways", "waves", "split"],
    ["Natural", "natural", "trees", "split"],
    ["Amenities", "amenities", "coffee", "split"],
];
const USER_ELEM_GROUPS = [
    ["Nodes", "circle-dot", "nodes_created", "nodes_modified", "nodes_deleted"],
    ["Ways", "spline", "ways_created", "ways_modified", "ways_deleted"],
    ["Relations", "share-2", "rels_created", "rels_modified", "rels_deleted"],
];
const elemCellsHtml = (r) => USER_ELEM_GROUPS.map(([l, ic, ck, mk, dk]) => {
    const c = r[ck] || 0, m = r[mk] || 0, d = r[dk] || 0;
    const isZero = !c && !m && !d;
    return `<div class="ov-cell ov-elem${isZero ? " is-zero" : ""}">
    <div class="lbl"><i data-lucide="${ic}"></i>${l}</div>
    <div class="val">
      <span class="c" title="created">+${fmt.format(c)}</span>
      <span class="m" title="modified">~${fmt.format(m)}</span>
      <span class="d" title="deleted">−${fmt.format(d)}</span>
    </div>
  </div>`;
}).join("");
const SPLIT_KEY_MAP = {
    buildings: ["buildings_created", "buildings_modified"],
    highways: ["highways_created", "highways_modified"],
    pois: ["pois_created", "pois_modified"],
    landuse: ["landuse_created", "landuse_modified"],
    waterways: ["waterways_created", "waterways_modified"],
    natural: ["natural_created", "natural_modified"],
    amenities: ["amenities_created", "amenities_modified"],
};
const cellsHtml = (cells, r) => cells.map(([l, k, ic, mod]) => {
    if (mod === "split") {
        const [ck, mk] = SPLIT_KEY_MAP[k];
        const c = r[ck] || 0, m = r[mk] || 0;
        const isZero = !c && !m;
        return `<div class="ov-cell ov-split${isZero ? " is-zero" : ""}">
      <div class="lbl"><i data-lucide="${ic}"></i>${l}</div>
      <div class="val"><span class="c">+${fmt.format(c)}</span><span class="m">~${fmt.format(m)}</span></div>
    </div>`;
    }
    return `<div class="ov-cell${mod ? " " + mod : ""}${r[k] ? "" : " is-zero"}">
    <div class="lbl"><i data-lucide="${ic}"></i>${l}</div>
    <div class="val">${fmt.format(r[k] || 0)}</div>
  </div>`;
}).join("");

function openUserModal(username) {
    const r = state.rows.find(x => x.username === username); if (!r) return;
    const modal = $("#user-modal");
    $("#user-modal-name").innerHTML = `<a href="https://www.openstreetmap.org/user/${encodeURIComponent(r.username)}" target="_blank" rel="noopener">${escapeHtml(r.username)}</a>`;
    $("#user-modal-sub").textContent = `rank #${state.rows.findIndex(x => x.username === username) + 1} · ${fmt.format(r.map_changes)} map changes · ${fmt.format(r.changesets)} changesets`;
    const av = $("#user-modal-avatar");
    av.style.background = avatarColor(r.username);
    av.textContent = initials(r.username);
    av.dataset.osmUid = String(r.uid);
    applyAvatar(av, r.uid, initials(r.username));

    const { html: tagHtml, keyCount, valueCount } = tagBreakdownHtml(aggregateTagStats([r]), { maxKeys: 24, maxVals: 8 });
    let html = `<div class="overview-strip">${cellsHtml(USER_TOTAL_CELLS, r)}</div>`;
    html += `<div class="overview-strip" style="margin-top:6px">${elemCellsHtml(r)}</div>`;
    if (keyCount) {
        html += `<div class="ov-toggle" style="border-bottom:none">
      <span class="ov-breakdown-meta">${fmt.format(keyCount)} tag key${keyCount === 1 ? "" : "s"} · ${fmt.format(valueCount)} value${valueCount === 1 ? "" : "s"}</span>
      <span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;font-weight:600;display:flex;align-items:center;gap:5px"><i data-lucide="tags"></i>Detailed tag contributions</span>
    </div>
    <div class="ov-breakdown" style="margin-top:8px">${tagHtml}</div>`;
    } else {
        html += `<div class="tag-stats-empty" style="margin-top:14px">No detailed tag stats reported for this contributor in this window.</div>`;
    }
    $("#user-modal-body").innerHTML = html;
    modal.hidden = false; modal.classList.add("open");
    document.body.style.overflow = "hidden";
    refreshIcons(modal); $("#user-modal-close").focus();
}
function closeUserModal() {
    const m = $("#user-modal"); m.hidden = true; m.classList.remove("open");
    document.body.style.overflow = "";
}

function renderTable() {
    const tb = $("#lb-body"), allRows = state.filteredRows;
    if (!allRows.length) {
        tb.innerHTML = `<tr><td colspan="8"><div class="empty"><i data-lucide="search-x"></i><h3>Nothing to show</h3><p>${state.rows.length ? "Try clearing your search." : "No data for this time range and hashtag combination yet."}</p></div></td></tr>`;
        refreshIcons(tb); renderPagination(0, 0, 0); return;
    }
    $$("th.sortable").forEach(th => {
        const k = th.dataset.sort, arrow = th.querySelector(".arrow");
        if (k === state.sort.key) {
            th.setAttribute("aria-sort", state.sort.dir === "asc" ? "ascending" : "descending");
            arrow.setAttribute("data-lucide", state.sort.dir === "asc" ? "arrow-up" : "arrow-down");
        } else {
            th.removeAttribute("aria-sort");
            arrow.setAttribute("data-lucide", "chevrons-up-down");
        }
    });
    const total = allRows.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const startIdx = (state.page - 1) * state.pageSize;
    const endIdx = Math.min(total, startIdx + state.pageSize);
    tb.innerHTML = allRows.slice(startIdx, endIdx).map((r, i) => {
        const rank = startIdx + i + 1, rc = rank <= 3 ? `r${rank}` : "";
        const t = Math.max(1, r.map_changes);
        const cP = r.created / t * 100, mP = r.modified / t * 100, dP = r.deleted / t * 100;
        return `<tr data-user="${escapeHtml(r.username)}" class="lb-row" tabindex="0" role="button" aria-label="View ${escapeHtml(r.username)} contributions">
      <td class="col-rank ${rc}">${rank <= 3 ? `<span class="top">${rank}</span>` : rank}</td>
      <td class="col-user"><div class="user-cell">
        <span class="avatar" style="background:${avatarColor(r.username)}">${initials(r.username)}</span>
        <a class="username" href="https://www.openstreetmap.org/user/${encodeURIComponent(r.username)}" target="_blank" rel="noopener" title="${escapeHtml(r.username)}" onclick="event.stopPropagation()">${escapeHtml(r.username)}</a><i data-lucide="external-link" class="ext-link"></i>
      </div></td>
      <td class="col-num primary">${fmt.format(r.map_changes)}</td>
      <td class="col-num col-c${r.created ? "" : " is-zero"}">${fmt.format(r.created)}</td>
      <td class="col-num col-m${r.modified ? "" : " is-zero"}">${fmt.format(r.modified)}</td>
      <td class="col-num col-d${r.deleted ? "" : " is-zero"}">${fmt.format(r.deleted)}</td>
      <td class="col-num col-cs">${fmt.format(r.changesets)}</td>
      <td class="col-spark"><div class="stack-bar" title="${r.created} created · ${r.modified} modified · ${r.deleted} deleted">
        <div class="seg-c" style="width:${cP}%"></div><div class="seg-m" style="width:${mP}%"></div><div class="seg-d" style="width:${dP}%"></div>
      </div></td>
    </tr>`;
    }).join("");
    refreshIcons(tb);
    tb.querySelectorAll(".lb-row").forEach(tr => {
        tr.addEventListener("click", () => openUserModal(tr.dataset.user));
        tr.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openUserModal(tr.dataset.user); }
        });
    });
    renderPagination(total, startIdx + 1, endIdx);
}
function renderPagination(total, from, to) {
    const wrap = $("#pagination"), info = $("#pg-info"), ctrls = $("#pg-controls");
    if (!total) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize)), cur = state.page;
    info.innerHTML = `Showing <b>${fmt.format(from)}</b>–<b>${fmt.format(to)}</b> of <b>${fmt.format(total)}</b>`;
    const pages = [1];
    if (cur - 1 > 2) pages.push("…");
    for (let p = Math.max(2, cur - 1); p <= Math.min(totalPages - 1, cur + 1); p++) pages.push(p);
    if (cur + 1 < totalPages - 1) pages.push("…");
    if (totalPages > 1) pages.push(totalPages);
    const btn = (lab, p, { dis = false, active = false } = {}) =>
        `<button class="pg-btn${active ? " active" : ""}" data-page="${p}"${dis ? " disabled" : ""}${active ? ' aria-current="page"' : ""}>${lab}</button>`;
    ctrls.innerHTML = btn(`<i data-lucide="chevron-left"></i>`, cur - 1, { dis: cur <= 1 })
        + pages.map(p => p === "…" ? `<span class="pg-ellipsis">…</span>` : btn(String(p), p, { active: p === cur })).join("")
        + btn(`<i data-lucide="chevron-right"></i>`, cur + 1, { dis: cur >= totalPages });
    refreshIcons(ctrls);
    ctrls.querySelectorAll(".pg-btn").forEach(b => b.onclick = () => {
        if (b.disabled) return;
        const p = parseInt(b.dataset.page, 10); if (!isFinite(p)) return;
        state.page = p; renderTable();
        document.querySelector(".table-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

$("#pg-size").addEventListener("change", (e) => {
    state.pageSize = parseInt(e.target.value, 10) || 25; state.page = 1; writeURL(); renderTable();
});
$("#search").addEventListener("input", (e) => {
    state.search = e.target.value; state.page = 1; applyDerivedFilters(); renderTable();
});
$$(".pill-toggle button").forEach(b => b.onclick = () => {
    $$(".pill-toggle button").forEach(x => x.removeAttribute("aria-pressed"));
    b.setAttribute("aria-pressed", "true");
    state.filter = b.dataset.filter; state.page = 1;
    applyDerivedFilters(); renderTable();
});
$$("th.sortable").forEach(th => th.onclick = () => {
    const k = th.dataset.sort;
    if (state.sort.key === k) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    else { state.sort.key = k; state.sort.dir = k === "username" ? "asc" : "desc"; }
    state.page = 1; applyDerivedFilters(); renderTable();
});

$("#export-btn").addEventListener("click", () => {
    if (!state.rows.length) return toast({ msg: "Nothing to export", icon: "alert-triangle", err: true });
    const cols = ["rank", "uid", "username", "map_changes", "created", "modified", "deleted", "changesets",
        "nodes_created", "nodes_modified", "nodes_deleted", "ways_created", "ways_modified", "ways_deleted",
        "rels_created", "rels_modified", "rels_deleted", "pois_created", "pois_modified",
        "buildings_created", "buildings_modified", "highways_created", "highways_modified"];
    const sorted = state.rows.slice().sort((a, b) => b.map_changes - a.map_changes);
    const lines = [cols.join(",")];
    sorted.forEach((r, i) => {
        const row = { ...r, rank: i + 1 };
        lines.push(cols.map(c => {
            const s = String(row[c]);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const tag = state.hashtags.length ? state.hashtags.join("-") : "all";
    a.href = url; a.download = `osmsg-leaderboard-${tag}-${state.range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast({ msg: "CSV downloaded", icon: "download" });
});

function showLoading() {
    $("#lb-body").innerHTML = Array.from({ length: 6 }, () => `<tr>
    <td class="col-rank"><div class="skeleton" style="height:14px;width:24px"></div></td>
    <td><div class="user-cell"><div class="skeleton" style="width:28px;height:28px;border-radius:50%"></div><div class="skeleton" style="height:12px;width:120px"></div></div></td>
    <td><div class="skeleton" style="height:12px;width:50px;margin-left:auto"></div></td>
    <td><div class="skeleton" style="height:12px;width:40px;margin-left:auto"></div></td>
    <td><div class="skeleton" style="height:12px;width:40px;margin-left:auto"></div></td>
    <td><div class="skeleton" style="height:12px;width:30px;margin-left:auto"></div></td>
    <td class="col-cs"><div class="skeleton" style="height:12px;width:40px;margin-left:auto"></div></td>
    <td class="col-spark"><div class="skeleton" style="height:8px;width:120px"></div></td>
  </tr>`).join("");
    $("#pagination").hidden = true;
}
function showError(err) {
    const tb = $("#lb-body");
    const msg = err?.message || "Network error";
    const isAbort = err?.name === "AbortError";
    tb.innerHTML = `<tr><td colspan="8"><div class="errbox">
    <i data-lucide="cloud-off"></i>
    <h3>${isAbort ? "Request timed out" : "Couldn't reach the OSMSG API"}</h3>
    <p style="margin-top:8px"><code style="font-family:var(--mono);font-size:12px;background:#F4F0E6;padding:2px 6px;border-radius:4px;color:#3A4744">${escapeHtml(msg)}</code></p>
    <p style="margin-top:14px;color:#717D78">If this is a CORS error and you're hosting this page off the API origin, the API needs to allow your origin. The status pill above will keep retrying when you click it.</p>
    <p style="margin-top:18px"><a href="${API_BASE}/docs/swagger" target="_blank" rel="noopener">Open the API docs <i data-lucide="external-link" class="ico-sm" style="vertical-align:-2px"></i></a></p>
  </div></td></tr>`;
    $("#ov-strip").innerHTML = `<div class="tag-stats-empty" style="grid-column:1/-1">·</div>`;
    $("#ov-breakdown").innerHTML = ""; $("#ov-breakdown").hidden = true;
    $("#ov-breakdown-meta").textContent = "";
    $("#ov-toggle-btn").setAttribute("aria-expanded", "false");
    $("#ov-toggle-btn").disabled = true;
    $("#ov-toggle-label").textContent = "Show tag breakdown";
    $("#podium").innerHTML = ""; $("#pagination").hidden = true;
    refreshIcons(tb);
}
function updateLastUpdated() {
    const txt = $("#last-updated-text");
    const chip = $("#last-updated");
    const h = state.health;
    if (h?.last_ts) {
        const t = dtfClock.format(h.last_ts);
        txt.innerHTML = `Server ${ago(h.last_ts)} \u00b7 <time datetime="${h.last_ts.toISOString()}">${t}</time>`;
        const lines = [
            `OSM diff timestamp (last_ts): ${h.last_ts.toISOString()}`,
            h.updated_at ? `Server processed at: ${h.updated_at.toISOString()}` : null,
            h.last_seq != null ? `Sequence: ${h.last_seq}` : null,
            state.lastFetched ? `Browser last refresh: ${dtfClock.format(state.lastFetched)}` : null,
        ].filter(Boolean);
        if (chip) chip.title = lines.join("\n");
    } else if (state.lastFetched) {
        const t = dtfClock.format(state.lastFetched);
        txt.innerHTML = `Updated ${ago(state.lastFetched)} \u00b7 <time datetime="${state.lastFetched.toISOString()}">${t}</time>`;
        if (chip) chip.title = "";
    } else {
        txt.textContent = "never";
        if (chip) chip.title = "";
    }
}

async function fetchHealth() {
    try {
        const res = await fetch(new URL(HEALTH_ENDPOINT, API_BASE), {
            headers: { accept: "application/json" }, mode: "cors",
        });
        if (!res.ok) return;
        const j = await res.json();
        state.health = {
            status: j.status ?? null,
            last_seq: j.last_seq ?? null,
            last_ts: j.last_ts ? new Date(j.last_ts) : null,
            updated_at: j.updated_at ? new Date(j.updated_at) : null,
        };
        updateLastUpdated();
    } catch (err) {
        console.warn("OSMSG health fetch failed:", err);
    }
}
function renderWindowBar() {
    const { start, end } = (state.windowStart && state.windowEnd) ? { start: state.windowStart, end: state.windowEnd } : rangeWindow(state.range);
    const useDate = state.range === "all" || (end - start) > 60 * 86400 * 1000;
    const f = useDate ? dtfDate : dtfShort;
    $("#wb-window-text").textContent = `${f.format(start)} → ${f.format(end)}`;
    $("#wb-window").title = `Time window\nUTC: ${start.toISOString()} → ${end.toISOString()}\nLocal (${TZ}): ${dtfFull.format(start)} → ${dtfFull.format(end)}`;
    $("#wb-localtime").textContent = dtfClock.format(new Date());
    $("#wb-tzname").textContent = `${TZ} · ${tzOffsetLabel()}`;
}

function readURL() {
    const p = new URLSearchParams(location.search);
    const r = p.get("range");
    if (r && (RANGE_HOURS[r] || r === "all" || r === "custom")) { state.range = r; setRangePreset(r); }
    if (r === "custom") {
        const s = p.get("start"), e = p.get("end");
        if (s && e) {
            const sd = new Date(s), ed = new Date(e);
            if (!isNaN(sd) && !isNaN(ed)) {
                state.customStart = sd; state.customEnd = ed;
                crStart.value = toLocal(sd); crEnd.value = toLocal(ed);
            }
        }
    }
    const tags = p.getAll("hashtag").concat(p.getAll("hashtags"));
    if (tags.length) state.hashtags = [...new Set(tags.map(t => t.replace(/^#/, "").toLowerCase()))];
    const ps = parseInt(p.get("size") || "", 10);
    if ([10, 25, 50, 100].includes(ps)) { state.pageSize = ps; $("#pg-size").value = String(ps); }
}
function writeURL() {
    const p = new URLSearchParams();
    p.set("range", state.range);
    if (state.range === "custom" && state.customStart && state.customEnd) {
        p.set("start", isoUTC(state.customStart)); p.set("end", isoUTC(state.customEnd));
    }
    state.hashtags.forEach(h => p.append("hashtag", h));
    if (state.pageSize !== 25) p.set("size", String(state.pageSize));
    history.replaceState(null, "", `${location.pathname}?${p}`);
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js", { scope: "./" })
        .catch(err => console.info("Service worker not registered:", err.message));
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else if (state.live) { fetchData({ silent: true }); startAutoRefresh(); }
});
$("#ov-toggle-btn").addEventListener("click", () => {
    const btn = $("#ov-toggle-btn"); if (btn.disabled) return;
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", expanded ? "false" : "true");
    $("#ov-breakdown").hidden = expanded;
    $("#ov-toggle-label").textContent = expanded ? "Show tag breakdown" : "Hide tag breakdown";
});
const userModal = $("#user-modal");
$("#user-modal-close").addEventListener("click", closeUserModal);
userModal.addEventListener("click", (e) => { if (e.target === userModal) closeUserModal(); });
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && userModal.classList.contains("open")) closeUserModal();
});

function boot() {
    readURL(); renderChips(); renderWindowBar(); refreshIcons();
    fetchHealth(); fetchData({}); startAutoRefresh();
    state.agoTimer = setInterval(updateLastUpdated, 5000);
    state.clockTimer = setInterval(() => { $("#wb-localtime").textContent = dtfClock.format(new Date()); }, 1000);
    if (state.range === "custom") {
        const tryInit = () => {
            if (typeof window.flatpickr === "function") setRangePreset("custom");
            else setTimeout(tryInit, 50);
        };
        tryInit();
    }
}
if (document.readyState !== "loading") boot();
else window.addEventListener("DOMContentLoaded", boot);
