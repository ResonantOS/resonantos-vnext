/**
 * Process entry point — starts the HTTP server with graceful shutdown.
 */
import { createApp } from "./app";
import { runMigrations } from "./db/migrate";
import { closeDb } from "./db/connection";

const PORT = parseInt(process.env.PORT ?? "5100", 10);

async function main(): Promise<void> {
  // Run schema migrations on startup (idempotent)
  runMigrations();

  const app = createApp();

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[ros-server] Listening on 127.0.0.1:${PORT}`);
    console.log(`[ros-server] NODE_ENV=${process.env.NODE_ENV ?? "development"}`);
  });

  // ─── Graceful Shutdown ────────────────────────────────────────────────────

  const shutdown = (signal: string) => {
    console.log(`[ros-server] Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      closeDb();
      console.log("[ros-server] Server closed. Exiting.");
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error("[ros-server] Graceful shutdown timed out. Force exit.");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ─── Unhandled Errors ─────────────────────────────────────────────────────
  // CRITICAL: never log the full error object — it may contain the API key (F-01, F-02)
  process.on("uncaughtException", (err) => {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    console.error("[ros-server] Uncaught exception:", err.message, code);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const code =
      reason instanceof Error && "code" in reason
        ? (reason as NodeJS.ErrnoException).code
        : "";
    console.error("[ros-server] Unhandled rejection:", message, code ?? "");
  });
}

main().catch((err: Error) => {
  // Only log message — not the full error object (may contain API key)
  console.error("[ros-server] Fatal startup error:", err.message);
  process.exit(1);
});
