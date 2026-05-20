/**
 * Express app factory.
 * All middleware, routes, and error handlers configured here.
 */
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { apiLimiter } from "./middleware/rateLimitIp";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRouter from "./routes/auth";
import chatRouter from "./routes/chat";
import invokeRouter from "./routes/invoke";
import { getDb } from "./db/connection";

export function createApp(): express.Application {
  const app = express();

  // ─── Startup Validation ────────────────────────────────────────────────────
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 bytes. Generate with: openssl rand -hex 32"
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }

  // ─── Security Headers (Helmet) ────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          connectSrc: ["'self'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
    })
  );

  // ─── CORS ────────────────────────────────────────────────────────────────
  const allowedOrigin =
    process.env.ALLOWED_ORIGIN ??
    (process.env.NODE_ENV === "production"
      ? "https://resonantclaw.com"
      : "http://localhost:1430");

  app.use(
    cors({
      origin: allowedOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false, // Using Bearer token, not cookies
    })
  );

  // ─── Body Parsing (size limit prevents DoS — F-21) ─────────────────────────
  app.use(express.json({ limit: "512kb" }));

  // ─── General Rate Limiter ──────────────────────────────────────────────────
  app.use(apiLimiter);

  // ─── Health Check (no auth required) ──────────────────────────────────────
  app.get("/health", (_req, res) => {
    let dbOk = false;
    try {
      const db = getDb();
      const result = db.pragma("integrity_check", { simple: true });
      dbOk = result === "ok";
    } catch {
      dbOk = false;
    }
    res.json({
      ok: dbOk,
      db: dbOk ? "connected" : "error",
      uptime: Math.floor(process.uptime()),
      version: "0.1.0",
    });
  });

  // ─── Routes ────────────────────────────────────────────────────────────────
  app.use("/auth", authRouter);
  app.use("/chat", chatRouter);
  app.use("/invoke", invokeRouter);

  // ─── 404 Handler ──────────────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ─── Central Error Handler ────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
