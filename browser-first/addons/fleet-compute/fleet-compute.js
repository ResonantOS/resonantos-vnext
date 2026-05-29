/**
 * Fleet & Compute — Main Logic
 * ResonantOS Mission Control Dashboard
 * Pure vanilla JS — no framework dependencies
 */

// ─── Mock Data ───────────────────────────────────────────────────────────────

const MOCK_FLEET = [
  {
    id: 'm4-mini',
    name: 'M4 Mac Mini',
    ip: '10.0.1.1',
    status: 'online',
    kind: 'orchestrator',
    trust: 'verified',
    enrollment: 'host',
    roles: ['orchestrator', 'gateway'],
    model: 'qwen2.5:7b',
    tokensPerSec: 40,
    cpu: 'Apple M4',
    ram: '24GB',
    os: 'macOS',
    uptime: '12d 4h',
    notes: 'Primary gateway'
  },
  {
    id: 'hal9000',
    name: 'HAL 9000',
    ip: '10.0.1.2',
    status: 'online',
    kind: 'model-host',
    trust: 'verified',
    enrollment: 'host',
    roles: ['model-host'],
    model: 'qwen2.5:7b',
    tokensPerSec: 6.4,
    cpu: 'Ryzen 5 2400G',
    ram: '14GB',
    os: 'Windows',
    uptime: '3d 7h',
    notes: null
  },
  {
    id: 'the-og',
    name: 'The OG GT70',
    ip: '10.0.1.3',
    status: 'online',
    kind: 'model-host',
    trust: 'verified',
    enrollment: 'host',
    roles: ['model-host', 'eval-runner'],
    model: 'qwen2.5:7b',
    tokensPerSec: 10.1,
    cpu: 'Intel i7',
    ram: '32GB',
    os: 'Ubuntu 22.04',
    uptime: '8d 11h',
    notes: null
  },
  {
    id: 'guardian',
    name: 'Guardian',
    ip: '10.0.1.4',
    status: 'online',
    kind: 'model-host',
    trust: 'verified',
    enrollment: 'host',
    roles: ['model-host'],
    model: 'qwen2.5:14b',
    tokensPerSec: 12.8,
    cpu: 'AMD Ryzen',
    ram: '32GB',
    os: 'Windows 11',
    uptime: '5d 2h',
    notes: 'LM Studio'
  },
  {
    id: 'sniper',
    name: 'Sniper',
    ip: '10.0.1.5',
    status: 'offline',
    kind: 'model-host',
    trust: 'none',
    enrollment: 'host',
    roles: ['model-host'],
    model: 'qwen2.5:1.5b',
    tokensPerSec: null,
    cpu: 'Unknown',
    ram: '8GB',
    os: 'Needs Ubuntu',
    uptime: null,
    notes: 'Offline 2h+'
  },
  {
    id: 'blade-r730',
    name: 'Blade R730',
    ip: '10.0.1.6',
    status: 'online',
    kind: 'training',
    trust: 'verified',
    enrollment: 'host',
    roles: ['training', 'eval', 'service'],
    model: 'ternary-training',
    tokensPerSec: null,
    cpu: '8-core Xeon',
    ram: '503GB',
    os: 'Ubuntu (Dell R730)',
    uptime: '22d 6h',
    notes: 'Ternary Sunrise'
  },
  {
    id: 'blade4',
    name: 'Blade 4 PE2950',
    ip: '10.0.1.8',
    status: 'online',
    kind: 'utility',
    trust: 'host',
    enrollment: 'host',
    roles: ['utility'],
    model: 'monitor',
    tokensPerSec: null,
    cpu: '2× Xeon 5160',
    ram: '16GB',
    os: 'Windows Server 2016',
    uptime: '14d 3h',
    notes: 'Training monitor :8080'
  },
  {
    id: 'blade3',
    name: 'Blade 3 R620',
    ip: null,
    status: 'pending',
    kind: 'model-host',
    trust: 'pending',
    enrollment: 'pending',
    roles: [],
    model: null,
    tokensPerSec: null,
    cpu: 'Xeon E5-2620',
    ram: '16GB',
    os: 'Win Server 2012',
    uptime: null,
    notes: 'Needs enrollment'
  },
  {
    id: 'p-asus',
    name: 'P-ASUS',
    ip: '10.0.1.9',
    status: 'offline',
    kind: 'utility',
    trust: 'none',
    enrollment: 'host',
    roles: ['utility'],
    model: null,
    tokensPerSec: null,
    cpu: 'i5-2310 Sandy Bridge',
    ram: '6GB',
    os: 'Windows 10 Pro',
    uptime: null,
    notes: 'ET2410 AIO'
  }
];

const MOCK_ENGINES = [
  { name: 'Loki Router',   role: 'Intelligent Request Router',      status: 'running', pid: 48291 },
  { name: 'Purple Squid',  role: 'Multi-Agent Orchestration Layer', status: 'running', pid: 48305 },
  { name: 'Oracle',        role: 'Distributed Memory & Truth Layer', status: 'running', pid: 48317 },
  { name: 'Specialists',   role: 'Domain Expert Agent Pool',        status: 'running', pid: 48344 },
  { name: 'Taskmaster',    role: 'Task Queue & Job Scheduler',      status: 'stopped', pid: null  }
];

const MOCK_CLOUD = {
  hetzner: {
    label: 'Hetzner CPX31',
    ip: '5.161.249.196',
    provider: 'Hetzner Cloud',
    cpu: 23,
    ram: 61,
    disk: 34,
    region: 'FSN1 (Germany)'
  },
  services: [
    { name: 'Lux Wireless Flask', port: 5000, status: 'online', path: '/lux' },
    { name: 'Matchsire Flask',    port: 5001, status: 'online', path: '/match' },
    { name: 'Nginx (SSL)',        port: 443,  status: 'online', path: '/' },
    { name: 'PostgreSQL',         port: 5432, status: 'offline', path: 'db' }
  ],
  domains: [
    { name: 'luxwireless.com',  provider: 'GoDaddy → Hetzner', ssl_days: 64,  ssl_expires: '2026-08-01' },
    { name: 'matchsire.com',    provider: 'GoDaddy → Hetzner', ssl_days: 75,  ssl_expires: '2026-08-12' }
  ],
  runpod: {
    balance: 28.83,
    autopay: false,
    active_pods: 0,
    last_used: '2026-05-07'
  },
  cicd: {
    repo: 'resonantos-vnext',
    branch: 'browser-first-preview',
    last_commit: '3 hours ago',
    status: 'passing'
  }
};

// ─── App State ───────────────────────────────────────────────────────────────

let activeTab = 'fleet';
let refreshInterval = 30; // seconds — Off if 0
let refreshTimer = null;
let secondsSinceRefresh = 0;
let countdownTimer = null;

// ─── Utility ─────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }
function qs(sel, ctx = document) { return ctx.querySelector(sel); }
function qsa(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

function statusPill(status, label) {
  const l = label || status;
  return `<span class="status-pill ${status}">
    <span class="pill-dot"></span>${l}
  </span>`;
}

function trustBadge(trust) {
  const map = {
    'verified': ['trust-verified', 'Verified'],
    'host':     ['trust-host',     'Host-Key'],
    'pending':  ['trust-pending',  'Pending'],
    'none':     ['trust-none',     'Unverified']
  };
  const [cls, lbl] = map[trust] || ['trust-none', trust];
  return `<span class="trust-badge ${cls}">${lbl}</span>`;
}

function roleTags(roles) {
  if (!roles.length) return '<span class="info-value muted">—</span>';
  return roles.map((r, i) =>
    `<span class="role-tag ${i % 2 === 0 ? 'teal' : ''}">${r}</span>`
  ).join('');
}

function barClass(pct) {
  if (pct < 60) return 'bar-low';
  if (pct < 80) return 'bar-mid';
  return 'bar-high';
}

function sslBadge(days, expires) {
  const cls = days > 30 ? 'ssl-good' : days > 7 ? 'ssl-warn' : 'ssl-danger';
  const icon = days > 30 ? '🔒' : '⚠️';
  return `<span class="ssl-badge ${cls}">${icon} ${days}d — ${expires}</span>`;
}

function formatSpeed(tps) {
  if (!tps) return `<span class="info-value muted">—</span>`;
  return `<span class="model-speed">${tps}<span class="model-speed-unit"> t/s</span></span>`;
}

// ─── Render: Fleet Tab ───────────────────────────────────────────────────────

function renderFleet() {
  const online  = MOCK_FLEET.filter(n => n.status === 'online').length;
  const offline = MOCK_FLEET.filter(n => n.status === 'offline').length;
  const pending = MOCK_FLEET.filter(n => n.status === 'pending').length;
  const totalRam = MOCK_FLEET
    .filter(n => n.ram)
    .reduce((acc, n) => acc + parseFloat(n.ram.replace(/[^0-9.]/g, '')), 0);

  const runningEngines = MOCK_ENGINES.filter(e => e.status === 'running').length;

  el('fleet-summary').innerHTML = `
    <div class="summary-tile">
      <div class="tile-label">Online</div>
      <div class="tile-value green">${online}</div>
      <div class="tile-sub">nodes active</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Offline</div>
      <div class="tile-value red">${offline}</div>
      <div class="tile-sub">unreachable</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Pending</div>
      <div class="tile-value amber">${pending}</div>
      <div class="tile-sub">awaiting enrollment</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Fleet RAM</div>
      <div class="tile-value teal">${totalRam.toFixed(0)}<span style="font-size:14px;color:var(--text-sec)">GB</span></div>
      <div class="tile-sub">total across nodes</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Engines</div>
      <div class="tile-value purple">${runningEngines}/${MOCK_ENGINES.length}</div>
      <div class="tile-sub">services running</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Total Nodes</div>
      <div class="tile-value white">${MOCK_FLEET.length}</div>
      <div class="tile-sub">registered</div>
    </div>
  `;

  // Engine status table
  el('engine-table-body').innerHTML = MOCK_ENGINES.map(e => `
    <tr>
      <td><span class="engine-name">${e.name}</span></td>
      <td><span class="engine-role">${e.role}</span></td>
      <td>${statusPill(e.status)}</td>
      <td><span class="engine-pid">${e.pid ? `PID ${e.pid}` : '—'}</span></td>
    </tr>
  `).join('');

  // Node cards
  el('nodes-grid').innerHTML = MOCK_FLEET.map(node => {
    const modelDisplay = node.model
      ? `<div class="model-bar">
           <span class="model-name">${node.model}</span>
           ${node.tokensPerSec ? `<span class="model-speed">${node.tokensPerSec}<span class="model-speed-unit"> t/s</span></span>` : '<span class="info-value muted">training</span>'}
         </div>`
      : `<div class="model-bar" style="opacity:0.4"><span class="model-name">no model loaded</span></div>`;

    return `
    <div class="node-card ${node.status}">
      <div class="node-header">
        <div class="node-name-block">
          <div class="node-name">${node.name}</div>
          <div class="node-ip">${node.ip || 'No IP assigned'}</div>
        </div>
        ${statusPill(node.status)}
      </div>
      <div class="node-info-grid">
        <div class="info-row">
          <span class="info-label">Kind</span>
          <span class="info-value">${node.kind}</span>
        </div>
        <div class="info-row">
          <span class="info-label">CPU</span>
          <span class="info-value">${node.cpu}</span>
        </div>
        <div class="info-row">
          <span class="info-label">RAM</span>
          <span class="info-value highlight">${node.ram}</span>
        </div>
        <div class="info-row">
          <span class="info-label">OS</span>
          <span class="info-value">${node.os}</span>
        </div>
        ${node.uptime ? `
        <div class="info-row">
          <span class="info-label">Uptime</span>
          <span class="info-value">${node.uptime}</span>
        </div>` : ''}
        ${node.notes ? `
        <div class="info-row">
          <span class="info-label">Notes</span>
          <span class="info-value muted">${node.notes}</span>
        </div>` : ''}
      </div>
      <div class="role-tags">
        ${roleTags(node.roles)}
      </div>
      ${modelDisplay}
    </div>
    `;
  }).join('');

  // Update tab badge
  qs('[data-tab="fleet"] .tab-badge').textContent = `${online}/${MOCK_FLEET.length}`;
}

// ─── Render: Cloud Tab ───────────────────────────────────────────────────────

function renderCloud() {
  const { hetzner, services, domains, runpod, cicd } = MOCK_CLOUD;
  const svcOnline = services.filter(s => s.status === 'online').length;

  el('cloud-summary').innerHTML = `
    <div class="summary-tile">
      <div class="tile-label">Hetzner CPU</div>
      <div class="tile-value ${hetzner.cpu < 60 ? 'green' : hetzner.cpu < 80 ? 'amber' : 'red'}">${hetzner.cpu}%</div>
      <div class="tile-sub">CPX31 usage</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Services Up</div>
      <div class="tile-value teal">${svcOnline}/${services.length}</div>
      <div class="tile-sub">running</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Domains</div>
      <div class="tile-value white">${domains.length}</div>
      <div class="tile-sub">active</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">RunPod $</div>
      <div class="tile-value teal">$${runpod.balance}</div>
      <div class="tile-sub">balance remaining</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Active Pods</div>
      <div class="tile-value ${runpod.active_pods > 0 ? 'amber' : 'green'}">${runpod.active_pods}</div>
      <div class="tile-sub">running now</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">CI/CD</div>
      <div class="tile-value green" style="font-size:20px">Passing</div>
      <div class="tile-sub">${cicd.last_commit}</div>
    </div>
  `;

  // Hetzner resource bars
  el('hetzner-resources').innerHTML = `
    <div class="resource-card">
      <div class="resource-card-header">
        <div>
          <div class="resource-title">${hetzner.label}</div>
          <div class="resource-meta">${hetzner.ip} · ${hetzner.region}</div>
        </div>
        ${statusPill('online')}
      </div>
      <div class="resource-bars">
        ${['cpu','ram','disk'].map(key => {
          const pct = hetzner[key];
          const labels = { cpu: 'CPU Usage', ram: 'RAM Usage', disk: 'Disk Usage' };
          return `
          <div class="resource-item">
            <div class="resource-item-header">
              <span class="resource-item-name">${labels[key]}</span>
              <span class="resource-item-value">${pct}%</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill ${barClass(pct)}" style="width:${pct}%"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  // Services grid
  el('services-grid').innerHTML = services.map(svc => `
    <div class="service-card">
      ${statusPill(svc.status)}
      <div class="service-info">
        <div class="service-name">${svc.name}</div>
        <div class="service-port">:${svc.port} ${svc.path}</div>
      </div>
    </div>
  `).join('');

  // Domains
  el('domains-grid').innerHTML = domains.map(d => `
    <div class="domain-card">
      <div>
        <div class="domain-name">${d.name}</div>
        <div class="domain-provider">${d.provider}</div>
      </div>
      ${sslBadge(d.ssl_days, d.ssl_expires)}
    </div>
  `).join('');

  // RunPod + CI/CD mini cards
  el('cloud-mini-cards').innerHTML = `
    <div class="mini-card">
      <div class="mini-card-label">RunPod Balance</div>
      <div class="mini-card-value">$${runpod.balance}</div>
      <div class="mini-card-sub">Autopay: ${runpod.autopay ? 'ON ⚠️' : 'OFF ✓'} · Last used ${runpod.last_used}</div>
    </div>
    <div class="mini-card">
      <div class="mini-card-label">Active Pods</div>
      <div class="mini-card-value" style="color:${runpod.active_pods > 0 ? 'var(--pending)' : 'var(--online)'}">${runpod.active_pods}</div>
      <div class="mini-card-sub">No idle charges running</div>
    </div>
    <div class="mini-card">
      <div class="mini-card-label">CI/CD Branch</div>
      <div class="mini-card-value" style="font-size:16px;color:var(--teal)">${cicd.branch}</div>
      <div class="mini-card-sub">${cicd.repo} · ${cicd.last_commit}</div>
    </div>
    <div class="mini-card">
      <div class="mini-card-label">SSL Health</div>
      <div class="mini-card-value" style="font-size:16px;color:var(--online)">All Valid</div>
      <div class="mini-card-sub">Min expiry: ${Math.min(...domains.map(d=>d.ssl_days))}d from now</div>
    </div>
  `;

  qs('[data-tab="cloud"] .tab-badge').textContent = `${svcOnline}/${services.length}`;
}

// ─── Render: Compute Fabric Tab ──────────────────────────────────────────────

function renderFabric() {
  const verified = MOCK_FLEET.filter(n => n.trust === 'verified').length;
  const unverified = MOCK_FLEET.filter(n => n.trust === 'none').length;
  const pendingTrust = MOCK_FLEET.filter(n => n.trust === 'pending').length;

  el('fabric-summary').innerHTML = `
    <div class="summary-tile">
      <div class="tile-label">Verified</div>
      <div class="tile-value teal">${verified}</div>
      <div class="tile-sub">trusted nodes</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Unverified</div>
      <div class="tile-value amber">${unverified}</div>
      <div class="tile-sub">no trust anchor</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Pending</div>
      <div class="tile-value amber">${pendingTrust}</div>
      <div class="tile-sub">enrollment needed</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Enrolled</div>
      <div class="tile-value white">${MOCK_FLEET.filter(n => n.enrollment === 'host').length}</div>
      <div class="tile-sub">host-mediated</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Warnings</div>
      <div class="tile-value red">2</div>
      <div class="tile-sub">need attention</div>
    </div>
    <div class="summary-tile">
      <div class="tile-label">Cleanroom</div>
      <div class="tile-value green" style="font-size:18px">Active</div>
      <div class="tile-sub">boundaries enforced</div>
    </div>
  `;

  // Fabric node list (enrollment/trust view)
  el('fabric-nodes').innerHTML = MOCK_FLEET.map((node, i) => {
    const enrollSteps = ['key', 'endpoint', 'probe', 'policy'];
    const doneSteps = node.enrollment === 'host' ? (node.status === 'pending' ? 2 : 4) : 1;

    return `
    <div class="fabric-node-row">
      <div style="width:28px;text-align:center;font-size:11px;font-family:var(--font-mono);color:var(--text-dim)">${i+1}</div>
      ${statusPill(node.status)}
      <div class="fabric-node-name">
        <div class="fabric-node-main">${node.name}</div>
        <div class="fabric-node-sub">${node.ip || 'No IP'} · ${node.kind}</div>
      </div>
      ${trustBadge(node.trust)}
      <div class="enroll-step" title="Enrollment steps: SSH Key / Endpoint / Probe / Policy">
        ${enrollSteps.map((s, idx) =>
          `<span class="enroll-num ${idx < doneSteps ? 'done' : ''}" title="${s}">${idx+1}</span>`
        ).join('')}
      </div>
    </div>
    `;
  }).join('');

  // Policy panels
  el('policy-panels').innerHTML = `
    <div class="policy-card">
      <div class="policy-card-header">
        <span class="policy-card-title">Execution Policy</span>
        ${statusPill('online', 'Active')}
      </div>
      <div class="policy-card-body">
        <div class="policy-rule">No remote exec without host-mediated auth</div>
        <div class="policy-rule">SSH key-based auth only — no password fallback</div>
        <div class="policy-rule">Destructive ops require explicit approval</div>
        <div class="policy-rule">Model inference isolated per node</div>
        <div class="policy-rule">All execs logged with session ID</div>
      </div>
    </div>
    <div class="policy-card">
      <div class="policy-card-header">
        <span class="policy-card-title">Secrets Policy</span>
        ${statusPill('online', 'Active')}
      </div>
      <div class="policy-card-body">
        <div class="policy-rule">API keys stay on host — never browser</div>
        <div class="policy-rule">SSH credentials in TOOLS.md, not env</div>
        <div class="policy-rule">No secret exfiltration via any channel</div>
        <div class="policy-rule">RunPod API — gateway-proxied only</div>
      </div>
    </div>
    <div class="policy-card">
      <div class="policy-card-header">
        <span class="policy-card-title">Cleanroom Boundaries</span>
        ${statusPill('online', 'Active')}
      </div>
      <div class="policy-card-body">
        <div class="policy-rule">No direct network access from browser</div>
        <div class="policy-rule">All data read-only in dashboard context</div>
        <div class="policy-rule">Bridge server mediates all fleet queries</div>
        <div class="policy-rule">Addon boundary: read-only monitoring</div>
      </div>
    </div>
  `;

  // Validation warnings
  el('fabric-warnings').innerHTML = `
    <div class="warning-item error">
      <div class="warning-icon">❌</div>
      <div class="warning-body">
        <div class="warning-title">Blade 3 R620 — No Endpoint</div>
        <div class="warning-desc">Node registered but has no IP address. Cannot verify trust or deploy services until network is assigned and SSH key installed.</div>
      </div>
    </div>
    <div class="warning-item">
      <div class="warning-icon">⚠️</div>
      <div class="warning-body">
        <div class="warning-title">Sniper — Offline 2h+</div>
        <div class="warning-desc">Node at 10.0.1.5 has not responded to probes for over 2 hours. Trust status degraded to Unverified. Needs Ubuntu install to restore service.</div>
      </div>
    </div>
    <div class="warning-item">
      <div class="warning-icon">⚠️</div>
      <div class="warning-body">
        <div class="warning-title">P-ASUS — Unverified Trust</div>
        <div class="warning-desc">Machine at 10.0.1.9 is enrolled but has no trust anchor established. Limited to utility-only roles until SSH key verification completes.</div>
      </div>
    </div>
  `;

  qs('[data-tab="fabric"] .tab-badge').textContent = `2 warn`;
}

// ─── Tab Switching ────────────────────────────────────────────────────────────

function switchTab(tab) {
  activeTab = tab;

  qsa('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  qsa('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tab}`);
  });
}

// ─── Refresh & Countdown ─────────────────────────────────────────────────────

function doRefresh() {
  secondsSinceRefresh = 0;
  updateLastUpdated();
  // In mock mode — just re-render with same data to simulate a refresh
  renderAll();
}

function renderAll() {
  renderFleet();
  renderCloud();
  renderFabric();
}

function updateLastUpdated() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  el('last-updated-time').textContent = timeStr;
  el('last-updated-ago').textContent = '0s ago';
  secondsSinceRefresh = 0;
}

function startCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    secondsSinceRefresh++;
    const agoEl = el('last-updated-ago');
    if (agoEl) {
      if (secondsSinceRefresh < 60) {
        agoEl.textContent = `${secondsSinceRefresh}s ago`;
      } else {
        agoEl.textContent = `${Math.floor(secondsSinceRefresh / 60)}m ago`;
      }
    }
  }, 1000);
}

function setRefreshInterval(seconds) {
  refreshInterval = seconds;
  clearInterval(refreshTimer);

  qsa('.refresh-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.interval) === seconds);
  });

  if (seconds > 0) {
    refreshTimer = setInterval(doRefresh, seconds * 1000);
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
  // Tab switching
  qsa('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Refresh buttons
  qsa('.refresh-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const interval = parseInt(btn.dataset.interval);
      setRefreshInterval(interval);
      if (interval > 0) doRefresh();
    });
  });

  // Initial render
  renderAll();
  updateLastUpdated();
  startCountdown();
  setRefreshInterval(30);

  // Activate first tab
  switchTab('fleet');
}

document.addEventListener('DOMContentLoaded', init);
