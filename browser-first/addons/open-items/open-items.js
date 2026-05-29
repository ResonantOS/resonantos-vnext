/**
 * open-items.js — Pending/Blocked Work Items Dashboard
 *
 * Vanilla JS, no frameworks, CSP-safe.
 * Sections: Needs Attention, Pending, Recently Completed.
 * Filter by priority P0–P3.
 */

// ── Mock Data ────────────────────────────────────────────────────────────────

const ITEMS = [
  // 🔴 Needs Attention
  {
    id: 'u-001',
    section: 'urgent',
    priority: 'p0',
    title: 'Run Linus Panel live benchmark',
    status: 'Tom reminded — needs to be run before next release',
    age: 2,
    source: 'memory/2026-05-27',
  },
  {
    id: 'u-002',
    section: 'urgent',
    priority: 'p1',
    title: 'Blade R730 IP conflict',
    status: 'Previous docs used wrong IP 10.0.1.99 — corrected to 10.0.1.6 but scripts need updating',
    age: 7,
    source: 'TOOLS.md',
  },

  // ⏳ Pending
  {
    id: 'p-001',
    section: 'pending',
    priority: 'p1',
    title: 'SSH key auth to all fleet machines',
    status: 'Passwords documented in TOOLS.md — should migrate to key-based auth for security',
    age: 14,
    source: 'TOOLS.md',
  },
  {
    id: 'p-002',
    section: 'pending',
    priority: 'p0',
    title: 'Lighthouse Hub build',
    status: 'Spec written, UI kickoff pending. Marketplace and addon registry needed.',
    age: 5,
    source: 'HEARTBEAT.md',
  },
  {
    id: 'p-003',
    section: 'pending',
    priority: 'p1',
    title: 'Sonny V2 spec',
    status: 'Agent comms protocol v2 design — upgrade from current Sonny to support multi-hop routing',
    age: 8,
    source: 'HEARTBEAT.md',
  },
  {
    id: 'p-004',
    section: 'pending',
    priority: 'p1',
    title: 'Media Ingestion Engine',
    status: 'Pipeline to ingest Kya\'s videos, photos, and documents into memorial concierge AI',
    age: 21,
    source: 'memory/2026-05-08',
  },
  {
    id: 'p-005',
    section: 'pending',
    priority: 'p2',
    title: 'Blade 3 R620 main network IP',
    status: 'Machine connected via backplane to Blade 4 — needs main network NIC configured',
    age: 11,
    source: 'TOOLS.md',
  },
  {
    id: 'p-006',
    section: 'pending',
    priority: 'p2',
    title: 'RunPod autopay off / refund chase',
    status: 'Autopay confirmed OFF. $900+ idle charges — refund requested but not confirmed',
    age: 22,
    source: 'TOOLS.md',
  },

  // ✅ Recently Completed
  {
    id: 'd-001',
    section: 'done',
    priority: 'none',
    title: 'PR #16 merged',
    status: 'ResonantOS vnext browser-first — Hyper Linus Panel base merged',
    age: 1,
    source: 'github',
  },
  {
    id: 'd-002',
    section: 'done',
    priority: 'none',
    title: 'Backup complete 2026-05-29',
    status: 'Workspace backed up to WD My Passport 6TB primary drive',
    age: 0,
    source: 'memory/2026-05-29',
  },
  {
    id: 'd-003',
    section: 'done',
    priority: 'none',
    title: 'Contribution report generated',
    status: 'Monthly Fieldale consulting contribution summary created',
    age: 3,
    source: 'memory/2026-05-26',
  },
];

// ── State ────────────────────────────────────────────────────────────────────

let activeFilter = 'all';

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

function fmtAge(days) {
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

// ── Build Item Row ────────────────────────────────────────────────────────────

function buildRow(item) {
  const row = el('article', {
    class: `item-row ${item.section}`,
    role: 'listitem',
    'aria-label': `${item.priority !== 'none' ? item.priority.toUpperCase() + ' — ' : ''}${escapeHtml(item.title)}`,
  });

  // Priority badge
  if (item.priority !== 'none') {
    row.appendChild(
      el('span', {
        class: `priority-badge ${item.priority}`,
        'aria-label': `Priority ${item.priority.toUpperCase()}`,
      }, item.priority.toUpperCase())
    );
  }

  // Title
  row.appendChild(el('span', { class: 'item-title' }, item.title));

  // Status
  row.appendChild(el('span', { class: 'item-status' }, item.status));

  // Meta: age + source
  const meta = el('div', { class: 'item-meta' });
  meta.appendChild(el('span', { class: 'age-badge', 'aria-label': `Created ${fmtAge(item.age)}` }, fmtAge(item.age)));
  meta.appendChild(el('span', { class: 'source-badge', 'aria-label': `Source: ${item.source}` }, item.source));
  row.appendChild(meta);

  return row;
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderSection(sectionId, items, listId, badgeId) {
  const list  = document.getElementById(listId);
  const badge = document.getElementById(badgeId);
  if (!list) return;

  list.innerHTML = '';

  const filtered = items.filter(item => {
    if (item.section !== sectionId) return false;
    if (activeFilter === 'all') return true;
    return item.priority === activeFilter;
  });

  if (filtered.length === 0) {
    list.appendChild(
      el('div', { class: 'empty-state', role: 'status' }, 'No items match the current filter.')
    );
  } else {
    for (const item of filtered) {
      list.appendChild(buildRow(item));
    }
  }

  if (badge) badge.textContent = String(filtered.length);
}

function render() {
  renderSection('urgent',  ITEMS, 'list-urgent',  'badge-urgent');
  renderSection('pending', ITEMS, 'list-pending',  'badge-pending');
  renderSection('done',    ITEMS, 'list-done',     'badge-done');

  const lu = document.getElementById('last-updated');
  if (lu) lu.textContent = new Date().toLocaleTimeString();
}

// ── Filter Buttons ────────────────────────────────────────────────────────────

function initFilters() {
  const btns = document.querySelectorAll('.filter-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      activeFilter = btn.dataset.filter;
      render();
    });
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
  initFilters();
  render();
}

document.addEventListener('DOMContentLoaded', init);
