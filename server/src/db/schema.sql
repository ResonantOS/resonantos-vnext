-- ResonantOS vNext — SQLite schema
-- SQLite with WAL mode for concurrent reads

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA wal_autocheckpoint = 100;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,          -- UUID v4
  email           TEXT UNIQUE NOT NULL,      -- lowercased on insert
  password_hash   TEXT NOT NULL,             -- bcrypt, cost 12
  created_at      INTEGER NOT NULL,          -- Unix timestamp (seconds)
  last_login      INTEGER,                   -- Unix timestamp or NULL
  is_active       INTEGER NOT NULL DEFAULT 1, -- 0 = suspended
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER                    -- NULL = not locked
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions (JWT revocation list approach)
-- We store the JWT jti claim for fast revocation.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,          -- UUID v4 = JWT jti
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,      -- SHA-256 of raw token (revocation)
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,          -- Unix timestamp
  ip_address  TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_hash   ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- Invite codes
CREATE TABLE IF NOT EXISTS invite_codes (
  code        TEXT PRIMARY KEY,           -- random 12-char alphanumeric
  created_by  TEXT,                       -- admin label or NULL
  used_by     TEXT REFERENCES users(id),
  used_at     INTEGER,
  expires_at  INTEGER,                    -- NULL = no expiry
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- Usage log — every LLM call
CREATE TABLE IF NOT EXISTS usage_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        INTEGER NOT NULL,      -- Unix timestamp
  model             TEXT NOT NULL,         -- e.g. "gpt-4o-mini"
  prompt_tokens     INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens      INTEGER NOT NULL,
  cost_usd          REAL,                  -- estimated, nullable
  request_id        TEXT,                  -- OpenAI x-request-id header
  endpoint          TEXT                   -- "/chat/completions" etc.
);

CREATE INDEX IF NOT EXISTS idx_usage_user_day ON usage_log(user_id, created_at);

-- Atomic daily message counters (prevents race condition on rate limiting)
CREATE TABLE IF NOT EXISTS daily_counters (
  user_id  TEXT NOT NULL,
  day      TEXT NOT NULL,   -- YYYY-MM-DD
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
