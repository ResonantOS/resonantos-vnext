/**
 * Shared types for the ResonantOS vNext API server.
 */
import type { Request } from "express";

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
}

// Augment Express Request to carry req.user after requireAuth middleware
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;   // user id
  email: string;
  jti: string;   // session id
  iat: number;
  exp: number;
}

// ─── DB Row Types ─────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
  last_login: number | null;
  is_active: number;
  failed_attempts: number;
  locked_until: number | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  ip_address: string | null;
  user_agent: string | null;
}

export interface InviteCodeRow {
  code: string;
  created_by: string | null;
  used_by: string | null;
  used_at: number | null;
  expires_at: number | null;
  is_active: number;
}

export interface UsageLogRow {
  id: number;
  user_id: string;
  created_at: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number | null;
  request_id: string | null;
  endpoint: string | null;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface UserPublic {
  id: string;
  email: string;
  created_at: number;
}

export interface DailyUsage {
  messages: number;
  tokens: number;
  limit: number;
}

export interface MeResponse extends UserPublic {
  daily_usage: DailyUsage;
}

export interface AuthResponse {
  token: string;
  user: UserPublic;
}

export interface ErrorResponse {
  error: string;
  retry_after?: number;
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}
