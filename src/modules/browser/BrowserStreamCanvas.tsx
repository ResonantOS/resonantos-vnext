import { useEffect, useRef, useState, useCallback } from "react";
import { createBrowserStream } from "../../core/web-transport";

type Props = {
  sessionId: string;
  width?: number;
  height?: number;
};

export function BrowserStreamCanvas({ sessionId, width = 1280, height = 800 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<ReturnType<typeof createBrowserStream> | null>(null);
  const [connected, setConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const fpsCountRef = useRef(0);

  useEffect(() => {
    const stream = createBrowserStream(sessionId, async (jpegData: ArrayBuffer) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const blob = new Blob([jpegData], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        fpsCountRef.current++;
      };
      img.src = url;
    });

    stream.ws.onopen = () => {
      setConnected(true);
      stream.ws.send(JSON.stringify({ type: "start" }));
    };
    stream.ws.onclose = () => setConnected(false);
    streamRef.current = stream;

    // FPS counter
    const fpsInterval = setInterval(() => {
      setFps(fpsCountRef.current);
      fpsCountRef.current = 0;
    }, 1000);

    return () => {
      clearInterval(fpsInterval);
      stream.close();
      streamRef.current = null;
    };
  }, [sessionId]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !streamRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    streamRef.current.sendClick(x, y);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!streamRef.current) return;
    if (e.key.length === 1) {
      streamRef.current.sendType(e.key);
    }
    e.preventDefault();
  }, []);

  return (
    <div className="browser-stream-container" style={{ position: "relative" }}>
      <div
        className="stream-status"
        style={{
          padding: "4px 8px",
          fontSize: "12px",
          background: connected ? "#1a3a1a" : "#3a1a1a",
          color: connected ? "#4ade80" : "#f87171",
          borderRadius: "4px",
          marginBottom: "4px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span>{connected ? `🟢 Live — ${fps} FPS` : "🔴 Disconnected"}</span>
        <span
          style={{
            background: "#2563eb",
            color: "white",
            padding: "2px 6px",
            borderRadius: "3px",
            fontSize: "11px",
          }}
        >
          ☁️ CLOUD MODE
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{
          cursor: "crosshair",
          outline: "none",
          maxWidth: "100%",
          display: "block",
          border: "1px solid #333",
          borderRadius: "4px",
        }}
      />
    </div>
  );
}
