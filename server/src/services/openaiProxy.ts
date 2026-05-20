/**
 * OpenAI proxy service — forwards chat completion requests server-side.
 * Security: API key is NEVER exposed to clients.
 * Logging: NEVER logs request/response bodies, only token counts.
 */
import type { Response } from "express";
import { logUsage, isMonthlyCapReached, estimateCost } from "./usageTracker";
import { decrementDailyCounter } from "../middleware/rateLimitUser";
import type { ChatCompletionRequest } from "../types";

const MAX_TOKENS = parseInt(process.env.MAX_TOKENS_PER_REQ ?? "4000", 10);
const OPENAI_BASE = "https://api.openai.com/v1";
const REQUEST_TIMEOUT_MS = 30_000;

export interface ProxyOptions {
  userId: string;
  body: ChatCompletionRequest;
  res: Response;
  endpoint: string;
}

/**
 * Proxy a non-streaming chat completion request.
 */
export async function proxyChatCompletion(opts: ProxyOptions): Promise<void> {
  const { userId, res, endpoint } = opts;

  // Check monthly spend cap (F-11)
  if (isMonthlyCapReached()) {
    decrementDailyCounter(userId);
    res.status(503).json({
      error: "Service at capacity for this month. Please try again next month.",
    });
    return;
  }

  const body = sanitizeRequestBody(opts.body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let openaiRes: globalThis.Response;
  try {
    openaiRes = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "User-Agent": "resonantos-proxy/0.1.0",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === "AbortError") {
      // Decrement counter — user shouldn't be penalized for timeout (F-14)
      decrementDailyCounter(userId);
      res.status(504).json({
        error: "AI service timed out. Your message limit was not used. Please try again.",
      });
      return;
    }
    decrementDailyCounter(userId);
    res.status(502).json({ error: "Failed to reach AI service." });
    return;
  } finally {
    clearTimeout(timeout);
  }

  // Handle upstream errors (F-15)
  if (!openaiRes.ok) {
    const status = openaiRes.status;
    decrementDailyCounter(userId);
    if (status === 503 || status === 529) {
      res.status(503).json({
        error: "AI service temporarily unavailable. Your message limit was not used.",
        retry_after: 60,
      });
      return;
    }
    if (status === 429) {
      res.status(429).json({
        error: "AI service at capacity. Your message limit was not used. Please try again in a moment.",
      });
      return;
    }
    res.status(502).json({ error: `AI service error: ${status}` });
    return;
  }

  // Parse response — never log the body, only token counts
  const data = await openaiRes.json() as {
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    id?: string;
    [key: string]: unknown;
  };

  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;
  const requestId = openaiRes.headers.get("x-request-id") ?? undefined;

  logUsage({
    userId,
    model: body.model,
    promptTokens,
    completionTokens,
    requestId,
    endpoint,
  });

  res.json(data);
}

/**
 * Proxy a streaming chat completion request.
 */
export async function proxyChatCompletionStream(opts: ProxyOptions): Promise<void> {
  const { userId, res, endpoint } = opts;

  // Check monthly spend cap (F-11)
  if (isMonthlyCapReached()) {
    decrementDailyCounter(userId);
    res.status(503).json({
      error: "Service at capacity for this month. Please try again next month.",
    });
    return;
  }

  const body = sanitizeRequestBody(opts.body);
  // Always request usage data in stream mode (F-13)
  const bodyWithUsage = {
    ...body,
    stream: true,
    stream_options: { include_usage: true },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let openaiRes: globalThis.Response;
  try {
    openaiRes = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "User-Agent": "resonantos-proxy/0.1.0",
      },
      body: JSON.stringify(bodyWithUsage),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === "AbortError") {
      decrementDailyCounter(userId);
      res.status(504).json({
        error: "AI service timed out. Your message limit was not used.",
      });
      return;
    }
    decrementDailyCounter(userId);
    res.status(502).json({ error: "Failed to reach AI service." });
    return;
  }

  // Handle upstream errors (F-15)
  if (!openaiRes.ok) {
    clearTimeout(timeout);
    const status = openaiRes.status;
    decrementDailyCounter(userId);
    if (status === 503 || status === 529) {
      res.status(503).json({
        error: "AI service temporarily unavailable. Your message limit was not used.",
        retry_after: 60,
      });
      return;
    }
    if (status === 429) {
      res.status(429).json({
        error: "AI service at capacity. Please try again in a moment.",
      });
      return;
    }
    res.status(502).json({ error: `AI service error: ${status}` });
    return;
  }

  if (!openaiRes.body) {
    clearTimeout(timeout);
    decrementDailyCounter(userId);
    res.status(502).json({ error: "AI service returned no stream body." });
    return;
  }

  // SSE streaming setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // Tell nginx not to buffer

  const requestId = openaiRes.headers.get("x-request-id") ?? undefined;

  let promptTokens = 0;
  let completionTokens = 0;
  let totalChars = 0;
  let usageFound = false;

  // Stream SSE chunks to client, parse usage from final chunk
  const reader = openaiRes.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      totalChars += chunk.length;

      // Parse usage from SSE data chunks (F-13)
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ") && !line.includes("[DONE]")) {
          try {
            const parsed = JSON.parse(line.slice(6)) as {
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens ?? 0;
              completionTokens = parsed.usage.completion_tokens ?? 0;
              usageFound = true;
            }
          } catch {
            // Non-JSON SSE lines are fine
          }
        }
      }

      res.write(chunk);
    }
  } catch {
    // Stream interrupted
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }

  res.end();

  // Fallback token estimation if usage not in stream (F-13)
  if (!usageFound) {
    const estimatedTokens = Math.ceil(totalChars / 4);
    promptTokens = Math.ceil(estimatedTokens * 0.3);
    completionTokens = Math.ceil(estimatedTokens * 0.7);
    console.warn("[openai-proxy] No usage data in stream — using estimates", {
      estimated: true,
      estimatedTokens,
    });
  }

  logUsage({
    userId,
    model: body.model,
    promptTokens,
    completionTokens,
    requestId,
    endpoint,
    estimated: !usageFound,
  });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function sanitizeRequestBody(body: ChatCompletionRequest): ChatCompletionRequest {
  // Strip any client-supplied API key fields (security)
  const sanitized = { ...body };
  delete (sanitized as Record<string, unknown>)["api_key"];
  delete (sanitized as Record<string, unknown>)["apiKey"];

  // Clamp max_tokens (F-12 / §7.3)
  if (!sanitized.max_tokens || sanitized.max_tokens > MAX_TOKENS) {
    sanitized.max_tokens = MAX_TOKENS;
  }

  return sanitized;
}
