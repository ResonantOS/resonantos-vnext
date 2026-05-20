/**
 * requireAuth middleware — verifies JWT, checks DB revocation, attaches req.user.
 */
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getDb } from "../db/connection";
import type { JwtPayload, SessionRow, UserRow } from "../types";

const JWT_SECRET = process.env.JWT_SECRET!;

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Check session exists in DB and hasn't been revoked/expired
  const session = db
    .prepare(
      "SELECT * FROM sessions WHERE id = ? AND expires_at > ?"
    )
    .get(payload.jti, now) as SessionRow | undefined;

  if (!session) {
    res.status(401).json({ error: "Session expired or revoked" });
    return;
  }

  // Check user is still active
  const user = db
    .prepare("SELECT id, email, is_active FROM users WHERE id = ?")
    .get(payload.sub) as Pick<UserRow, "id" | "email" | "is_active"> | undefined;

  if (!user || user.is_active === 0) {
    res.status(401).json({ error: "Account suspended" });
    return;
  }

  req.user = { id: user.id, email: user.email };
  next();
}
