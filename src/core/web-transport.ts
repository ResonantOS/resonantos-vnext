/**
 * Web-mode transport layer. Replaces Tauri invoke() for browser deployments.
 * Activated when VITE_API_BASE env var is set and Tauri is not present.
 */

import { getPi5Config } from "./config";

const { httpApiBase } = getPi5Config();
export const API_BASE = import.meta.env.VITE_API_BASE ?? httpApiBase;

export const isWebMode = (): boolean =>
  typeof window !== "undefined" &&
  !("__TAURI_INTERNALS__" in window) &&
  Boolean(API_BASE);

let _authToken: string | null = null;
export const setWebAuthToken = (token: string) => { _authToken = token; };
export const getWebAuthToken = (): string | null => _authToken;

export async function webInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!API_BASE) throw new Error("VITE_API_BASE not configured");
  const token = _authToken ?? localStorage.getItem("ros_api_token");

  const res = await fetch(`${API_BASE}/invoke/${command}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(args ?? {}),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Create a WebSocket connection to the server-side CamoFox stream.
 * Returns a handle with send() for commands and onFrame() for JPEG frames.
 */
export function createBrowserStream(sessionId: string, onFrame: (jpeg: ArrayBuffer) => void) {
  const wsBase = API_BASE!.replace(/^https?/, (m: string) => (m === "https" ? "wss" : "ws"));
  const token = _authToken ?? localStorage.getItem("ros_api_token");
  const ws = new WebSocket(`${wsBase}/ws/screen/${sessionId}?token=${token}`);
  ws.binaryType = "arraybuffer";
  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      onFrame(event.data);
    }
  };
  return {
    ws,
    sendClick: (x: number, y: number) =>
      ws.send(JSON.stringify({ type: "click", x, y })),
    sendType: (text: string) =>
      ws.send(JSON.stringify({ type: "type", text })),
    sendScroll: (deltaX: number, deltaY: number) =>
      ws.send(JSON.stringify({ type: "scroll", deltaX, deltaY })),
    sendNavigate: (url: string) =>
      ws.send(JSON.stringify({ type: "navigate", url })),
    close: () => ws.close(),
  };
}
