/**
 * Auth routes — register, login, logout, /me
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { loginLimiter, registerLimiter } from "../middleware/rateLimitIp";
import { createUser } from "../services/authService";
import { validateLogin, revokeSession } from "../services/authService";
import { validateInvite } from "../services/inviteService";
import { getDailyUsage } from "../services/usageTracker";
import { getDailyCount } from "../middleware/rateLimitUser";
import type { AuthenticatedRequest, JwtPayload } from "../types";
import jwt from "jsonwebtoken";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const DAILY_LIMIT = parseInt(process.env.DAILY_MSG_LIMIT ?? "50", 10);

// ─── POST /auth/register ───────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  invite_code: z.string().min(1, "Invite code is required"),
});

router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  const parse = RegisterSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message ?? "Validation error" });
    return;
  }

  const { email, password, invite_code } = parse.data;

  // Validate invite before doing expensive bcrypt
  try {
    validateInvite(invite_code);
  } catch (err) {
    const appErr = err as { status?: number; message: string };
    res.status(appErr.status ?? 422).json({ error: appErr.message });
    return;
  }

  try {
    const result = await createUser({
      email,
      password,
      inviteCode: invite_code,
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers["user-agent"] ?? undefined,
    });
    res.status(201).json(result);
  } catch (err) {
    const appErr = err as { status?: number; message: string };
    if (appErr.status) {
      res.status(appErr.status).json({ error: appErr.message });
      return;
    }
    throw err;
  }
});

// ─── POST /auth/login ──────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const parse = LoginSchema.safeParse(req.body);
  if (!parse.success) {
    // Still return 401 to prevent enumeration
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const { email, password } = parse.data;

  try {
    const result = await validateLogin(
      email,
      password,
      req.ip ?? undefined,
      req.headers["user-agent"] ?? undefined
    );
    res.json(result);
  } catch (err) {
    const appErr = err as { status?: number; message: string; retry_after?: number };
    if (appErr.status) {
      const body: Record<string, unknown> = { error: appErr.message };
      if (appErr.retry_after) {
        res.setHeader("Retry-After", String(appErr.retry_after));
        body["retry_after"] = appErr.retry_after;
      }
      res.status(appErr.status).json(body);
      return;
    }
    throw err;
  }
});

// ─── POST /auth/logout ─────────────────────────────────────────────────────────

router.post("/logout", requireAuth, (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      revokeSession(payload.jti);
    } catch {
      // Token may already be expired — still return ok
    }
  }
  res.json({ ok: true });
});

// ─── GET /me ───────────────────────────────────────────────────────────────────

router.get("/me", requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.user;

  const usage = getDailyUsage(user.id);
  const messages = getDailyCount(user.id);

  // Get user created_at from DB
  const { getDb } = require("../db/connection");
  const db = getDb();
  const dbUser = db
    .prepare("SELECT created_at FROM users WHERE id = ?")
    .get(user.id) as { created_at: number } | undefined;

  res.json({
    id: user.id,
    email: user.email,
    created_at: dbUser?.created_at ?? 0,
    daily_usage: {
      messages,
      tokens: usage.tokens,
      limit: DAILY_LIMIT,
    },
  });
});

export default router;
