/**
 * gradient-perf.js
 * Gradient Performance — Training Metrics & Fleet Benchmarks
 * ResonantOS addon — pure vanilla JS, mock data
 */

// ── Mock Data ──────────────────────────────────────────────────────────────

const TRAINING_RUNS = [
  {
    id: "ternary-1b",
    name: "Ternary 1.5B",
    machine: "Blade R730",
    step: 4200,
    totalSteps: 10000,
    lossHistory: [2.31, 2.18, 2.10, 1.95, 1.87],
    currentLoss: 1.87,
    initialLoss: 2.31,
    lr: "3e-4",
    status: "running",
    eta: "~3h 14m",
  },
  {
    id: "ternary-7b",
    name: "Ternary 7B",
    machine: "Blade 2",
    step: 800,
    totalSteps: 15000,
    lossHistory: [3.12, 3.08, 3.03, 2.98, 2.94],
    currentLoss: 2.94,
    initialLoss: 3.12,
    lr: "1e-4",
    status: "running",
    eta: "~18h 42m",
  },
  {
    id: "lora-medical",
    name: "LoRA Medical 7B",
    machine: "M4 Mac Mini",
    step: 8000,
    totalSteps: 8000,
    lossHistory: [1.92, 1.54, 1.21, 0.99, 0.847],
    currentLoss: 0.847,
    initialLoss: 1.92,
    lr: "5e-5",
    status: "complete",
    eta: "COMPLETE",
  },
];

const BENCHMARK_RESULTS = [
  { name: "Grok-4",     score: 95, ours: false },
  { name: "Fleet v3",   score: 93, ours: true  },
  { name: "GPT-4o",     score: 90, ours: false },
  { name: "Claude 3.5", score: 87, ours: false },
  { name: "Fleet v2",   score: 75, ours: true, dim: true },
];

const FLEET_SPEED = [
  { machine: "M4 Mac Mini",  tps: 40.0  },
  { machine: "Sniper",       tps: 15.0  },
  { machine: "HAL 9000",     tps: 12.9  },
  { machine: "Guardian",     tps: 12.8  },
  { machine: "Blade 2",      tps: 2.1   },
  { machine: "The OG",       tps: 2.0   },
];

// ── State ──────────────────────────────────────────────────────────────────

let activeTab = "training";
let refreshIntervalId = null;
let refreshSeconds = 15;

// ── DOM Helpers ────────────────────────────────────────────────────────────

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === "string") node.appendChild(document.createTextNode(child));
    else if (child) node.appendChild(child);
  }
  return node;
}

/**
 * Create an element with trusted HTML content (developer-controlled strings only).
 * SECURITY: Never pass user/bridge data to this function — use el() for untrusted content.
 */
function trustedHtmlEl(tag, attrs = {}, html) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  if (html) node.innerHTML = html;
  return node;
}

// ── Tab Logic ──────────────────────────────────────────────────────────────

function switchTab(tabId) {
  activeTab = tabId;

  $$(".tab-btn").forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  $$(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `panel-${tabId}`);
  });

  render();
}

// ── Render: Training ───────────────────────────────────────────────────────

function renderTraining() {
  const container = $("#training-list");
  container.innerHTML = "";

  for (const run of TRAINING_RUNS) {
    const pct = Math.round((run.step / run.totalSteps) * 100);
    const isComplete = run.status === "complete";

    // Loss sparkline as text bars (5 checkpoints)
    const maxLoss = Math.max(...run.lossHistory);
    const lossBarHtml = run.lossHistory.map((loss, i) => {
      const h = Math.round((loss / maxLoss) * 40);
      const color = i === run.lossHistory.length - 1
        ? "var(--teal)"
        : "var(--text-dim)";
      return `<div class="loss-bar-seg" style="height:${h}px;background:${color}" title="${loss}"></div>`;
    }).join("");

    const card = el("div", { class: `training-card ${isComplete ? "complete" : ""}` },
      el("div", { class: "training-card-header" },
        el("div", { class: "training-name" }, run.name),
        el("div", { class: `training-status ${isComplete ? "status-complete" : "status-running"}` },
          isComplete ? "✓ COMPLETE" : "● RUNNING"
        )
      ),
      trustedHtmlEl("div", { class: "training-meta" },
        `<span class="meta-label">Machine:</span> <span class="meta-value">${run.machine}</span>` +
        `<span class="meta-sep">·</span>` +
        `<span class="meta-label">LR:</span> <span class="meta-value mono">${run.lr}</span>` +
        `<span class="meta-sep">·</span>` +
        `<span class="meta-label">Loss:</span> <span class="meta-value mono">${run.initialLoss} \u2192 ${run.currentLoss}</span>`
      ),
      trustedHtmlEl("div", { class: "loss-chart" }, lossBarHtml),
      el("div", { class: "step-row" },
        el("span", { class: "step-label" },
          isComplete
            ? `Steps: ${run.totalSteps.toLocaleString()} / ${run.totalSteps.toLocaleString()}`
            : `Step ${run.step.toLocaleString()} / ${run.totalSteps.toLocaleString()}`
        ),
        el("span", { class: "step-eta" }, isComplete ? "Final loss: " + run.currentLoss : `ETA: ${run.eta}`)
      ),
      isComplete ? el("div", { class: "progress-bar-wrap" },
        el("div", { class: "progress-bar-fill complete-fill", style: "width:100%" })
      ) : el("div", { class: "progress-bar-wrap" },
        el("div", { class: "progress-bar-fill", style: `width:${pct}%` })
      ),
      el("div", { class: "progress-pct" }, isComplete ? "100%" : `${pct}%`)
    );

    container.appendChild(card);
  }
}

// ── Render: Benchmarks ─────────────────────────────────────────────────────

function renderBenchmarks() {
  const container = $("#benchmarks-table");
  container.innerHTML = "";

  const maxScore = 100;

  const table = el("div", { class: "bench-table", role: "table", "aria-label": "Benchmark results" });

  // Header row
  table.appendChild(
    el("div", { class: "bench-row bench-header", role: "row" },
      el("div", { class: "bench-col-name", role: "columnheader" }, "Model"),
      el("div", { class: "bench-col-score", role: "columnheader" }, "Score"),
      el("div", { class: "bench-col-bar", role: "columnheader" }, "")
    )
  );

  for (const result of BENCHMARK_RESULTS) {
    const barPct = Math.round((result.score / maxScore) * 100);
    const isOurs = result.ours && !result.dim;
    const barColor = isOurs ? "var(--teal)" : result.dim ? "var(--text-dim)" : "var(--border-bright)";

    const row = el("div", { class: `bench-row ${isOurs ? "bench-ours" : ""} ${result.dim ? "bench-dim" : ""}`, role: "row" },
      el("div", { class: "bench-col-name", role: "cell" },
        result.name + (isOurs ? ' <span class="bench-tag">ours</span>' : "")
      ),
      el("div", { class: "bench-col-score mono", role: "cell" }, `${result.score}%`),
      el("div", { class: "bench-col-bar", role: "cell" },
        el("div", { class: "bench-bar-track" },
          el("div", { class: "bench-bar-fill", style: `width:${barPct}%;background:${barColor}` })
        )
      )
    );

    table.appendChild(row);
  }

  container.appendChild(table);
}

// ── Render: Fleet Speed ───────────────────────────────────────────────────

function renderFleetSpeed() {
  const container = $("#fleet-speed-chart");
  container.innerHTML = "";

  // Sort descending by tps
  const sorted = [...FLEET_SPEED].sort((a, b) => b.tps - a.tps);
  const maxTps = sorted[0].tps;

  const chart = el("div", { class: "speed-chart", "aria-label": "Fleet token generation speeds" });

  for (const node of sorted) {
    const barPct = Math.round((node.tps / maxTps) * 100);
    let barColor;
    if (node.tps >= 10) barColor = "var(--teal)";
    else if (node.tps >= 5) barColor = "var(--pending)";
    else barColor = "var(--offline)";

    const row = el("div", { class: "speed-row" },
      el("div", { class: "speed-machine" }, node.machine),
      el("div", { class: "speed-bar-wrap" },
        el("div", { class: "speed-bar-track" },
          el("div", { class: "speed-bar-fill", style: `width:${barPct}%;background:${barColor}` })
        )
      ),
      el("div", { class: "speed-tps mono" }, `${node.tps} t/s`)
    );

    chart.appendChild(row);
  }

  container.appendChild(chart);
}

// ── Render (dispatcher) ────────────────────────────────────────────────────

function render() {
  if (activeTab === "training")    renderTraining();
  if (activeTab === "benchmarks")  renderBenchmarks();
  if (activeTab === "fleet-speed") renderFleetSpeed();
}

// ── Last Updated ───────────────────────────────────────────────────────────

function updateLastUpdated() {
  const now = new Date();
  const ts = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("#last-updated").textContent = ts;
}

// ── Auto-refresh ───────────────────────────────────────────────────────────

function setRefresh(seconds) {
  refreshSeconds = seconds;

  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }

  $$(".refresh-btn").forEach(btn => {
    const active = parseInt(btn.dataset.interval, 10) === seconds;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  if (seconds > 0) {
    refreshIntervalId = setInterval(() => {
      render();
      updateLastUpdated();
    }, seconds * 1000);
  }
}

// ── Bridge Status ──────────────────────────────────────────────────────────

function initBridgeStatus() {
  const dot = $("#bridge-dot");
  const label = $("#bridge-label");

  fetch("http://127.0.0.1:47773/api/ping")
    .then(r => {
      if (r.ok) {
        dot.style.background = "var(--online)";
        label.textContent = "Bridge Connected";
      } else {
        dot.style.background = "var(--pending)";
        label.textContent = "Bridge Degraded";
      }
    })
    .catch(() => {
      dot.style.background = "var(--offline)";
      label.textContent = "Bridge Offline";
    });
}

// ── Init ───────────────────────────────────────────────────────────────────

function init() {
  // Tab navigation
  $$(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Auto-refresh buttons
  $$(".refresh-btn").forEach(btn => {
    btn.addEventListener("click", () => setRefresh(parseInt(btn.dataset.interval, 10)));
  });

  // Initial render
  render();
  updateLastUpdated();
  initBridgeStatus();
  setRefresh(refreshSeconds);
}

// Bootstrap
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
