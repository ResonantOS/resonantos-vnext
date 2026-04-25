// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// UX citation: docs/architecture/ADR-004-chat-rail.md

import { useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { ChannelDefinition, ConversationMessage, ConversationThread } from "../../core/contracts";
import { MessageContent } from "./MessageContent";
import {
  ArchiveIcon,
  BranchIcon,
  CopyIcon,
  EditIcon,
  HideIcon,
  HistoryIcon,
  MicIcon,
  MoreIcon,
  PinIcon,
  PlusIcon,
  RegenerateIcon,
  SendIcon,
  StatsIcon,
  StopIcon,
  TrashIcon,
} from "./icons";
import type { ComposerAttachment, ThinkingDepth } from "./types";
import { formatBytes } from "./utils";

type StrategistChatRailProps = {
  isOpen: boolean;
  mode: "strategist" | "emergency";
  title: string;
  eyebrow: string;
  description: string;
  activeThread: ConversationThread | null;
  strategistThreads: ConversationThread[];
  pinnedThreadIds: string[];
  availableAgents: Array<{
    id: string;
    displayName: string;
    shortLabel: string;
  }>;
  activeAgentId: string;
  channels: ChannelDefinition[];
  chatBusy: boolean;
  chatCanStop: boolean;
  chatSupportsAbort: boolean;
  chatNotice: string | null;
  composer: string;
  attachments: ComposerAttachment[];
  dictating: boolean;
  dictationAvailable: boolean;
  activeChatModel: string;
  availableModels: string[];
  showGenerationStats: boolean;
  thinkingDepth: ThinkingDepth;
  contextUsageLabel: string;
  contextUsageRatio: number;
  contextUsageTitle: string;
  activityLabel: string;
  recoveryRuntimeStatus?: {
    activeRouteLabel: string;
    activeModel: string;
    targetModel: string;
    available: boolean;
    installed: boolean;
    running: boolean;
    runningModels: string[];
  } | null;
  chatScrollAnchorRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onCreateNewChat: () => void;
  onToggleSidebar: () => void;
  onSetActiveThread: (threadId: string) => void;
  onTogglePinnedThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onBranchThread: (threadId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onComposerChange: (value: string) => void;
  onSend: () => void;
  onStopGeneration: () => void;
  onCompactThread: () => void;
  onSaveMessageToArchive: (message: ConversationMessage) => void;
  onBranchFromMessage: (message: ConversationMessage) => void;
  onEditUserMessage: (message: ConversationMessage) => void;
  onDeleteMessage: (message: ConversationMessage) => void;
  onToggleDictation: () => void;
  onModelChange: (value: string) => void;
  onThinkingDepthChange: (value: ThinkingDepth) => void;
  onFileAttach: (files: FileList | null) => void | Promise<void>;
  onRemoveAttachment: (attachmentId: string) => void;
  onStartResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function StrategistChatRail(props: StrategistChatRailProps) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
  const copyMessage = (message: ConversationMessage) => {
    void navigator.clipboard?.writeText(message.content);
  };
  const pinnedThreadIds = new Set(props.pinnedThreadIds);
  const pinnedThreads = props.strategistThreads.filter((thread) => pinnedThreadIds.has(thread.id));
  const recentThreads = props.strategistThreads.filter((thread) => !pinnedThreadIds.has(thread.id));
  const renderHistoryThread = (thread: ConversationThread) => {
    const channel = props.channels.find((item) => item.id === thread.channelId);
    const isPinned = pinnedThreadIds.has(thread.id);

    return (
      <div key={thread.id} className={`chat-history-row ${props.activeThread?.id === thread.id ? "active" : ""}`}>
        <button type="button" className="chat-history-thread" onClick={() => props.onSetActiveThread(thread.id)}>
          <strong>{thread.title}</strong>
          <span>{channel?.label ?? thread.channelId}</span>
        </button>
        <div className="chat-history-menu-anchor">
          <button
            type="button"
            className="chat-history-menu-trigger"
            aria-label="Chat options"
            title="Chat options"
            onClick={() => setOpenThreadMenuId((current) => (current === thread.id ? null : thread.id))}
          >
            <MoreIcon />
          </button>
          {openThreadMenuId === thread.id && (
            <div className="chat-history-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  props.onTogglePinnedThread(thread.id);
                  setOpenThreadMenuId(null);
                }}
              >
                <PinIcon />
                {isPinned ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  props.onBranchThread(thread.id);
                  setOpenThreadMenuId(null);
                }}
              >
                <BranchIcon />
                Branch
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  props.onDeleteThread(thread.id);
                  setOpenThreadMenuId(null);
                }}
              >
                <TrashIcon />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!props.isOpen) {
    return (
      <aside className={`chat-sidebar closed ${props.mode === "emergency" ? "emergency" : ""}`}>
        <button type="button" className="chat-collapsed-toggle" onClick={props.onToggleSidebar}>
          Chat
        </button>
      </aside>
    );
  }

  return (
    <aside className={`chat-sidebar open ${props.mode === "emergency" ? "emergency" : ""}`}>
      <div className="chat-resize-handle" role="separator" aria-label="Resize chat rail" onPointerDown={props.onStartResize} />
      <div className="chat-agent-strip" aria-label="Agent selector">
        {props.availableAgents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className={`chat-agent-chip ${props.activeAgentId === agent.id ? "active" : ""}`}
            aria-label={`Talk with ${agent.displayName}`}
            title={agent.displayName}
            onClick={() => props.onSelectAgent(agent.id)}
          >
            {agent.shortLabel}
          </button>
        ))}
      </div>
      <div className="chat-sidebar-header">
        <div className="chat-header-actions">
          <button
            type="button"
            className={`chat-icon-button ${historyOpen ? "active" : ""}`}
            aria-label={historyOpen ? "Hide chat history" : "Show chat history"}
            title={historyOpen ? "Hide chat history" : "Show chat history"}
            onClick={() => setHistoryOpen((current) => !current)}
          >
            <HistoryIcon />
          </button>
          {props.mode !== "emergency" && (
            <button type="button" className="chat-icon-button prominent" aria-label="New chat" title="New chat" onClick={props.onCreateNewChat}>
              <PlusIcon />
            </button>
          )}
          <button type="button" className="chat-icon-button" aria-label="Hide chat rail" title="Hide chat rail" onClick={props.onToggleSidebar}>
            <HideIcon />
          </button>
        </div>
      </div>

      {props.mode === "emergency" && (
        <>
          <div className="recovery-playbook">
            <div className="recovery-step">
              <strong>Recovery chat</strong>
              <span>Use the center dashboard for route candidates, checklist state, diagnostics, and the recovery log.</span>
            </div>
            <div className="recovery-step">
              <strong>Current route</strong>
              <span>
                {props.recoveryRuntimeStatus
                  ? `${props.recoveryRuntimeStatus.activeModel} via ${props.recoveryRuntimeStatus.activeRouteLabel}`
                  : "Awaiting recovery runtime status"}
              </span>
            </div>
          </div>
        </>
      )}

      {props.chatBusy && (
        <div className="agent-activity-rail live" aria-live="polite">
          <span className="agent-activity-pulse" />
          <div>
            <strong>Working</strong>
            <p>{props.activityLabel}</p>
          </div>
        </div>
      )}

      <div className={`chat-workspace ${historyOpen ? "history-open" : "history-closed"}`}>
        {historyOpen && (
          <aside className="chat-history-panel" aria-label="Chat history">
            {pinnedThreads.length > 0 && (
              <section>
                <span>Pinned</span>
                {pinnedThreads.map(renderHistoryThread)}
              </section>
            )}
            <section>
              <span>History</span>
              {recentThreads.map(renderHistoryThread)}
            </section>
          </aside>
        )}

        <div className="chat-conversation">
          <div className="message-stack">
            {props.activeThread?.messages.map((message) => (
              <article
                key={message.id}
                className={`message-bubble ${message.role === "assistant" ? "assistant" : "user"} ${message.status === "interrupted" ? "interrupted" : ""} ${
                  message.status === "failed" ? "failed" : ""
                }`}
              >
            <div className="message-meta">
              <strong>{message.author}</strong>
              <span>
                {message.status === "interrupted" ? "Interrupted · " : ""}
                {message.status === "failed" ? "Failed · " : ""}
                {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <MessageContent content={message.content} />
            {message.archiveCitations?.length ? (
              <div className="archive-citations" aria-label="Living Archive citations">
                <span>Archive memory</span>
                {message.archiveCitations.map((citation) => (
                  <button key={`${message.id}:${citation.path}`} type="button" title={citation.path}>
                    {citation.title}
                    <small>{citation.pageType}</small>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="message-actions" aria-label={`${message.role} message actions`}>
              <button type="button" className="message-action-button" aria-label="Copy message" title="Copy message" onClick={() => copyMessage(message)}>
                <CopyIcon />
              </button>
              <button type="button" className="message-action-button" aria-label="Branch chat after this message" title="Branch chat after this message" onClick={() => props.onBranchFromMessage(message)}>
                <BranchIcon />
              </button>
              {message.role === "user" ? (
                <button type="button" className="message-action-button" aria-label="Edit message" title="Edit message" onClick={() => props.onEditUserMessage(message)}>
                  <EditIcon />
                </button>
              ) : null}
              {props.mode === "strategist" && message.role === "assistant" ? (
                <>
                  <button
                    type="button"
                    className="message-action-button"
                    aria-label="Save message to Living Archive"
                    title="Save message to Living Archive"
                    onClick={() => props.onSaveMessageToArchive(message)}
                  >
                    <ArchiveIcon />
                  </button>
                  <button type="button" className="message-action-button" aria-label="Regenerate message" title="Regenerate message: pending regeneration controller wiring.">
                    <RegenerateIcon />
                  </button>
                  {props.showGenerationStats ? (
                    <button
                      type="button"
                      className="message-action-button"
                      aria-label="Generation stats"
                      title="Generation stats: local-runtime telemetry is not recorded for this message yet."
                    >
                      <StatsIcon />
                    </button>
                  ) : null}
                </>
              ) : null}
              <button type="button" className="message-action-button danger" aria-label="Delete message" title="Delete message" onClick={() => props.onDeleteMessage(message)}>
                <TrashIcon />
              </button>
            </div>
              </article>
            ))}
            <div ref={props.chatScrollAnchorRef} />
          </div>

          <div className="composer-card">
        {props.chatNotice && <div className="inline-notice warning">{props.chatNotice}</div>}
        <textarea
          value={props.composer}
          onChange={(event) => props.onComposerChange(event.target.value)}
          placeholder={`Message ${props.title}`}
          rows={4}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              props.onSend();
            }
          }}
        />
        <div className="chat-toolbar">
          <div className="chat-toolbar-main">
            <button
              type="button"
              className="chat-icon-button"
              aria-label="Attach file"
              title="Attach file"
              onClick={() => props.fileInputRef.current?.click()}
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              className={`context-pill ${props.contextUsageRatio > 0.72 ? "warning" : ""}`}
              title={props.contextUsageTitle}
              aria-label={`Context usage ${props.contextUsageLabel}. Compact now.`}
              onClick={props.onCompactThread}
            >
              <strong>{props.contextUsageLabel}</strong>
            </button>
            <input
              ref={props.fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => void props.onFileAttach(event.target.files)}
            />
          </div>
          <div className="chat-toolbar-selects">
            <div className="chat-control compact">
              <select
                aria-label="Model and reasoning profile"
                title="Model route. Reasoning controls are shown only when model capability metadata exists."
                value={props.activeChatModel}
                onChange={(event) => props.onModelChange(event.target.value)}
              >
                {props.availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className={`chat-icon-button ${props.dictating ? "is-live" : ""}`}
            aria-label={props.dictating ? "Stop dictation" : "Start dictation"}
            title={
              props.dictationAvailable
                ? props.dictating
                  ? "Stop dictation"
                  : "Start dictation"
                : "Audio dictate is not available in the desktop runtime yet."
            }
            onClick={props.onToggleDictation}
            disabled={!props.dictationAvailable}
          >
            <MicIcon />
          </button>
          {props.chatBusy ? (
            <button
              type="button"
              className="chat-stop-button"
              aria-label="Stop response"
              title={
                props.chatSupportsAbort
                  ? "Stop response, request provider cancellation, and keep the interrupted partial message"
                  : "Stop response locally and keep the interrupted partial message"
              }
              onClick={props.onStopGeneration}
              disabled={!props.chatCanStop}
            >
              <StopIcon />
            </button>
          ) : (
            <button type="button" className="chat-send-button" aria-label="Send message" title="Send message" onClick={props.onSend}>
              <SendIcon />
            </button>
          )}
        </div>
        {props.attachments.length > 0 && (
          <div className="attachment-strip">
            {props.attachments.map((attachment) => (
              <div key={attachment.id} className="attachment-chip">
                <div>
                  <strong>{attachment.name}</strong>
                  <span>
                    {formatBytes(attachment.size)} · {attachment.previewState === "embedded" ? "embedded" : "metadata"}
                  </span>
                </div>
                <button type="button" onClick={() => props.onRemoveAttachment(attachment.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
          </div>
        </div>
      </div>
    </aside>
  );
}
