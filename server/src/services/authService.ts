/**
 * Auth service — user creation, login validation, JWT sign/verify, revocation.
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/connection";
import type { AuthResponse, JwtPayload, UserRow } from "../types";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "24h";
const BCRYPT_COST = 12;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes

// Dummy hash used to ensure timing-safe comparison even when user not found
const DUMMY_HASH = "$2a$12$dummyhashfortimingattackpreventionxxxxxxxxxxxxxxxxxxxx";

export interface CreateUserInput {
  email: string;
  password: string;
  inviteCode: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create a new user account.
 * Must be called within a valid invite code check.
 */
export async function createUser(
  input: CreateUserInput
): Promise<AuthResponse> {
  const db = getDb();
  const { email, password, ipAddress, userAgent } = input;
  const normalizedEmail = email.toLowerCase().trim();

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const userId = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  // Insert user + mark invite consumed in a single transaction
  const insert = db.transaction(() => {
    try {
      db.prepare(
        `INSERT INTO users (id, email, password_hash, created_at, is_active)
         VALUES (?, ?, ?, ?, 1)`
      ).run(userId, normalizedEmail, passwordHash, now);
    } catch (err) {
      const sqliteErr = err as { code?: string };
      if (sqliteErr.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw Object.assign(new Error("Email already registered"), { status: 409 });
      }
      throw err;
    }

    // Mark invite as used
    db.prepare(
      `UPDATE invite_codes SET used_by = ?, used_at = ?, is_active = 0
       WHERE code = ?`
    ).run(userId, now, input.inviteCode.toUpperCase());
  });

  insert();

  return signAndStoreSession(userId, normalizedEmail, now, ipAddress, userAgent);
}

/**
 * Validate login credentials and return a JWT on success.
 * Timing-safe: always runs bcrypt.compare even when user not found.
 */
export async function validateLogin(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResponse> {
  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();
  const now = Math.floor(Date.now() / 1000);

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizedEmail) as UserRow | undefined;

  // Always run bcrypt (timing attack prevention — F-06)
  const hashToCompare = user?.password_hash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  // Check lockout
  if (user && user.locked_until && user.locked_until > now) {
    const retryAfter = user.locked_until - now;
    throw Object.assign(new Error("Account temporarily locked due to too many failed attempts."), {
      status: 429,
      retry_after: retryAfter,
    });
  }

  if (!user || !valid) {
    // Track failed attempts (F-08)
    if (user) {
      const newAttempts = (user.failed_attempts ?? 0) + 1;
      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        db.prepare(
          `UPDATE users SET failed_attempts = ?, locked_until = ?
           WHERE id = ?`
        ).run(newAttempts, now + LOCKOUT_DURATION_SECONDS, user.id);
      } else {
        db.prepare(
          "UPDATE users SET failed_attempts = ? WHERE id = ?"
        ).run(newAttempts, user.id);
      }
    }
    // Same error message for wrong email AND wrong password (F-06)
    throw Object.assign(new Error("Invalid credentials"), { status: 401 });
  }

  // Successful login — reset failed attempts
  db.prepare(
    "UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ? WHERE id = ?"
  ).run(now, user.id);

  return signAndStoreSession(user.id, user.email, now, ipAddress, userAgent);
}

/**
 * Revoke a session by marking it as expired in DB.
 */
export function revokeSession(jti: string): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "UPDATE sessions SET expires_at = ? WHERE id = ?"
  ).run(now, jti);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function signAndStoreSession(
  userId: string,
  email: string,
  now: number,
  ipAddress?: string,
  userAgent?: string
): AuthResponse {
  const db = getDb();
  const sessionId = uuidv4();

  // Parse JWT_EXPIRES_IN to seconds
  const expiresInSeconds = parseExpiry(JWT_EXPIRES_IN);
  const expiresAt = now + expiresInSeconds;

  const token = jwt.sign(
    { sub: userId, email, jti: sessionId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );

  const tokenHash = createHash("sha256").update(token).digest("hex");

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, userId, tokenHash, now, expiresAt, ipAddress ?? null, userAgent ?? null);

  return {
    token,
    user: { id: userId, email, created_at: now },
  };
}

function parseExpiry(expiry: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiry);
  if (!match) return 86400; // default 24h
  const [, amount, unit] = match;
  const n = parseInt(amount!, 10);
  switch (unit) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 3600;
    case "d": return n * 86400;
    default:  return 86400;
  }
}

/**
 * Validate a JWT and return the payload (without DB check — use for non-auth operations).
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
