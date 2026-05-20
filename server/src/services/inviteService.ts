/**
 * Invite code service — validation and generation.
 */
import { randomBytes } from "crypto";
import { getDb } from "../db/connection";
import type { InviteCodeRow } from "../types";

/**
 * Validate an invite code. Returns true if valid, throws on invalid/used/expired.
 */
export function validateInvite(code: string): void {
  const db = getDb();
  const normalizedCode = code.toUpperCase().trim();
  const now = Math.floor(Date.now() / 1000);

  const invite = db
    .prepare("SELECT * FROM invite_codes WHERE code = ?")
    .get(normalizedCode) as InviteCodeRow | undefined;

  if (!invite || invite.is_active === 0) {
    throw Object.assign(new Error("Invalid or already used invite code"), { status: 422 });
  }
  if (invite.used_by) {
    throw Object.assign(new Error("Invite code has already been used"), { status: 422 });
  }
  if (invite.expires_at && invite.expires_at < now) {
    throw Object.assign(new Error("Invite code has expired"), { status: 422 });
  }
}

/**
 * Generate N invite codes and insert into DB.
 * Returns the generated codes.
 */
export function generateInvites(
  count: number,
  createdBy?: string,
  expiresAt?: number
): string[] {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO invite_codes (code, created_by, expires_at, is_active)
     VALUES (?, ?, ?, 1)`
  );

  const codes: string[] = [];
  const insert = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      // 12-char uppercase alphanumeric from crypto — not Math.random() (F-07)
      const code = randomBytes(8).toString("hex").toUpperCase().slice(0, 12);
      stmt.run(code, createdBy ?? "admin", expiresAt ?? null);
      codes.push(code);
    }
  });
  insert();

  return codes;
}

/**
 * Get all active unused invite codes.
 */
export function listActiveInvites(): InviteCodeRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM invite_codes WHERE is_active = 1 AND used_by IS NULL"
    )
    .all() as InviteCodeRow[];
}
