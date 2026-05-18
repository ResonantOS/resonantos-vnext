/**
 * TokenGate — Auth wall for web/cloud deployments.
 * Shown when VITE_API_BASE is set (web mode) and no token is stored in localStorage.
 */
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { setWebAuthToken } from "../core/web-transport";

const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;

interface TokenGateProps {
  onConnected: () => void;
}

export function TokenGate({ onConnected }: TokenGateProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleConnect = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Please enter your access token.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/invoke/local_runtime_status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${trimmed}`,
        },
        body: "{}",
      });
      if (res.status === 401) {
        setError("Invalid access token. Please check and try again.");
        setBusy(false);
        return;
      }
      if (!res.ok) {
        setError(`Server error ${res.status}. Please try again.`);
        setBusy(false);
        return;
      }
      // Token accepted — persist and dismiss gate
      localStorage.setItem("ros_api_token", trimmed);
      setWebAuthToken(trimmed);
      onConnected();
    } catch {
      setError("Connection failed. Check your network and try again.");
      setBusy(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void handleConnect();
  };

  return (
    <div className="token-gate-backdrop">
      <div className="token-gate-card">
        <span className="eyebrow">ResonantOS Cloud</span>
        <h1>Connect to Augmentor</h1>
        <p className="token-gate-desc">
          Enter your access token to connect to the ResonantOS cloud service.
        </p>
        <div className="token-gate-form">
          <input
            type="password"
            className="token-gate-input"
            placeholder="Access token"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="button-primary touch-action"
            onClick={() => void handleConnect()}
            disabled={busy || !token.trim()}
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
        {error && <p className="token-gate-error">{error}</p>}
        <p className="token-gate-hint">
          Your token is stored locally in this browser and used to authenticate requests.
        </p>
      </div>
    </div>
  );
}
