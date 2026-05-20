/**
 * CLI script: generate N invite codes and print to stdout.
 * Usage: node dist/scripts/seed-invites.js --count 20 --expires 2026-12-31
 */
import Database from "better-sqlite3";
import { randomBytes } from "crypto";
import { parseArgs } from "util";
import path from "path";

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "10" },
    expires: { type: "string" },
    db: {
      type: "string",
      default: process.env.DB_PATH ?? path.join(process.cwd(), "data", "ros.db"),
    },
    label: { type: "string", default: "seed" },
  },
});

const dbPath = values.db as string;
const db = new Database(dbPath);

// Run schema first (idempotent)
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const stmt = db.prepare(
  `INSERT INTO invite_codes (code, created_by, expires_at, is_active)
   VALUES (?, ?, ?, 1)`
);

const count = parseInt(values.count as string, 10);
const expiresAt = values.expires
  ? Math.floor(new Date(values.expires as string).getTime() / 1000)
  : null;

const label = values.label as string;

console.log(`Generating ${count} invite codes...`);
console.log("─".repeat(20));

const insert = db.transaction(() => {
  for (let i = 0; i < count; i++) {
    // 12-char uppercase hex from crypto (not Math.random)
    const code = randomBytes(8).toString("hex").toUpperCase().slice(0, 12);
    stmt.run(code, label, expiresAt);
    console.log(code);
  }
});

insert();

if (expiresAt) {
  console.log("─".repeat(20));
  console.log(`Expires: ${new Date(expiresAt * 1000).toISOString()}`);
}

db.close();
process.exit(0);
