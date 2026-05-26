// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md
// Intent citation: docs/architecture/ADR-009-rust-service-ipc-boundary.md

import { useEffect, useState } from "react";
import type { AddOnInstallation, CapabilityGrant, TelegramServiceStatus } from "../../core/contracts";
import { requestTelegramServiceStatus, saveTelegramBotToken, startTelegramService, stopTelegramService } from "../../core/runtime";

type TelegramAddonPanelProps = {
  installation: AddOnInstallation;
  requestedCapabilities: CapabilityGrant[];
  onGrantCapabilities: (
    capabilities: CapabilityGrant["capability"][],
    requestedCapabilities: CapabilityGrant[],
  ) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
};

const hasGrant = (installation: AddOnInstallation, capability: CapabilityGrant["capability"]): boolean =>
  installation.grantedCapabilities.some((grant) => grant.capability === capability && grant.granted);

const configuredAllowedChats = (installation: AddOnInstallation): string =>
  Array.isArray(installation.config?.allowedChatIds) ? installation.config.allowedChatIds.join(", ") : "";

const parseAllowedChats = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export function TelegramAddonPanel({
  installation,
  requestedCapabilities,
  onGrantCapabilities,
  onConfigChange,
}: TelegramAddonPanelProps) {
  const [status, setStatus] = useState<TelegramServiceStatus | null>(null);
  const [botToken, setBotToken] = useState("");
  const [allowedChats, setAllowedChats] = useState(configuredAllowedChats(installation));
  const [preferredModel, setPreferredModel] = useState(String(installation.config?.preferredModel ?? ""));
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const ready =
    installation.enabled &&
    hasGrant(installation, "network") &&
    hasGrant(installation, "providers") &&
    hasGrant(installation, "notifications");

  const refreshStatus = async () => {
    setStatus(await requestTelegramServiceStatus("telegram-primary"));
  };

  useEffect(() => {
    void refreshStatus().catch((statusError) => {
      setError(statusError instanceof Error ? statusError.message : "Failed to read Telegram service status.");
    });
  }, []);

  const persistConfig = (nextAllowedChats = allowedChats, nextPreferredModel = preferredModel) => {
    onConfigChange({
      ...(installation.config ?? {}),
      channelId: "telegram-primary",
      allowedChatIds: parseAllowedChats(nextAllowedChats),
      preferredModel: nextPreferredModel.trim() || undefined,
    });
  };

  const saveToken = async () => {
    setBusyLabel("Saving token");
    setError("");
    try {
      await saveTelegramBotToken(botToken);
      setBotToken("");
      await refreshStatus();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save Telegram bot token.");
    } finally {
      setBusyLabel("");
    }
  };

  const start = async () => {
    setBusyLabel("Starting Telegram channel");
    setError("");
    try {
      persistConfig();
      setStatus(
        await startTelegramService({
          channelId: "telegram-primary",
          allowedChatIds: parseAllowedChats(allowedChats),
          preferredModel: preferredModel.trim() || undefined,
        }),
      );
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Failed to start Telegram channel.");
    } finally {
      setBusyLabel("");
    }
  };

  const stop = async () => {
    setBusyLabel("Stopping Telegram channel");
    setError("");
    try {
      setStatus(await stopTelegramService("telegram-primary"));
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "Failed to stop Telegram channel.");
    } finally {
      setBusyLabel("");
    }
  };

  return (
    <section className="telegram-addon-panel" aria-label="Telegram channel bridge">
      <div className="addon-service-hero">
        <div>
          <span className="eyebrow">Channel bridge</span>
          <h3>Talk with Augmentor from Telegram</h3>
          <p>
            Telegram messages are routed through the same Augmentor identity and mirrored into the local ResonantOS
            chat history. Text is live now; audio files are saved locally and handed to Augmentor as protected intake
            metadata until a transcription provider is configured.
          </p>
        </div>
        <span className={`tone tone-${status?.running ? "active" : "neutral"}`}>
          {status?.running ? "running" : "stopped"}
        </span>
      </div>

      {!ready && (
        <div className="bundle-card">
          <span className="eyebrow">Required grants</span>
          <p>Telegram needs network, providers, and notifications before the host can start the polling service.</p>
          <button
            type="button"
            className="button-primary"
            onClick={() => onGrantCapabilities(["network", "providers", "notifications"], requestedCapabilities)}
          >
            Grant Telegram channel access
          </button>
        </div>
      )}

      <div className="detail-grid">
        <label className="detail-card field-card">
          <span className="eyebrow">Bot token</span>
          <input
            type="password"
            value={botToken}
            onChange={(event) => setBotToken(event.target.value)}
            placeholder={status?.tokenConfigured ? "Token configured" : "Paste Telegram bot token"}
          />
          <button type="button" className="button-secondary" onClick={() => void saveToken()} disabled={!botToken.trim()}>
            Save token
          </button>
        </label>

        <label className="detail-card field-card">
          <span className="eyebrow">Allowed chat IDs</span>
          <input
            value={allowedChats}
            onChange={(event) => {
              setAllowedChats(event.target.value);
              persistConfig(event.target.value, preferredModel);
            }}
            placeholder="Optional comma-separated chat IDs"
          />
          <p>Leave empty for local testing; restrict this before public use.</p>
        </label>

        <label className="detail-card field-card">
          <span className="eyebrow">Preferred model</span>
          <input
            value={preferredModel}
            onChange={(event) => {
              setPreferredModel(event.target.value);
              persistConfig(allowedChats, event.target.value);
            }}
            placeholder="Optional model override"
          />
          <p>Blank uses the Strategist model strategy and fallback chain.</p>
        </label>

        <div className="detail-card">
          <span className="eyebrow">Service state</span>
          <ul>
            <li>Token: {status?.tokenConfigured ? "configured" : "missing"}</li>
            <li>Channel: {status?.channelId ?? "telegram-primary"}</li>
            <li>Last update: {status?.lastUpdateId ?? "none"}</li>
            <li>Started: {status?.startedAt ?? "not running"}</li>
          </ul>
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className="button-primary" onClick={() => void start()} disabled={!ready || !status?.tokenConfigured || status.running}>
          Start Telegram channel
        </button>
        <button type="button" className="button-secondary" onClick={() => void stop()} disabled={!status?.running}>
          Stop
        </button>
        <button type="button" className="button-secondary" onClick={() => void refreshStatus()}>
          Refresh
        </button>
        {busyLabel ? <span className="muted-copy">{busyLabel}</span> : null}
      </div>

      {(error || status?.lastError) && <p className="error-copy">{error || status?.lastError}</p>}
    </section>
  );
}
