/**
 * blackboard.js — Resonant Blackboard rendering engine
 *
 * Receives commands from Augmentor (via chrome.runtime messages relayed
 * through the background service worker) and renders them on-screen.
 *
 * Command protocol:
 *   { channel: "resonantos.blackboard", command: "draw|document|table|embed|image|present|clear|annotate", payload: {...} }
 */

// ── State ─────────────────────────────────────────────────────────────────────

let currentMode = "welcome";
let presentSlides = [];
let presentIndex = 0;
let sortState = { col: -1, asc: true };
let tableData = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const surface = document.getElementById("blackboard-surface");
const modeTabs = document.querySelectorAll(".bb-mode-tabs button");
const clearBtn = document.getElementById("bb-clear");
const exportBtn = document.getElementById("bb-export");
const sendToAugmentorBtn = document.getElementById("bb-send-to-augmentor");

// ── Mode tab wiring ───────────────────────────────────────────────────────────

modeTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    setActiveTab(mode);
    if (mode === "canvas") handleCommand("draw", { shapes: [] });
    else if (mode === "document") handleCommand("document", { markdown: "" });
    else if (mode === "table") handleCommand("table", { headers: [], rows: [] });
    else if (mode === "embed") handleCommand("embed", { url: "" });
    else if (mode === "image") handleCommand("image", { src: "", alt: "Drop or paste an image" });
    else if (mode === "present") handleCommand("present", { slides: [] });
    else if (mode === "annotate") handleCommand("annotate", { annotations: [] });
  });
});

clearBtn.addEventListener("click", () => handleCommand("clear", {}));

exportBtn.addEventListener("click", doExport);

if (sendToAugmentorBtn) {
  sendToAugmentorBtn.addEventListener("click", () => sendBlackboardToAugmentor());
}

// ── Auto-show welcome smiley after a brief delay ─────────────────────────────
setTimeout(() => { if (currentMode === "welcome") handleCommand("draw", { shapes: [] }); }, 800);

// ── Message listener (from background.js relay) ────────────────────────────────
try {
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!message || message.channel !== "resonantos.blackboard") return;
  handleCommand(message.command, message.payload ?? {});
  sendResponse({ ok: true });
});
} catch (_) { /* chrome.runtime unavailable outside extension context */ }

// ── Main command dispatcher ───────────────────────────────────────────────────

function handleCommand(command, payload) {
  switch (command) {
    case "draw":
    case "canvas":
      setActiveTab("canvas");
      renderCanvas(payload);
      break;
    case "document":
    case "doc":
      setActiveTab("document");
      renderDocument(payload);
      break;
    case "table":
      setActiveTab("table");
      renderTable(payload);
      break;
    case "embed":
    case "web":
      setActiveTab("embed");
      renderEmbed(payload);
      break;
    case "image":
      renderImage(payload);
      break;
    case "present":
      setActiveTab("present");
      renderPresent(payload);
      break;
    case "annotate":
      renderAnnotations(payload);
      break;
    case "clear":
      clearBlackboard();
      break;
    default:
      console.warn("[Blackboard] Unknown command:", command);
  }
}

function setActiveTab(mode) {
  currentMode = mode;
  modeTabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

// ── Clear ─────────────────────────────────────────────────────────────────────

function clearBlackboard() {
  surface.innerHTML = "";
  const welcome = document.createElement("div");
  welcome.id = "bb-welcome";
  welcome.className = "bb-welcome bb-fadein";
  welcome.innerHTML = `
    <div class="bb-welcome-icon">◈</div>
    <h2>Resonant Blackboard</h2>
    <p>Augmentor's visual display surface. Type a command in the side panel to display content here.</p>
    <div class="bb-welcome-commands">
      <code>/blackboard</code> — open / focus<br>
      <code>/draw</code> — canvas diagram<br>
      <code>/table</code> — data table<br>
      <code>/doc</code> — markdown document<br>
      <code>/show &lt;url&gt;</code> — embed webpage<br>
      <code>/present</code> — slideshow
    </div>`;
  surface.appendChild(welcome);
  modeTabs.forEach((btn) => btn.classList.remove("active"));
  modeTabs[0].classList.add("active");
  currentMode = "welcome";
}

// ── Canvas / Draw mode ────────────────────────────────────────────────────────

const PALETTE = {
  rect:    "#24d18f",
  circle:  "#9b6dff",
  line:    "#4db8ff",
  arrow:   "#ffd166",
  text:    "#eef7f0",
  path:    "#ff6b6b",
  default: "#24d18f",
};

function renderCanvas(payload) {
  surface.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.id = "bb-canvas-wrap";
  wrap.className = "bb-fadein";

  const canvas = document.createElement("canvas");
  canvas.id = "bb-canvas";
  wrap.appendChild(canvas);
  surface.appendChild(wrap);

  // Resize to fill surface
  const resize = () => {
    const w = surface.clientWidth;
    const h = surface.clientHeight;
    canvas.width = w;
    canvas.height = h;
    drawShapes(canvas, payload.shapes ?? []);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(surface);
  resize();
}

function drawShapes(canvas, shapes) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw with animation: each shape fades in sequentially
  let delay = 0;
  const STEP = 120; // ms between shapes

  shapes.forEach((shape, idx) => {
    window.setTimeout(() => {
      animateShape(ctx, shape, canvas.width, canvas.height);
    }, delay);
    delay += STEP;
  });

  // If no shapes, draw welcome smiley
  if (!shapes.length) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - 30;
    const r = Math.min(canvas.width, canvas.height) * 0.22;
    ctx.strokeStyle = "#14F195";
    ctx.fillStyle = "#14F195";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    // Face circle
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // Left eye
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.08, 0, Math.PI * 2); ctx.fill();
    // Right eye
    ctx.beginPath(); ctx.arc(cx + r * 0.3, cy - r * 0.2, r * 0.08, 0, Math.PI * 2); ctx.fill();
    // Smile arc
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.05, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 2.5; ctx.stroke();
    // Welcome text
    ctx.font = `${Math.max(18, r * 0.22)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Welcome to ResonantOS!", cx, cy + r + 40);
  }
}

function animateShape(ctx, shape, W, H) {
  const color = shape.color || PALETTE[shape.type] || PALETTE.default;
  ctx.save();
  ctx.globalAlpha = 0;

  // Animate alpha from 0 → 1
  let alpha = 0;
  const fadeIn = () => {
    alpha = Math.min(1, alpha + 0.12);
    ctx.globalAlpha = alpha;
    drawSingleShape(ctx, shape, W, H, color);
    if (alpha < 1) requestAnimationFrame(fadeIn);
    else ctx.restore();
  };
  requestAnimationFrame(fadeIn);
}

function drawSingleShape(ctx, shape, W, H, color) {
  // Re-clear just the shape area is not practical for overlay; we accept blending
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = shape.width || 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const x = shape.x ?? 40;
  const y = shape.y ?? 40;
  const w = shape.w ?? 120;
  const h = shape.h ?? 60;
  const r = shape.r ?? Math.min(w, h) / 2;

  switch (shape.type) {
    case "rect": {
      ctx.strokeRect(x, y, w, h);
      if (shape.fill) { ctx.globalAlpha *= 0.18; ctx.fillRect(x, y, w, h); ctx.globalAlpha /= 0.18; }
      drawLabel(ctx, shape.label, x + w / 2, y + h / 2, color);
      break;
    }
    case "circle":
    case "ellipse": {
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (shape.fill) { ctx.globalAlpha *= 0.18; ctx.fill(); ctx.globalAlpha /= 0.18; }
      drawLabel(ctx, shape.label, x, y, color);
      break;
    }
    case "line": {
      ctx.beginPath();
      ctx.moveTo(shape.x1 ?? x, shape.y1 ?? y);
      ctx.lineTo(shape.x2 ?? (x + w), shape.y2 ?? (y + h));
      ctx.stroke();
      break;
    }
    case "arrow": {
      const x1 = shape.x1 ?? x;
      const y1 = shape.y1 ?? y;
      const x2 = shape.x2 ?? (x + w);
      const y2 = shape.y2 ?? (y + h);
      drawArrow(ctx, x1, y1, x2, y2, color);
      if (shape.label) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        drawLabel(ctx, shape.label, mx, my - 10, color);
      }
      break;
    }
    case "text": {
      ctx.font = `${shape.fontSize ?? 15}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = shape.align || "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(shape.text ?? shape.label ?? ""), x, y);
      break;
    }
    case "path": {
      const pts = shape.points ?? [];
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        if (shape.closed) ctx.closePath();
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 12;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawLabel(ctx, label, x, y, color) {
  if (!label) return;
  ctx.save();
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(5, 8, 7, 0.7)";
  const metrics = ctx.measureText(label);
  const tw = metrics.width + 8;
  const th = 18;
  ctx.fillRect(x - tw / 2, y - th / 2, tw, th);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
  ctx.restore();
}

// ── Document mode ─────────────────────────────────────────────────────────────

function renderDocument(payload) {
  surface.innerHTML = "";

  if (!payload.markdown) {
    const wrap = document.createElement("div");
    wrap.className = "bb-welcome bb-fadein";
    const icon = document.createElement("div");
    icon.className = "bb-welcome-icon";
    icon.textContent = "\uD83D\uDCC4";
    const h2 = document.createElement("h2");
    h2.textContent = "Document";
    const p = document.createElement("p");
    p.textContent = "Rich text and markdown display. Send a document from Augmentor or use the /doc command.";
    const cmds = document.createElement("div");
    cmds.className = "bb-welcome-commands";
    cmds.innerHTML = "<code>/doc</code> \u2014 open document mode<br><code>/doc &lt;markdown&gt;</code> \u2014 render markdown content";
    wrap.appendChild(icon);
    wrap.appendChild(h2);
    wrap.appendChild(p);
    wrap.appendChild(cmds);
    surface.appendChild(wrap);
    return;
  }

  const wrap = document.createElement("div");
  wrap.id = "bb-document-wrap";
  wrap.className = "bb-fadein";

  const content = document.createElement("div");
  content.id = "bb-document-content";
  content.innerHTML = markdownToHtml(payload.markdown);
  wrap.appendChild(content);
  surface.appendChild(wrap);
}

/**
 * Simple markdown-to-HTML converter.
 * Supports: h1-h4, bold, italic, code blocks, inline code, lists, links, hr, blockquote, paragraphs.
 */
function markdownToHtml(md) {
  // Escape HTML entities in a string
  const esc = (s) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Process code blocks first (fence them off)
  const codeBlocks = [];
  let processed = md.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const highlighted = highlightCode(esc(code.trimEnd()), lang.trim());
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${esc(lang.trim())}">${highlighted}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  // Process inline code
  processed = processed.replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`);

  // Split into lines for block-level processing
  const lines = processed.split("\n");
  const output = [];
  let inList = null; // "ul" | "ol" | null

  const flushList = () => {
    if (inList) { output.push(`</${inList}>`); inList = null; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Restore code blocks
    if (/^\x00CODE\d+\x00$/.test(line.trim())) {
      flushList();
      const idx = parseInt(line.trim().replace(/\x00CODE(\d+)\x00/, "$1"), 10);
      output.push(codeBlocks[idx]);
      continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) { flushList(); output.push("<hr>"); continue; }

    // Headings
    const h4 = /^####\s+(.+)/.exec(line);
    const h3 = /^###\s+(.+)/.exec(line);
    const h2 = /^##\s+(.+)/.exec(line);
    const h1 = /^#\s+(.+)/.exec(line);
    if (h4) { flushList(); output.push(`<h4>${inlineMarkdown(h4[1])}</h4>`); continue; }
    if (h3) { flushList(); output.push(`<h3>${inlineMarkdown(h3[1])}</h3>`); continue; }
    if (h2) { flushList(); output.push(`<h2>${inlineMarkdown(h2[1])}</h2>`); continue; }
    if (h1) { flushList(); output.push(`<h1>${inlineMarkdown(h1[1])}</h1>`); continue; }

    // Blockquote
    const bq = /^>\s*(.*)/.exec(line);
    if (bq) { flushList(); output.push(`<blockquote>${inlineMarkdown(bq[1])}</blockquote>`); continue; }

    // Unordered list
    const ul = /^[-*]\s+(.+)/.exec(line);
    if (ul) {
      if (inList !== "ul") { flushList(); output.push("<ul>"); inList = "ul"; }
      output.push(`<li>${inlineMarkdown(ul[1])}</li>`);
      continue;
    }

    // Ordered list
    const ol = /^\d+\.\s+(.+)/.exec(line);
    if (ol) {
      if (inList !== "ol") { flushList(); output.push("<ol>"); inList = "ol"; }
      output.push(`<li>${inlineMarkdown(ol[1])}</li>`);
      continue;
    }

    flushList();

    // Empty line → paragraph break
    if (line.trim() === "") { output.push("<br>"); continue; }

    // Plain paragraph
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  flushList();
  return output.join("\n");
}

function sanitizeUrl(url) {
  const trimmed = String(url ?? "").trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return "#blocked";
  return trimmed;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function inlineMarkdown(text) {
  // Escape HTML entities in raw text before processing markdown
  // We escape first, then apply markdown patterns that produce safe tags
  text = escapeHtml(text);
  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) =>
    `<a href="${sanitizeUrl(u)}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  // Bold+italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return text;
}

function highlightCode(code, lang) {
  // Light syntax highlighting via regex — colors keywords/strings/comments
  if (!lang || lang === "text") return code;

  const keywords = {
    js: /\b(const|let|var|function|return|if|else|for|while|class|import|export|default|new|async|await|try|catch|throw|typeof|instanceof|null|undefined|true|false)\b/g,
    ts: /\b(const|let|var|function|return|if|else|for|while|class|interface|type|import|export|default|new|async|await|try|catch|throw|typeof|null|undefined|true|false|string|number|boolean|void)\b/g,
    py: /\b(def|class|import|from|return|if|elif|else|for|while|in|not|and|or|True|False|None|try|except|finally|with|as|lambda|yield|pass|break|continue)\b/g,
    rs: /\b(fn|let|mut|pub|use|mod|struct|enum|impl|trait|for|while|if|else|match|return|Some|None|true|false|Self|self)\b/g,
    go: /\b(func|var|const|type|struct|interface|import|package|return|if|else|for|range|map|chan|go|defer|select|switch|case|break|continue|nil|true|false)\b/g,
  };

  const strings = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)/g;
  const comments = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g;
  const numbers = /\b(\d+\.?\d*)\b/g;

  // Apply in order: strings, comments, numbers, keywords
  code = code.replace(strings, '<span class="tok-string">$1</span>');
  code = code.replace(comments, '<span class="tok-comment">$1</span>');
  code = code.replace(numbers, '<span class="tok-number">$1</span>');
  const kw = keywords[lang] || keywords.js;
  if (kw) code = code.replace(kw, '<span class="tok-keyword">$1</span>');

  return code;
}

// ── Table mode ────────────────────────────────────────────────────────────────

function renderTable(payload) {
  surface.innerHTML = "";

  if (!payload.headers?.length && !payload.rows?.length) {
    const wrap = document.createElement("div");
    wrap.className = "bb-welcome bb-fadein";
    const icon = document.createElement("div");
    icon.className = "bb-welcome-icon";
    icon.textContent = "\uD83D\uDCCA";
    const h2 = document.createElement("h2");
    h2.textContent = "Table";
    const p = document.createElement("p");
    p.textContent = "Structured data tables with sortable columns. Send tabular data from Augmentor or use the /table command.";
    const cmds = document.createElement("div");
    cmds.className = "bb-welcome-commands";
    cmds.innerHTML = "<code>/table</code> \u2014 open table mode<br><code>/table &lt;data&gt;</code> \u2014 render structured data";
    wrap.appendChild(icon);
    wrap.appendChild(h2);
    wrap.appendChild(p);
    wrap.appendChild(cmds);
    surface.appendChild(wrap);
    return;
  }

  const wrap = document.createElement("div");
  wrap.id = "bb-table-wrap";
  wrap.className = "bb-fadein";

  if (payload.title) {
    const title = document.createElement("div");
    title.id = "bb-table-title";
    title.textContent = payload.title;
    wrap.appendChild(title);
  }

  tableData = { headers: payload.headers ?? [], rows: payload.rows ?? [] };
  sortState = { col: -1, asc: true };

  const container = document.createElement("div");
  container.id = "bb-table-container";
  const table = buildTableElement(tableData.headers, tableData.rows);
  container.appendChild(table);
  wrap.appendChild(container);
  surface.appendChild(wrap);
}

function buildTableElement(headers, rows) {
  const table = document.createElement("table");
  table.id = "bb-data-table";

  // thead
  const thead = document.createElement("thead");
  const hrow = document.createElement("tr");
  headers.forEach((h, idx) => {
    const th = document.createElement("th");
    th.textContent = String(h);
    th.dataset.col = idx;
    if (sortState.col === idx) th.dataset.sort = sortState.asc ? "asc" : "desc";
    th.addEventListener("click", () => sortTable(idx));
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  table.appendChild(thead);

  // tbody
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    (Array.isArray(row) ? row : [row]).forEach((cell) => {
      const td = document.createElement("td");
      const cellStr = String(cell ?? "");
      td.textContent = cellStr;
      // Color-code numbers
      const num = parseFloat(cellStr.replace(/[,$%]/g, ""));
      if (!isNaN(num) && cellStr.trim() !== "") {
        if (num > 0 && /^[+$]?\d/.test(cellStr)) td.classList.add("bb-cell-positive");
        else if (num < 0) td.classList.add("bb-cell-negative");
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function sortTable(colIdx) {
  if (!tableData) return;
  if (sortState.col === colIdx) sortState.asc = !sortState.asc;
  else { sortState.col = colIdx; sortState.asc = true; }

  const sorted = [...tableData.rows].sort((a, b) => {
    const va = String((Array.isArray(a) ? a : [a])[colIdx] ?? "");
    const vb = String((Array.isArray(b) ? b : [b])[colIdx] ?? "");
    const na = parseFloat(va.replace(/[,$%]/g, ""));
    const nb = parseFloat(vb.replace(/[,$%]/g, ""));
    const cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : va.localeCompare(vb);
    return sortState.asc ? cmp : -cmp;
  });

  const container = document.getElementById("bb-table-container");
  if (!container) return;
  container.replaceChildren(buildTableElement(tableData.headers, sorted));
}

// ── Embed mode ────────────────────────────────────────────────────────────────

function renderEmbed(payload) {
  surface.innerHTML = "";

  if (!payload.url) {
    const wrap = document.createElement("div");
    wrap.className = "bb-welcome bb-fadein";
    const icon = document.createElement("div");
    icon.className = "bb-welcome-icon";
    icon.textContent = "\ud83c\udf10";
    const h2 = document.createElement("h2");
    h2.textContent = "Web Embed";
    const p = document.createElement("p");
    p.textContent = "Embed any webpage inside the Blackboard. Send a URL from Augmentor or use the /show command.";
    const cmds = document.createElement("div");
    cmds.className = "bb-welcome-commands";
    cmds.innerHTML = "<code>/show &lt;url&gt;</code> \u2014 embed a webpage";
    wrap.appendChild(icon);
    wrap.appendChild(h2);
    wrap.appendChild(p);
    wrap.appendChild(cmds);
    surface.appendChild(wrap);
    return;
  }

  const wrap = document.createElement("div");
  wrap.id = "bb-embed-wrap";
  wrap.className = "bb-fadein";

  const titlebar = document.createElement("div");
  titlebar.id = "bb-embed-titlebar";
  const urlSpan = document.createElement("span");
  urlSpan.id = "bb-embed-url";
  urlSpan.textContent = payload.url || "(no URL provided)";
  if (payload.title) {
    const titleSpan = document.createElement("strong");
    titleSpan.textContent = payload.title + " — ";
    titlebar.appendChild(titleSpan);
  }
  titlebar.appendChild(urlSpan);
  wrap.appendChild(titlebar);

  if (payload.url) {
    const iframe = document.createElement("iframe");
    iframe.id = "bb-embed-frame";
    iframe.src = payload.url;
    iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";
    iframe.title = payload.title || payload.url;
    iframe.setAttribute("loading", "lazy");
    wrap.appendChild(iframe);
  } else {
    const placeholder = document.createElement("div");
    placeholder.style.cssText = "display:flex;align-items:center;justify-content:center;flex:1;color:var(--muted);font-size:0.9rem;";
    placeholder.textContent = "No URL provided. Use /show <url> to embed a page.";
    wrap.appendChild(placeholder);
  }

  surface.appendChild(wrap);
}

// ── Image mode ────────────────────────────────────────────────────────────────

function renderImage(payload) {
  surface.innerHTML = "";

  // Empty state when no image is provided
  if (!payload.src) {
    const wrap = document.createElement("div");
    wrap.className = "bb-welcome bb-fadein";
    const icon = document.createElement("div");
    icon.className = "bb-welcome-icon";
    icon.textContent = "\uD83D\uDDBC\uFE0F";
    const h2 = document.createElement("h2");
    h2.textContent = "Image Viewer";
    const p = document.createElement("p");
    p.textContent = "Display generated or fetched images. Send an image from Augmentor or use the /image command.";
    const cmds = document.createElement("div");
    cmds.className = "bb-welcome-commands";
    cmds.innerHTML = "<code>/image &lt;url&gt;</code> \u2014 display an image from URL";
    wrap.appendChild(icon);
    wrap.appendChild(h2);
    wrap.appendChild(p);
    wrap.appendChild(cmds);
    surface.appendChild(wrap);
    return;
  }

  const wrap = document.createElement("div");
  wrap.id = "bb-image-wrap";
  wrap.className = "bb-fadein";

  const container = document.createElement("div");
  container.id = "bb-image-container";

  const img = document.createElement("img");
  img.id = "bb-image-el";
  img.src = payload.src;
  img.alt = payload.alt || "";
  container.appendChild(img);

  // Annotation canvas (drawn after image loads)
  const annoCanvas = document.createElement("canvas");
  annoCanvas.id = "bb-annotation-canvas";
  container.appendChild(annoCanvas);

  img.addEventListener("load", () => {
    annoCanvas.width = img.naturalWidth;
    annoCanvas.height = img.naturalHeight;
    annoCanvas.style.width = img.offsetWidth + "px";
    annoCanvas.style.height = img.offsetHeight + "px";
    if (payload.annotations?.length) {
      drawAnnotations(annoCanvas, payload.annotations);
    }
  });

  wrap.appendChild(container);
  surface.appendChild(wrap);
}

function drawAnnotations(canvas, annotations) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  annotations.forEach((ann) => {
    const color = ann.color || "#ffd166";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.font = "14px ui-sans-serif, system-ui, sans-serif";

    switch (ann.type) {
      case "circle":
        ctx.beginPath();
        ctx.arc(ann.x, ann.y, ann.r ?? 20, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "arrow":
        drawArrow(ctx, ann.x1, ann.y1, ann.x2, ann.y2, color);
        break;
      case "label":
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        const m = ctx.measureText(ann.text);
        ctx.fillRect(ann.x - 2, ann.y - 2, m.width + 8, 20);
        ctx.fillStyle = color;
        ctx.fillText(ann.text, ann.x + 2, ann.y);
        break;
    }
  });
}

function renderAnnotations(payload) {
  const canvas = document.getElementById("bb-annotation-canvas");
  if (canvas && payload.annotations?.length) {
    drawAnnotations(canvas, payload.annotations);
    return;
  }
  // Standalone annotate mode — show empty state with instructions
  surface.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "bb-welcome bb-fadein";
  const icon = document.createElement("div");
  icon.className = "bb-welcome-icon";
  icon.textContent = "\u270F\uFE0F";
  const h2 = document.createElement("h2");
  h2.textContent = "Annotate";
  const p = document.createElement("p");
  p.textContent = "Load an image first using the Image tab, then switch to Annotate to draw on top of it.";
  const cmds = document.createElement("div");
  cmds.className = "bb-welcome-commands";
  cmds.innerHTML = "<code>/image &lt;url&gt;</code> \u2014 load an image<br><code>/annotate</code> \u2014 switch to annotation mode";
  wrap.appendChild(icon);
  wrap.appendChild(h2);
  wrap.appendChild(p);
  wrap.appendChild(cmds);
  surface.appendChild(wrap);
}

// ── Present mode ──────────────────────────────────────────────────────────────

function renderPresent(payload) {
  surface.innerHTML = "";
  presentSlides = payload.slides ?? [];
  presentIndex = 0;
  if (!presentSlides.length) {
    const wrap = document.createElement("div");
    wrap.className = "bb-welcome bb-fadein";
    const icon = document.createElement("div");
    icon.className = "bb-welcome-icon";
    icon.textContent = "\ud83c\udfac";
    const h2 = document.createElement("h2");
    h2.textContent = "Slideshow";
    const p = document.createElement("p");
    p.textContent = "Present slides with navigation controls. Send slides from Augmentor or use the /present command.";
    const cmds = document.createElement("div");
    cmds.className = "bb-welcome-commands";
    cmds.innerHTML = "<code>/present</code> \u2014 open slideshow mode<br><code>/present &lt;data&gt;</code> \u2014 render slides";
    wrap.appendChild(icon);
    wrap.appendChild(h2);
    wrap.appendChild(p);
    wrap.appendChild(cmds);
    surface.appendChild(wrap);
    return;
  }

  const wrap = document.createElement("div");
  wrap.id = "bb-present-wrap";
  wrap.className = "bb-fadein";

  const slide = document.createElement("div");
  slide.id = "bb-slide";
  wrap.appendChild(slide);

  const nav = document.createElement("div");
  nav.id = "bb-present-nav";
  nav.innerHTML = `
    <button class="bb-nav-btn" id="bb-prev" title="Previous slide">◀</button>
    <span id="bb-slide-counter"></span>
    <button class="bb-nav-btn" id="bb-next" title="Next slide">▶</button>`;
  wrap.appendChild(nav);

  surface.appendChild(wrap);

  document.getElementById("bb-prev").addEventListener("click", () => {
    if (presentIndex > 0) { presentIndex--; showSlide(presentIndex); }
  });
  document.getElementById("bb-next").addEventListener("click", () => {
    if (presentIndex < presentSlides.length - 1) { presentIndex++; showSlide(presentIndex); }
  });

  // Keyboard navigation
  const keyHandler = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      if (presentIndex < presentSlides.length - 1) { presentIndex++; showSlide(presentIndex); }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      if (presentIndex > 0) { presentIndex--; showSlide(presentIndex); }
    }
  };
  document.addEventListener("keydown", keyHandler);

  showSlide(0);
}

function showSlide(idx) {
  const slides = presentSlides;
  const slide = document.getElementById("bb-slide");
  const counter = document.getElementById("bb-slide-counter");
  const prevBtn = document.getElementById("bb-prev");
  const nextBtn = document.getElementById("bb-next");
  if (!slide || !slides[idx]) return;

  const s = slides[idx];
  slide.innerHTML = "";
  slide.classList.remove("bb-fadein");
  void slide.offsetWidth; // force reflow for animation restart
  slide.classList.add("bb-fadein");

  if (s.title) {
    const title = document.createElement("div");
    title.id = "bb-slide-title";
    title.textContent = s.title;
    slide.appendChild(title);
  }

  if (s.content) {
    const content = document.createElement("div");
    content.id = "bb-slide-content";
    content.innerHTML = markdownToHtml(s.content);
    slide.appendChild(content);
  }

  if (s.image) {
    const img = document.createElement("img");
    img.id = "bb-slide-img";
    img.src = s.image;
    img.alt = s.title || "";
    slide.appendChild(img);
  }

  counter.textContent = `${idx + 1} / ${slides.length}`;
  if (prevBtn) prevBtn.disabled = idx === 0;
  if (nextBtn) nextBtn.disabled = idx === slides.length - 1;
}

// ── Export ────────────────────────────────────────────────────────────────────

function doExport() {
  switch (currentMode) {
    case "canvas": {
      const canvas = document.getElementById("bb-canvas");
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = "blackboard-canvas.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      break;
    }
    case "document": {
      const content = document.getElementById("bb-document-content");
      if (!content) return;
      const blob = new Blob([content.innerHTML], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = "blackboard-document.html";
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      break;
    }
    case "table": {
      if (!tableData) return;
      const rows = [tableData.headers, ...tableData.rows];
      const csv = rows.map((r) => (Array.isArray(r) ? r : [r]).map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = "blackboard-table.csv";
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      break;
    }
    default:
      break;
  }
}

// ── Parse BLACKBOARD markers from AI responses ────────────────────────────────

/**
 * Exported for use by side-panel.js.
 * Scans AI response text for [BLACKBOARD:cmd]...[/BLACKBOARD] markers,
 * sends each to the blackboard, and returns the cleaned text.
 */
window.__bbParseAndSend = function parseBlackboardMarkers(text) {
  const re = /\[BLACKBOARD:(\w+)\]([\s\S]*?)\[\/BLACKBOARD\]/gi;
  let clean = text;
  let match;
  while ((match = re.exec(text)) !== null) {
    const cmd = match[1].toLowerCase();
    const raw = match[2].trim();
    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      // Not JSON — treat as markdown for document command
      if (cmd === "document" || cmd === "doc") payload = { markdown: raw };
    }
    // Send to blackboard tab via background relay
    chrome.runtime.sendMessage({
      channel: "resonantos.blackboard.relay",
      payload: { channel: "resonantos.blackboard", command: cmd, payload }
    }).catch(() => undefined);
    // Remove the marker from displayed text
    clean = clean.replace(match[0], `\n*[Sent to Blackboard — ${cmd}]*\n`);
  }
  return clean;
};

// ── Send Blackboard Content to Augmentor ─────────────────────────────────────

/**
 * captureBlackboardContent — captures the current blackboard content as text/image.
 * Returns { type, content, label } describing what's on the blackboard.
 */
function captureBlackboardContent() {
  switch (currentMode) {
    case "canvas": {
      const canvas = document.getElementById("bb-canvas");
      if (!canvas) return { type: "none", content: "", label: "Empty canvas" };
      try {
        const dataUrl = canvas.toDataURL("image/png");
        return { type: "image", content: dataUrl, label: "Canvas diagram" };
      } catch {
        return { type: "none", content: "", label: "Canvas (could not capture)" };
      }
    }
    case "document": {
      const docEl = surface.querySelector(".bb-document-content, .bb-doc-content, [data-bb-content]");
      const text = docEl ? (docEl.innerText || docEl.textContent || "") : (surface.innerText || "");
      return { type: "text", content: text.trim().slice(0, 8000), label: "Document" };
    }
    case "table": {
      const tableEl = surface.querySelector("table");
      if (!tableEl) return { type: "none", content: "", label: "Empty table" };
      // Convert table to markdown
      const rows = Array.from(tableEl.querySelectorAll("tr"));
      const md = rows.map((row) => {
        const cells = Array.from(row.querySelectorAll("th, td"));
        return "| " + cells.map((c) => (c.textContent || "").trim().replace(/\|/g, "\\|")).join(" | ") + " |";
      });
      // Insert separator after header row
      if (md.length > 1) {
        const cols = Array.from(rows[0].querySelectorAll("th, td")).length;
        md.splice(1, 0, "| " + Array(cols).fill("---").join(" | ") + " |");
      }
      return { type: "text", content: md.join("\n"), label: "Table" };
    }
    case "embed": {
      const iframe = surface.querySelector("iframe");
      const url = iframe?.src || "";
      return { type: "text", content: `Embedded page: ${url}`, label: "Embed" };
    }
    case "present": {
      const slideEl = surface.querySelector(".bb-slide-content, .bb-slide");
      const text = slideEl ? (slideEl.innerText || slideEl.textContent || "") : "";
      return { type: "text", content: `Slide ${presentIndex + 1}/${presentSlides.length}: ${text.trim().slice(0, 4000)}`, label: "Presentation" };
    }
    default: {
      const text = surface.innerText || "";
      if (!text.trim()) return { type: "none", content: "", label: "Blackboard is empty" };
      return { type: "text", content: text.trim().slice(0, 8000), label: "Blackboard content" };
    }
  }
}

/**
 * sendBlackboardToAugmentor — captures current blackboard content and sends
 * it to the side panel via the background relay, injecting it as user context.
 */
function sendBlackboardToAugmentor() {
  if (!sendToAugmentorBtn) return;

  const captured = captureBlackboardContent();
  if (captured.type === "none" || !captured.content) {
    sendToAugmentorBtn.textContent = "Nothing to send";
    setTimeout(() => { sendToAugmentorBtn.textContent = "Send to Augmentor ◈"; }, 2000);
    return;
  }

  sendToAugmentorBtn.disabled = true;
  sendToAugmentorBtn.textContent = "Sending…";

  chrome.runtime.sendMessage({
    channel: "resonantos.blackboard.to_panel",
    payload: {
      type: captured.type,
      content: captured.content,
      label: captured.label,
      mode: currentMode,
      timestamp: new Date().toISOString(),
    }
  }).then(() => {
    sendToAugmentorBtn.textContent = "Sent ✓";
    setTimeout(() => {
      sendToAugmentorBtn.disabled = false;
      sendToAugmentorBtn.textContent = "Send to Augmentor ◈";
    }, 2000);
  }).catch((err) => {
    console.warn("[Blackboard] sendToAugmentor failed:", err);
    sendToAugmentorBtn.disabled = false;
    sendToAugmentorBtn.textContent = "Failed — retry";
    setTimeout(() => { sendToAugmentorBtn.textContent = "Send to Augmentor ◈"; }, 2500);
  });
}
