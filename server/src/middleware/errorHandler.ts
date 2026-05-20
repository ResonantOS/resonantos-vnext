/**
 * Central error handler. Structured JSON errors, no stack traces in production.
 * Scrubs Authorization headers from any logged context.
 */
import type { Request, Response, NextFunction } from "express";

interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

// Scrub secrets from request/response context before logging
function redactedHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const out = { ...headers };
  delete out["authorization"];
  delete out["x-api-key"];
  return out;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const status = err.status ?? err.statusCode ?? 500;
  const isProd = process.env.NODE_ENV === "production";

  // Log only safe fields — never log the error object directly (may contain API keys)
  const logEntry = {
    ts: new Date().toISOString(),
    method: req.method,
    path: req.path,
    status,
    message: err.message,
    code: (err as NodeJS.ErrnoException).code,
    // In dev mode, include redacted headers for debugging
    ...(isProd ? {} : { headers: redactedHeaders(req.headers as Record<string, unknown>) }),
  };
  console.error("[error]", JSON.stringify(logEntry));

  res.status(status).json({
    error: isProd ? getPublicMessage(status, err.message) : err.message,
  });
}

function getPublicMessage(status: number, message: string): string {
  if (status >= 500) return "An internal server error occurred.";
  return message;
}

// Catch 404s for unmatched routes
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}
