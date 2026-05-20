/**
 * Run schema migrations on startup.
 * Uses CREATE TABLE IF NOT EXISTS — idempotent and safe to run every boot.
 */
import fs from "fs";
import path from "path";
import { getDb } from "./connection";

export function runMigrations(): void {
  const db = getDb();

  // Run integrity check first
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") {
    throw new Error(`SQLite integrity check failed: ${String(integrity)}`);
  }

  // Execute the schema SQL
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");

  // SQLite's exec() runs multiple statements
  db.exec(sql);

  console.log("[migrate] Schema applied successfully");
}
