export function setStatus(node, message, tone = "") {
  node.textContent = message;
  node.dataset.tone = tone;
}

export function settingsHeader({ eyebrow, title, body }) {
  const header = document.createElement("header");
  header.className = "settings-section-header";
  header.innerHTML = `
    <span class="module-eyebrow"></span>
    <h1></h1>
    <p></p>
  `;
  header.querySelector(".module-eyebrow").textContent = eyebrow;
  header.querySelector("h1").textContent = title;
  header.querySelector("p").textContent = body;
  return header;
}

export function noteCard({ title, body, tone = "" }) {
  const note = document.createElement("section");
  note.className = "settings-note";
  if (tone) note.dataset.tone = tone;
  const heading = document.createElement("strong");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = body;
  note.append(heading, copy);
  return note;
}

export function metricCard({ label, value, detail = "", tone = "" }) {
  const card = document.createElement("article");
  card.className = "settings-health-card";
  if (tone) card.dataset.tone = tone;
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const valueNode = document.createElement("strong");
  valueNode.textContent = value;
  const detailNode = document.createElement("p");
  detailNode.textContent = detail;
  card.append(labelNode, valueNode, detailNode);
  return card;
}

export function safeCount(list) {
  return Array.isArray(list) ? list.length : 0;
}

export function safeErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted-key]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted-token]")
    .replace(/api[_-]?key\s*[:=]\s*[^\s]+/gi, "api_key=[redacted]")
    .replace(/token\s*[:=]\s*[^\s]+/gi, "token=[redacted]")
    .replace(/secret\s*[:=]\s*[^\s]+/gi, "secret=[redacted]");
}
