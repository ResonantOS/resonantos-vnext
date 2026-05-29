/**
 * canvas.js — Fleet Topology Graph
 *
 * HTML5 Canvas-based interactive node graph.
 * Vanilla JS, no frameworks, CSP-safe.
 * Supports: drag nodes, zoom (wheel), pan (background drag), hover tooltips, search highlight.
 */

// ── Design tokens (mirrors CSS vars) ────────────────────────────────────────
const COLORS = {
  bgBase:       '#0a0e1a',
  bgCard:       '#111827',
  border:       '#1e2d42',
  borderBright: '#2a3f5a',
  teal:         '#14F195',
  tealDim:      'rgba(20,241,149,0.18)',
  purple:       '#9945FF',
  purpleDim:    'rgba(153,69,255,0.18)',
  cyan:         '#60d9ff',
  cyanDim:      'rgba(96,217,255,0.18)',
  online:       '#22c55e',
  offline:      '#ef4444',
  pending:      '#f59e0b',
  textPrimary:  '#f1f5f9',
  textSec:      '#94a3b8',
  textDim:      '#64748b',
  edge:         'rgba(42,63,90,0.6)',
  edgeHighlight:'rgba(20,241,149,0.5)',
};

// ── Mock Topology Data ───────────────────────────────────────────────────────

const NODES = [
  // Machines (hexagon)
  { id: 'm-mac',     type: 'machine',  label: 'M4 Mac Mini',   ip: '192.168.6.20',  status: 'online',  x: 420, y: 220, role: 'Orchestrator' },
  { id: 'm-hal',     type: 'machine',  label: 'HAL 9000',      ip: '192.168.6.143', status: 'online',  x: 220, y: 160, role: 'Inference' },
  { id: 'm-og',      type: 'machine',  label: 'The OG',        ip: '192.168.7.233', status: 'online',  x: 140, y: 300, role: 'Evaluation' },
  { id: 'm-guardian',type: 'machine',  label: 'Guardian',      ip: '192.168.4.88',  status: 'online',  x: 220, y: 440, role: 'Inference' },
  { id: 'm-sniper',  type: 'machine',  label: 'Sniper',        ip: '192.168.5.160', status: 'online',  x: 420, y: 520, role: 'Inference' },
  { id: 'm-r730',    type: 'machine',  label: 'Blade R730',    ip: '192.168.1.239', status: 'online',  x: 640, y: 440, role: 'Ternary Training' },
  { id: 'm-r720',    type: 'machine',  label: 'Blade 2 R720',  ip: '192.168.1.240', status: 'pending', x: 740, y: 320, role: 'Staging' },
  { id: 'm-r620',    type: 'machine',  label: 'Blade 3 R620',  ip: null,            status: 'offline', x: 740, y: 180, role: 'Utility' },
  { id: 'm-pe2950',  type: 'machine',  label: 'Blade 4 PE2950',ip: '192.168.7.191', status: 'online',  x: 640, y: 140, role: 'Ternary Utility' },
  { id: 'm-pasus',   type: 'machine',  label: 'P-ASUS',        ip: '192.168.6.116', status: 'online',  x: 320, y: 100, role: 'UI Node' },
  { id: 'm-xbox',    type: 'machine',  label: 'Xbox Series X', ip: '192.168.5.19',  status: 'online',  x: 540, y: 60,  role: 'Dev Mode' },

  // Protocols (circle)
  { id: 'p-sonny',   type: 'protocol', label: 'Sonny',    port: '8090', x: 420, y: 340, desc: 'Agent Comms v2' },
  { id: 'p-mantis',  type: 'protocol', label: 'Mantis',   port: '8091', x: 300, y: 280, desc: 'Memory & Context' },
  { id: 'p-oracle',  type: 'protocol', label: 'Oracle',   port: '8092', x: 540, y: 280, desc: 'Truth Layer' },
  { id: 'p-linus',   type: 'protocol', label: 'Linus',    port: '8093', x: 300, y: 380, desc: 'Doc Review' },
  { id: 'p-xavier',  type: 'protocol', label: 'Xavier',   port: '8094', x: 540, y: 380, desc: 'Perception Engine' },

  // Services (square)
  { id: 's-gw',      type: 'service',  label: 'Gateway',  port: '18789', x: 420, y: 220, desc: 'OpenClaw Gateway', offset: { x: 40, y: -40 } },
  { id: 's-dash',    type: 'service',  label: 'Dashboard',port: '19100', x: 420, y: 220, desc: 'Web Dashboard',    offset: { x: -50, y: -40 } },
  { id: 's-blade',   type: 'service',  label: 'TernaryMon',port: '8080', x: 640, y: 440, desc: 'Training Monitor', offset: { x: 50, y: 30 } },
  { id: 's-devport', type: 'service',  label: 'DevPortal', port: '11443',x: 540, y: 60,  desc: 'Xbox Dev Portal',  offset: { x: 45, y: 25 } },
];

// Compute service positions from offset
for (const n of NODES) {
  if (n.offset) {
    const ref = NODES.find(m => m.x === n.x && m.y === n.y && m.type === 'machine');
    if (ref) { n.x = ref.x + n.offset.x; n.y = ref.y + n.offset.y; }
  }
}

const EDGES = [
  // Machines → Gateway
  { from: 'm-mac', to: 's-gw' },
  { from: 'm-mac', to: 's-dash' },
  // Machines → Protocols
  { from: 'm-mac',    to: 'p-sonny' },
  { from: 'm-mac',    to: 'p-mantis' },
  { from: 'm-mac',    to: 'p-xavier' },
  { from: 'm-hal',    to: 'p-sonny' },
  { from: 'm-og',     to: 'p-xavier' },
  { from: 'm-guardian',to:'p-sonny' },
  { from: 'm-r730',   to: 'p-oracle' },
  { from: 'm-pe2950', to: 'p-oracle' },
  { from: 'm-r720',   to: 'p-oracle' },
  // Protocol interconnects
  { from: 'p-mantis', to: 'p-oracle' },
  { from: 'p-xavier', to: 'p-oracle' },
  { from: 'p-sonny',  to: 'p-mantis' },
  { from: 'p-linus',  to: 'p-mantis' },
  // Machine → Services
  { from: 'm-r730', to: 's-blade' },
  { from: 'm-xbox', to: 's-devport' },
];

// ── Canvas Setup ─────────────────────────────────────────────────────────────

const canvas  = document.getElementById('topology-canvas');
const ctx     = canvas.getContext('2d');
const miniCvs = document.getElementById('minimap-canvas');
const miniCtx = miniCvs ? miniCvs.getContext('2d') : null;

let viewport = { x: 0, y: 0, scale: 1.0 };
let dragging = null;    // { nodeId, offX, offY } or null
let panning  = false;
let panStart = { x: 0, y: 0, vx: 0, vy: 0 };
let hoveredId = null;
let searchQuery = '';
let animFrame = null;

// Deep-copy node positions so we can mutate
const nodeMap = {};
for (const n of NODES) {
  nodeMap[n.id] = { ...n };
}

// ── Resize ───────────────────────────────────────────────────────────────────

function resize() {
  const wrapper = canvas.parentElement;
  canvas.width  = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  if (miniCvs) {
    miniCvs.width  = miniCvs.offsetWidth  || 160;
    miniCvs.height = miniCvs.offsetHeight || 100;
  }
  draw();
}

// ── Coordinate transforms ────────────────────────────────────────────────────

function worldToScreen(wx, wy) {
  return {
    x: (wx + viewport.x) * viewport.scale,
    y: (wy + viewport.y) * viewport.scale,
  };
}

function screenToWorld(sx, sy) {
  return {
    x: sx / viewport.scale - viewport.x,
    y: sy / viewport.scale - viewport.y,
  };
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function hexPath(cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function getNodeColor(node) {
  if (node.type === 'machine') {
    if (node.status === 'online')  return COLORS.teal;
    if (node.status === 'offline') return COLORS.offline;
    return COLORS.pending;
  }
  if (node.type === 'protocol') return COLORS.purple;
  return COLORS.cyan;
}

function getNodeRadius(node) {
  if (node.type === 'machine')  return 18;
  if (node.type === 'protocol') return 14;
  return 12;
}

function isHighlighted(node) {
  if (!searchQuery) return false;
  const q = searchQuery.toLowerCase();
  return node.label.toLowerCase().includes(q) ||
    (node.ip && node.ip.includes(q)) ||
    (node.role && node.role.toLowerCase().includes(q)) ||
    (node.desc && node.desc.toLowerCase().includes(q));
}

function drawNode(node, sc) {
  const r = getNodeRadius(node) * sc;
  const color = getNodeColor(node);
  const highlighted = isHighlighted(node);
  const hovered = node.id === hoveredId;

  ctx.save();

  // Glow for hovered/highlighted
  if (hovered || highlighted) {
    ctx.shadowColor = color;
    ctx.shadowBlur  = 18;
  }

  // Fill
  ctx.fillStyle = color + '28'; // dim fill
  if (highlighted) ctx.fillStyle = color + '44';

  if (node.type === 'machine') {
    hexPath(node._sx, node._sy, r);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth   = hovered || highlighted ? 2.5 : 1.5;
    ctx.stroke();
  } else if (node.type === 'protocol') {
    ctx.beginPath();
    ctx.arc(node._sx, node._sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth   = hovered || highlighted ? 2.5 : 1.5;
    ctx.stroke();
  } else {
    // service: rounded square
    const size = r * 1.5;
    const rad  = 4 * sc;
    ctx.beginPath();
    ctx.roundRect(node._sx - size / 2, node._sy - size / 2, size, size, rad);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth   = hovered || highlighted ? 2.5 : 1.5;
    ctx.stroke();
  }

  ctx.restore();

  // Label
  ctx.save();
  ctx.font      = `${Math.max(9, 11 * sc)}px Inter, sans-serif`;
  ctx.fillStyle = hovered || highlighted ? COLORS.textPrimary : COLORS.textSec;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(node.label, node._sx, node._sy + r + 4 * sc);

  // IP badge for machines
  if (node.type === 'machine' && node.ip && sc > 0.7) {
    ctx.font      = `${Math.max(8, 9 * sc)}px JetBrains Mono, monospace`;
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText(node.ip, node._sx, node._sy + r + (4 + 14) * sc);
  }

  ctx.restore();
}

function drawEdge(edge) {
  const from = nodeMap[edge.from];
  const to   = nodeMap[edge.to];
  if (!from || !to) return;

  const highlighted = isHighlighted(from) || isHighlighted(to) ||
    from.id === hoveredId || to.id === hoveredId;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(from._sx, from._sy);
  ctx.lineTo(to._sx,   to._sy);
  ctx.strokeStyle = highlighted ? COLORS.edgeHighlight : COLORS.edge;
  ctx.lineWidth   = highlighted ? 1.5 : 1;

  if (!highlighted) {
    ctx.setLineDash([4, 6]);
  }

  ctx.stroke();
  ctx.restore();
}

function draw() {
  if (!canvas.width) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = COLORS.bgBase;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sc = viewport.scale;

  // Compute screen positions
  for (const id of Object.keys(nodeMap)) {
    const n  = nodeMap[id];
    const sp = worldToScreen(n.x, n.y);
    n._sx = sp.x;
    n._sy = sp.y;
  }

  // Draw edges first (behind nodes)
  for (const edge of EDGES) {
    drawEdge(edge);
  }

  // Draw nodes
  for (const id of Object.keys(nodeMap)) {
    drawNode(nodeMap[id], sc);
  }

  drawMinimap();
  updateZoomLabel();
}

// ── Minimap ──────────────────────────────────────────────────────────────────

function drawMinimap() {
  if (!miniCtx || !miniCvs.width) return;

  miniCtx.clearRect(0, 0, miniCvs.width, miniCvs.height);
  miniCtx.fillStyle = COLORS.bgCard;
  miniCtx.fillRect(0, 0, miniCvs.width, miniCvs.height);

  // Find world bounds
  const xs = NODES.map(n => n.x);
  const ys = NODES.map(n => n.y);
  const minX = Math.min(...xs) - 40;
  const minY = Math.min(...ys) - 40;
  const maxX = Math.max(...xs) + 40;
  const maxY = Math.max(...ys) + 40;
  const ww = maxX - minX;
  const wh = maxY - minY;

  const mw = miniCvs.width;
  const mh = miniCvs.height;
  const scX = mw / ww;
  const scY = mh / wh;
  const mscale = Math.min(scX, scY);

  // Draw nodes as dots
  for (const n of NODES) {
    const mx = (n.x - minX) * mscale;
    const my = (n.y - minY) * mscale;
    miniCtx.beginPath();
    miniCtx.arc(mx, my, 3, 0, Math.PI * 2);
    miniCtx.fillStyle = getNodeColor(n);
    miniCtx.fill();
  }

  // Viewport rect
  const vpLeft   = (0 / viewport.scale - viewport.x - minX) * mscale;
  const vpTop    = (0 / viewport.scale - viewport.y - minY) * mscale;
  const vpRight  = (canvas.width / viewport.scale - viewport.x - minX) * mscale;
  const vpBottom = (canvas.height / viewport.scale - viewport.y - minY) * mscale;

  miniCtx.strokeStyle = COLORS.teal;
  miniCtx.lineWidth   = 1.5;
  miniCtx.strokeRect(vpLeft, vpTop, vpRight - vpLeft, vpBottom - vpTop);
}

// ── Zoom / Pan ────────────────────────────────────────────────────────────────

function zoomAt(screenX, screenY, factor) {
  const wBefore = screenToWorld(screenX, screenY);
  viewport.scale = Math.max(0.2, Math.min(3, viewport.scale * factor));
  const wAfter = screenToWorld(screenX, screenY);
  viewport.x += wAfter.x - wBefore.x;
  viewport.y += wAfter.y - wBefore.y;
  scheduleDraw();
}

function fitAll() {
  const xs = NODES.map(n => n.x);
  const ys = NODES.map(n => n.y);
  const minX = Math.min(...xs) - 60;
  const minY = Math.min(...ys) - 60;
  const maxX = Math.max(...xs) + 60;
  const maxY = Math.max(...ys) + 60;
  const ww = maxX - minX;
  const wh = maxY - minY;
  const sc = Math.min(canvas.width / ww, canvas.height / wh, 1.5);
  viewport.scale = sc;
  viewport.x = canvas.width  / 2 / sc - (minX + ww / 2);
  viewport.y = canvas.height / 2 / sc - (minY + wh / 2);
  scheduleDraw();
}

function scheduleDraw() {
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(draw);
}

// ── Hit-testing ───────────────────────────────────────────────────────────────

function nodeAt(sx, sy) {
  for (const id of Object.keys(nodeMap)) {
    const n = nodeMap[id];
    const r = getNodeRadius(n) * viewport.scale;
    const dx = sx - n._sx;
    const dy = sy - n._sy;
    if (dx * dx + dy * dy < r * r * 1.5) return n;
  }
  return null;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

const tooltipEl = document.getElementById('node-tooltip');
const tooltipTitle = document.getElementById('tooltip-title');
const tooltipRows  = document.getElementById('tooltip-rows');

function showTooltip(node, sx, sy) {
  tooltipTitle.textContent = node.label;
  tooltipRows.innerHTML = '';

  const rows = [];
  if (node.type === 'machine') {
    rows.push(['Type', 'Machine']);
    if (node.ip)   rows.push(['IP',     node.ip]);
    if (node.role) rows.push(['Role',   node.role]);
    rows.push(['Status', node.status]);
  } else if (node.type === 'protocol') {
    rows.push(['Type', 'Protocol']);
    if (node.port) rows.push(['Port', node.port]);
    if (node.desc) rows.push(['Desc', node.desc]);
  } else {
    rows.push(['Type', 'Service']);
    if (node.port) rows.push(['Port', node.port]);
    if (node.desc) rows.push(['Desc', node.desc]);
  }

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'tooltip-row';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'tooltip-label';
    labelSpan.textContent = label;
    const valueSpan = document.createElement('span');
    valueSpan.className = 'tooltip-value';
    valueSpan.textContent = value;
    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    tooltipRows.appendChild(row);
  }

  const pad = 12;
  let tx = sx + 16;
  let ty = sy - 10;
  if (tx + 220 > canvas.width)  tx = sx - 230;
  if (ty + 120 > canvas.height) ty = canvas.height - 130;
  if (ty < 0) ty = 0;

  tooltipEl.style.left = `${tx}px`;
  tooltipEl.style.top  = `${ty}px`;
  tooltipEl.classList.add('visible');
}

function hideTooltip() {
  tooltipEl.classList.remove('visible');
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Zoom label ───────────────────────────────────────────────────────────────

function updateZoomLabel() {
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = `${Math.round(viewport.scale * 100)}%`;
}

// ── Events ────────────────────────────────────────────────────────────────────

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  zoomAt(sx, sy, factor);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const hit = nodeAt(sx, sy);

  if (hit) {
    const w = screenToWorld(sx, sy);
    dragging = { nodeId: hit.id, offX: hit.x - w.x, offY: hit.y - w.y };
  } else {
    panning  = true;
    panStart = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y };
  }
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  if (dragging) {
    const w = screenToWorld(sx, sy);
    nodeMap[dragging.nodeId].x = w.x + dragging.offX;
    nodeMap[dragging.nodeId].y = w.y + dragging.offY;
    scheduleDraw();
    return;
  }

  if (panning) {
    viewport.x = panStart.vx + (e.clientX - panStart.x) / viewport.scale;
    viewport.y = panStart.vy + (e.clientY - panStart.y) / viewport.scale;
    scheduleDraw();
    return;
  }

  // Hover / tooltip
  const hit = nodeAt(sx, sy);
  const newHovered = hit ? hit.id : null;
  if (newHovered !== hoveredId) {
    hoveredId = newHovered;
    scheduleDraw();
  }

  if (hit) {
    canvas.style.cursor = 'pointer';
    showTooltip(hit, sx, sy);
  } else {
    canvas.style.cursor = 'grab';
    hideTooltip();
  }
});

canvas.addEventListener('mouseup', () => {
  dragging = null;
  panning  = false;
});

canvas.addEventListener('mouseleave', () => {
  dragging = null;
  panning  = false;
  hoveredId = null;
  hideTooltip();
  scheduleDraw();
});

// Zoom buttons
document.getElementById('zoom-in')?.addEventListener('click',  () => zoomAt(canvas.width/2, canvas.height/2, 1.2));
document.getElementById('zoom-out')?.addEventListener('click', () => zoomAt(canvas.width/2, canvas.height/2, 0.833));
document.getElementById('zoom-fit')?.addEventListener('click', fitAll);

// Search
document.getElementById('search-input')?.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  scheduleDraw();
});

// Resize
window.addEventListener('resize', resize);

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
  resize();
  fitAll();
}

document.addEventListener('DOMContentLoaded', init);
