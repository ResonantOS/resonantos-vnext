/**
 * task-board.js — Kanban Board
 *
 * Vanilla JS, HTML5 drag-and-drop, CSP-safe.
 * Mock data from HEARTBEAT.md tasks.
 */

// ── Mock Task Data ──────────────────────────────────────────────────────────

const TASKS = [
  {
    id: 'task-001',
    title: 'Set up Blade 2 for 7B ternary training',
    desc: 'Configure BIOS, install Ubuntu, compile BitNet, assign model slot for Ternary Sunrise.',
    nextAction: 'Flash Ubuntu 22.04 LTS, set up SSH key auth, compile BitNet SSE4.1',
    state: 'Waiting on spare SSD to arrive. BIOS config done.',
    blocker: null,
    priority: 'p0',
    assignee: 'Analog6',
    col: 'inprog',
  },
  {
    id: 'task-002',
    title: 'Set up The OG as evaluation node',
    desc: 'Deploy evaluation harness on GT70 Ubuntu box. Wire lm-eval-harness for ternary model benchmarking.',
    nextAction: 'Install Python 3.11, lm-eval-harness, configure eval pipeline',
    state: 'Ubuntu already running. Need eval harness installed.',
    blocker: null,
    priority: 'p0',
    assignee: 'Analog6',
    col: 'inprog',
  },
  {
    id: 'task-003',
    title: 'Test Body Explorer on staging',
    desc: 'Run the Body Explorer UI on staging server, validate all anatomical layers render correctly.',
    nextAction: 'Deploy to Hetzner staging, run visual regression suite',
    state: 'Build passing. Deployment script ready.',
    blocker: null,
    priority: 'p0',
    assignee: 'Analog6',
    col: 'ready',
  },
  {
    id: 'task-004',
    title: 'Lighthouse Hub + Marketplace',
    desc: 'Build the Lighthouse Hub landing and addon marketplace UI for ResonantOS browser-first.',
    nextAction: 'Design wireframes, create addon.json registry endpoint',
    state: 'Spec written. Awaiting UI kickoff.',
    blocker: null,
    priority: 'p0',
    assignee: 'Analog6',
    col: 'ready',
  },
  {
    id: 'task-005',
    title: 'Build Runtime Adapter Layer',
    desc: 'Abstraction layer between OpenClaw kernel and ResonantOS protocol engines.',
    nextAction: 'Write adapter spec, stub out Mantis/Sonny interfaces',
    state: 'Architecture drafted in HEARTBEAT.md.',
    blocker: null,
    priority: 'p1',
    assignee: 'Analog6',
    col: 'ready',
  },
  {
    id: 'task-006',
    title: 'Compile BitNet SSE4.1 on Sniper',
    desc: 'Build BitNet.cpp with SSE4.1 optimizations on the Sniper machine (Ryzen-based).',
    nextAction: 'SSH to Sniper, clone llama.cpp fork, compile with -DLLAMA_AVX -DLLAMA_SSE41',
    state: 'SSH access confirmed. Compiler toolchain installed.',
    blocker: null,
    priority: 'p1',
    assignee: 'Analog6',
    col: 'ready',
  },
  {
    id: 'task-007',
    title: 'Test Linus Panel v4 HYPER mode',
    desc: 'Full end-to-end test of the Hyper Linus Panel with all 5 new addons loaded.',
    nextAction: 'Load all new addons, run integration tests, screenshot comparison',
    state: 'Addons being built now.',
    blocker: null,
    priority: 'p2',
    assignee: 'Analog6',
    col: 'ready',
  },
  {
    id: 'task-008',
    title: 'Resonator Windows backend',
    desc: 'Port Resonator daemon to Windows for P-ASUS and Blade 4 PE2950 support.',
    nextAction: 'Fork resonator service, add win32 named-pipe transport',
    state: 'macOS + Linux backends stable. Windows spec drafted.',
    blocker: null,
    priority: 'p2',
    assignee: 'Analog6',
    col: 'ready',
  },
  {
    id: 'task-009',
    title: 'Clean stale openclaw.json entries',
    desc: 'Audit openclaw.json for orphaned plugin entries and stale cron jobs.',
    nextAction: 'Run openclaw config audit, diff against known-good backup',
    state: 'Identified ~8 stale entries. Not yet removed.',
    blocker: null,
    priority: 'p3',
    assignee: 'Analog6',
    col: 'ready',
  },
  {
    id: 'task-010',
    title: 'Wire Logician enforcement',
    desc: 'Connect Logician rule engine output to OpenClaw before_tool_call hook.',
    nextAction: 'Blocked pending Shield plugin API stability',
    state: 'Rule engine working in isolation. Integration blocked.',
    blocker: 'Shield plugin API not yet stable. Cannot integrate until shield-gate v2 lands.',
    priority: 'p3',
    assignee: 'Analog6',
    col: 'blocked',
  },
];

// ── State ────────────────────────────────────────────────────────────────────

let tasks = TASKS.map(t => ({ ...t }));
let draggedId = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') element.className = v;
    else element.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  }
  return element;
}

// ── Card Builder ─────────────────────────────────────────────────────────────

function buildCard(task) {
  const card = el('article', {
    class: 'task-card',
    id: `card-${task.id}`,
    draggable: 'true',
    role: 'listitem',
    'aria-label': `${task.priority.toUpperCase()} — ${escapeHtml(task.title)}`,
    'data-id': task.id,
    tabindex: '0',
  });

  // Top row: priority + title
  const top = el('div', { class: 'task-top' });
  top.appendChild(el('span', { class: `priority-badge ${task.priority}`, 'aria-label': `Priority ${task.priority.toUpperCase()}` }, task.priority.toUpperCase()));
  top.appendChild(el('span', { class: 'task-title' }, task.title));
  card.appendChild(top);

  // Description
  card.appendChild(el('p', { class: 'task-desc' }, task.desc));

  // Footer: assignee + expand button
  const footer = el('div', { class: 'task-footer' });
  footer.appendChild(el('span', { class: 'assignee-badge', 'aria-label': `Assigned to ${task.assignee}` }, task.assignee));

  const expandBtn = el('button', {
    class: 'expand-btn',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': `detail-${task.id}`,
    title: 'Show details',
  }, '▾ Details');

  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = card.classList.toggle('expanded');
    expandBtn.setAttribute('aria-expanded', String(isExpanded));
    expandBtn.textContent = isExpanded ? '▴ Hide' : '▾ Details';
  });

  footer.appendChild(expandBtn);
  card.appendChild(footer);

  // Expandable detail section
  const detail = el('div', {
    class: 'task-detail',
    id: `detail-${task.id}`,
    role: 'region',
    'aria-label': `Details for ${escapeHtml(task.title)}`,
  });

  if (task.nextAction) {
    detail.appendChild(
      el('div', { class: 'detail-row' },
        el('span', { class: 'detail-label' }, 'Next Action'),
        el('span', { class: 'detail-value' }, task.nextAction)
      )
    );
  }

  if (task.state) {
    detail.appendChild(
      el('div', { class: 'detail-row' },
        el('span', { class: 'detail-label' }, 'Current State'),
        el('span', { class: 'detail-value' }, task.state)
      )
    );
  }

  if (task.blocker) {
    detail.appendChild(
      el('div', { class: 'detail-row' },
        el('span', { class: 'detail-label' }, '🚧 Blocker'),
        el('span', { class: 'detail-value blocker' }, task.blocker)
      )
    );
  }

  card.appendChild(detail);

  // Drag events
  card.addEventListener('dragstart', (e) => {
    draggedId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedId = null;
    document.querySelectorAll('.kanban-col').forEach(col => col.classList.remove('drag-over'));
    document.querySelectorAll('.drop-placeholder').forEach(p => p.remove());
  });

  // Keyboard accessibility
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const expandBtn2 = card.querySelector('.expand-btn');
      if (expandBtn2) expandBtn2.click();
    }
  });

  return card;
}

// ── Column Drop Handlers ──────────────────────────────────────────────────────

function initColumnDrop(col) {
  const colId = col.dataset.col;
  const body = col.querySelector('.col-body');

  col.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drag-over');
  });

  col.addEventListener('dragleave', (e) => {
    if (!col.contains(e.relatedTarget)) {
      col.classList.remove('drag-over');
    }
  });

  col.addEventListener('drop', (e) => {
    e.preventDefault();
    col.classList.remove('drag-over');

    const id = e.dataTransfer.getData('text/plain') || draggedId;
    if (!id) return;

    const task = tasks.find(t => t.id === id);
    if (!task || task.col === colId) return;

    task.col = colId;
    renderBoard();
  });
}

// ── Render Board ─────────────────────────────────────────────────────────────

const COLS = ['ready', 'inprog', 'blocked', 'done'];

function renderBoard() {
  for (const col of COLS) {
    const body = document.getElementById(`body-${col}`);
    const badge = document.getElementById(`badge-${col}`);
    if (!body) continue;

    body.innerHTML = '';
    const colTasks = tasks.filter(t => t.col === col);

    if (colTasks.length === 0) {
      body.appendChild(
        el('div', { class: 'drop-placeholder', 'aria-hidden': 'true' }, 'Drop here')
      );
    } else {
      for (const task of colTasks) {
        body.appendChild(buildCard(task));
      }
    }

    if (badge) badge.textContent = String(colTasks.length);
  }

  const countEl = document.getElementById('task-count');
  if (countEl) countEl.textContent = `${tasks.length} tasks`;
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
  renderBoard();

  const cols = document.querySelectorAll('.kanban-col');
  cols.forEach(initColumnDrop);
}

document.addEventListener('DOMContentLoaded', init);
