/**
 * Usage tracking service — log LLM calls, estimate costs, enforce monthly budget.
 */
import { getDb } from "../db/connection";
import type { UsageLogRow } from "../types";

// Pricing per token (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o":       { input: 0.000005, output: 0.000015 },
  "gpt-4o-mini":  { input: 0.00000015, output: 0.0000006 },
  "gpt-4-turbo":  { input: 0.00001, output: 0.00003 },
  "gpt-4":        { input: 0.00003, output: 0.00006 },
  "gpt-3.5-turbo": { input: 0.0000005, output: 0.0000015 },
};

const MONTHLY_SPEND_LIMIT = parseFloat(process.env.MONTHLY_SPEND_LIMIT_USD ?? "50");

export interface LogUsageInput {
  userId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  requestId?: string;
  endpoint?: string;
  estimated?: boolean;
}

/**
 * Log a completed LLM call to usage_log.
 */
export function logUsage(input: LogUsageInput): void {
  const db = getDb();
  const {
    userId,
    model,
    promptTokens,
    completionTokens,
    requestId,
    endpoint,
  } = input;

  const totalTokens = promptTokens + completionTokens;
  const costUsd = estimateCost(model, promptTokens, completionTokens);
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO usage_log
       (user_id, created_at, model, prompt_tokens, completion_tokens,
        total_tokens, cost_usd, request_id, endpoint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    now,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd ?? null,
    requestId ?? null,
    endpoint ?? null
  );
}

/**
 * Get daily usage stats for a user.
 */
export function getDailyUsage(userId: string): { messages: number; tokens: number } {
  const db = getDb();
  const startOfDay = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);

  const row = db
    .prepare(
      `SELECT COUNT(*) as messages, COALESCE(SUM(total_tokens), 0) as tokens
       FROM usage_log
       WHERE user_id = ? AND created_at >= ?`
    )
    .get(userId, startOfDay) as { messages: number; tokens: number };

  return { messages: row.messages ?? 0, tokens: row.tokens ?? 0 };
}

/**
 * Get total spend for the current month (UTC).
 */
export function getMonthlySpend(): number {
  const db = getDb();
  const now = new Date();
  const startOfMonth = Math.floor(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime() / 1000
  );

  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) as total
       FROM usage_log
       WHERE created_at >= ?`
    )
    .get(startOfMonth) as { total: number };

  return row.total ?? 0;
}

/**
 * Check if monthly spend limit is reached.
 * Returns true if we're over the cap.
 */
export function isMonthlyCapReached(): boolean {
  const spend = getMonthlySpend();
  // Add 10% buffer for estimated token counts (F-13)
  return spend * 1.1 >= MONTHLY_SPEND_LIMIT;
}

/**
 * Estimate cost for a model + token pair.
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = PRICING[model] ?? { input: 0.000005, output: 0.000015 };
  return pricing.input * promptTokens + pricing.output * completionTokens;
}

/**
 * Get recent usage rows for a user.
 */
export function getRecentUsage(userId: string, limit = 100): UsageLogRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM usage_log WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, limit) as UsageLogRow[];
}
