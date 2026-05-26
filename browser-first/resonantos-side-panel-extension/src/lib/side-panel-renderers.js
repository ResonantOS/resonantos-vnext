export const ACTION_ICONS = {
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M6 7v13h12V7"/><path d="M9 11h6"/><path d="M9 15h6"/><path d="M8 4h8l2 3H6l2-3Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8.5A2.5 2.5 0 0 1 10.5 6h7A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 8 15.5v-7Z"/><path d="M5.5 14A2.5 2.5 0 0 1 3 11.5v-7A2.5 2.5 0 0 1 5.5 2h7A2.5 2.5 0 0 1 15 4.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  fork: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v5a4 4 0 0 0 4 4h4"/><path d="M18 4v16"/><path d="m14 9 4 4-4 4"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="18" cy="20" r="2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/></svg>',
  stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-4"/></svg>',
  delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>'
};

export function messageLabel(role) {
  if (role === "user") return "You";
  if (role === "system") return "System";
  return "Augmentor";
}

export function createSidePanelRenderers({
  attachmentStrip,
  transcript,
  getAttachments,
  getMessages,
  onRemoveAttachment,
  onCopyMessage,
  onDeleteMessage,
  onEditMessage,
  onForkMessage,
  onRegenerateMessage,
  onSaveMessageToArchive,
  onShowMessageStats,
  scrollTranscriptToBottom,
  window
}) {
  function actionButton(action, label, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "message-action";
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.title = title;
    button.innerHTML = ACTION_ICONS[action];
    button.addEventListener("click", onClick);
    return button;
  }

  function renderAttachments() {
    const attachments = getAttachments();
    attachmentStrip.replaceChildren();
    attachmentStrip.hidden = attachments.length === 0;
    attachments.forEach((attachment) => {
      const chip = document.createElement("span");
      chip.className = "attachment-chip";
      const label = document.createElement("strong");
      label.textContent = attachment.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "x";
      remove.title = `Remove ${attachment.name}`;
      remove.addEventListener("click", () => void onRemoveAttachment(attachment.id));
      chip.append(label, remove);
      attachmentStrip.append(chip);
    });
  }

  function renderMessages() {
    transcript.replaceChildren();
    getMessages().forEach((message) => {
      const article = document.createElement("article");
      article.className = `message ${message.role}`;
      article.dataset.messageId = message.id;

      const header = document.createElement("div");
      header.className = "message-header";
      const strong = document.createElement("strong");
      strong.textContent = messageLabel(message.role);
      const time = document.createElement("time");
      time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      header.append(strong, time);

      const paragraph = document.createElement("p");
      paragraph.textContent = message.content;

      const actions = document.createElement("div");
      actions.className = "message-actions";
      actions.append(actionButton("copy", "Copy", "Copy this message", () => void onCopyMessage(message.id)));
      actions.append(actionButton("fork", "Fork", "Fork the conversation up to this message", () => void onForkMessage(message.id)));
      if (message.role === "user") {
        actions.append(actionButton("edit", "Edit", "Edit this message in the composer", () => onEditMessage(message.id)));
      }
      if (message.role === "assistant") {
        actions.append(actionButton("archive", "Save to Living Archive", "Save this message to Living Archive intake", () => void onSaveMessageToArchive(message.id)));
        actions.append(actionButton("refresh", "Regenerate", "Regenerate from the previous user message", () => void onRegenerateMessage(message.id)));
        if (message.usage) {
          actions.append(actionButton("stats", "Stats", "Show generation stats", () => void onShowMessageStats(message.id)));
        }
      }
      actions.append(actionButton("delete", "Delete", "Delete this message", () => void onDeleteMessage(message.id)));

      article.append(header, paragraph, actions);
      transcript.append(article);
    });
    scrollTranscriptToBottom();
  }

  function flashCopied(id) {
    const escapedId = window.CSS?.escape ? window.CSS.escape(id) : String(id).replace(/["\\]/g, "\\$&");
    const button = transcript.querySelector(`[data-message-id="${escapedId}"] .message-action[data-action="copy"]`);
    if (!button) return;
    button.innerHTML = ACTION_ICONS.check;
    window.setTimeout(() => {
      button.innerHTML = ACTION_ICONS.copy;
    }, 1400);
  }

  return {
    flashCopied,
    renderAttachments,
    renderMessages
  };
}
