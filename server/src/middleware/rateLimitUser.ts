/**
 * Per-user daily message cap using atomic DB counter.
 * Uses UPSERT with WHERE count < limit to prevent race conditions (F-12).
 */
import type { Request, Response, NextFunction } from "express";
import { getDb } from "../db/connection";

const DAILY_LIMIT = parseInt(process.env.DAILY_MSG_LIMIT ?? "50", 10);

/**
 * Atomically increment the daily counter.
 * Returns true if allowed, false if limit reached.
 */
export function incrementDailyCounter(userId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO daily_counters (user_id, day, count) VALUES (?, date('now'), 1)
       ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1
       WHERE count < ?`
    )
    .run(userId, DAILY_LIMIT);

  return result.changes > 0;
}

/**
 * Decrement the daily counter (used when upstream fails — user shouldn't be penalized).
 */
export function decrementDailyCounter(userId: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE daily_counters SET count = MAX(0, count - 1)
     WHERE user_id = ? AND day = date('now')`
  ).run(userId);
}

/**
 * Get current daily usage count.
 */
export function getDailyCount(userId: string): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT count FROM daily_counters WHERE user_id = ? AND day = date('now')"
    )
    .get(userId) as { count: number } | undefined;
  return row?.count ?? 0;
}

/**
 * Express middleware — checks the daily limit BEFORE the handler.
 * Uses the atomic increment pattern so there's no TOCTOU race.
 */
export function checkDailyLimit(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }

  const allowed = incrementDailyCounter(user.id);
  if (!allowed) {
    res.status(429).json({
      error: "Daily message limit reached. Resets at midnight UTC.",
      limit: DAILY_LIMIT,
    });
    return;
  }

  // Attach a decrement helper to req for cleanup on upstream failure
  (req as Request & { decrementDailyCounter?: () => void }).decrementDailyCounter = () =>
    decrementDailyCounter(user.id);

  next();
}
