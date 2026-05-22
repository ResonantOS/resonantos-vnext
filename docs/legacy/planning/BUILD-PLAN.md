# BUILD-PLAN.md — ResonantOS vNext Auth + API Proxy

**Target:** resonantclaw.com → Hetzner 5.161.249.196  
**Backend dir:** `/Users/dr.tom/resonantos-vnext/server/`  
**Frontend repo:** `/Users/dr.tom/resonantos-vnext/`  
**Date:** 2026-05-20  
**Status:** FINAL (Red-Team mitigations incorporated)

---

## 0. Executive Summary

We are adding a production auth + API proxy layer to the existing ResonantOS vNext web deployment. The frontend is already deployed and serving. The nginx config already routes `/api/` → port 5100 and `/ws/` → port 5100 with WebSocket upgrade. We need to build the Node.js server on port 5100 that:

1. Gates the app behind login/register with invite codes
2. Proxies OpenAI calls server-side (API key never reaches the browser)
3. Enforces per-user rate limits and usage tracking
4. Runs as a systemd service with auto-restart

The existing `web-transport.ts` and `TokenGate.tsx` are already wired for web mode — we're evolving them into a proper auth flow while keeping the `ros_api_token` / `Authorization: Bearer` contract intact.

**Critical pre-existing issue discovered:** The WebSocket URL derived from `VITE_API_BASE` routes through nginx's `/api/` location which lacks WebSocket upgrade headers. This is fixed in the plan (see §6.5).

---

## 1. File-by-File Specification

### 1.1 New Files — Backend (`server/`)

```
server/
├── package.json                    # Node dependencies
├── tsconfig.json                   # TypeScript config
├── .env.example                    # Env var template
├── src/
│   ├── index.ts                    # Process entry point (listen + graceful shutdown)
│   ├── app.ts                      # Express app factory (all middleware + routes)
│   ├── db/
│   │   ├── connection.ts           # better-sqlite3 singleton + WAL mode
│   │   ├── schema.sql              # DDL for all 4 tables
│   │   └── migrate.ts              # Run schema on startup
│   ├── middleware/
│   │   ├── auth.ts                 # requireAuth: verify JWT, attach req.user
│   │   ├── rateLimitIp.ts          # express-rate-limit: auth endpoints (10 req/min)
│   │   ├── rateLimitUser.ts        # Per-user daily message cap (50/day via DB)
│   │   └── errorHandler.ts        # Central error handler, structured JSON errors
│   ├── routes/
│   │   ├── auth.ts                 # POST /register, POST /login, POST /logout, GET /me
│   │   ├── invoke.ts               # POST /invoke/:command (invoke bridge)
│   │   └── chat.ts                 # POST /chat/completions (OpenAI proxy)
│   ├── services/
│   │   ├── authService.ts          # createUser, validateLogin, createToken, revokeToken
│   │   ├── inviteService.ts        # validateInvite, consumeInvite, generateInvites
│   │   ├── openaiProxy.ts          # Stream/non-stream proxy to OpenAI API
│   │   └── usageTracker.ts         # logUsage, getDailyUsage, estimateCost
│   └── types/
│       └── index.ts                # Express augmentation: req.user, shared types
├── scripts/
│   └── seed-invites.ts             # CLI: generate N invite codes to stdout
└── ros-server.service              # systemd unit file
```

### 1.2 Modified Files — Frontend

| File | Change |
|------|--------|
| `src/components/TokenGate.tsx` | Replace with full Login/Register/Invite flow |
| `src/components/LoginGate.tsx` | **New** — proper auth UI (replaces TokenGate) |
| `src/App.tsx` | Replace `TokenGate` import/usage with `LoginGate` |
| `src/core/web-transport.ts` | Add `clearWebAuth()`, fix WS URL derivation, add 401 interceptor |
| `src/styles/styles.css` | Add login-gate CSS (register tab, invite field, error states) |

### 1.3 New Files — Frontend

| File | Purpose |
|------|---------|
| `src/components/LoginGate.tsx` | Login + Register tabs, invite code field, JWT storage |

### 1.4 New Files — Deployment

| File | Location on Server | Purpose |
|------|-------------------|---------|
| `ros-server.service` | `/etc/systemd/system/ros-server.service` | systemd unit |
| `.env` | `/var/www/ros-server/.env` | Production env vars (chmod 600) |

---

## 2. Database Schema

```sql
-- file: server/src/db/schema.sql
-- SQLite with WAL mode for concurrent reads

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,          -- UUID v4
  email        TEXT UNIQUE NOT NULL,      -- lowercased on insert
  password_hash TEXT NOT NULL,            -- bcrypt, cost 12
  created_at   INTEGER NOT NULL,          -- Unix timestamp (seconds)
  last_login   INTEGER,                   -- Unix timestamp or NULL
  is_active    INTEGER NOT NULL DEFAULT 1 -- 0 = suspended
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions (token registry — JWT revocation list approach)
-- We store a hash of the JWT ID (jti) claim for fast revocation.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,          -- UUID v4 = JWT jti
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT UNIQUE NOT NULL,      -- SHA-256 of raw token (revocation)
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,          -- Unix timestamp
  ip_address   TEXT,
  user_agent   TEXT
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
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL,      -- Unix timestamp
  model            TEXT NOT NULL,         -- e.g. "gpt-4o-mini"
  prompt_tokens    INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens     INTEGER NOT NULL,
  cost_usd         REAL,                  -- estimated, nullable
  request_id       TEXT,                  -- OpenAI x-request-id header
  endpoint         TEXT                   -- "/chat/completions" etc.
);

CREATE INDEX IF NOT EXISTS idx_usage_user_day ON usage_log(user_id, created_at);
```

### Migration Strategy

`server/src/db/migrate.ts` runs the schema SQL on every startup via `executeSqlFile()`. SQLite's `CREATE TABLE IF NOT EXISTS` makes this idempotent. For additive schema changes, append new `ALTER TABLE` / `CREATE TABLE` statements with existence guards. Never drop columns in production.

---

## 3. API Contract

### Base URL
- **Frontend env:** `VITE_API_BASE=https://resonantclaw.com/api`  
- **nginx strips `/api/`** → backend receives paths without `/api/` prefix  
- All endpoints below are **backend-side paths** (what the Express server sees)

### 3.1 Auth Endpoints

#### `POST /auth/register`
**Rate limit:** 5 req/15 min per IP

Request:
```json
{
  "email": "user@example.com",
  "password": "min8chars",
  "invite_code": "ABC123XYZ789"
}
```

Response `201`:
```json
{
  "token": "<JWT>",
  "user": { "id": "uuid", "email": "user@example.com" }
}
```

Errors: `400` validation, `409` email exists, `422` invite invalid/used/expired

---

#### `POST /auth/login`
**Rate limit:** 10 req/min per IP (with exponential backoff tracking via DB attempts)

Request:
```json
{ "email": "user@example.com", "password": "password123" }
```

Response `200`:
```json
{
  "token": "<JWT>",
  "user": { "id": "uuid", "email": "user@example.com" }
}
```

Errors: `401` invalid credentials (same message for wrong email AND wrong password — never enumerate)

---

#### `POST /auth/logout`
**Auth required:** Bearer token

Request: empty body  
Response `200`: `{ "ok": true }`

Effect: Marks session as expired in DB (revocation).

---

#### `GET /me`
**Auth required:** Bearer token

Response `200`:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "created_at": 1716220000,
  "daily_usage": { "messages": 12, "tokens": 8400, "limit": 50 }
}
```

---

### 3.2 Invoke Bridge

#### `POST /invoke/:command`
**Auth required:** Bearer token  
**Purpose:** Bridge for existing `webInvoke()` calls from web-transport.ts

The backend maintains a command registry. Unrecognized commands return `501`.

| Command | Response |
|---------|----------|
| `local_runtime_status` | `{ "ok": true, "mode": "web", "version": "0.1.0" }` |
| `provider_smoke_test` | `{ "ok": true }` |
| *(others)* | `501 Not Implemented` |

Request body: arbitrary JSON (passed from frontend's `webInvoke(command, args)`)  
Response `200`: JSON payload appropriate for the command

**This endpoint validates auth on every call.** The existing `TokenGate.tsx` calls `POST /invoke/local_runtime_status` as its health-check — this continues to work unchanged for the new `LoginGate.tsx`.

---

### 3.3 OpenAI Proxy

#### `POST /chat/completions`
**Auth required:** Bearer token  
**Rate limit:** 50 messages/day per user (tracked in `usage_log`)  
**Token limit:** 4000 tokens max per request (enforced before upstream call)

Request: OpenAI-compatible chat completions body
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": false,
  "max_tokens": 1000
}
```

**Enforcement:**
1. Strip any client-supplied `api_key` fields (never accept)
2. Enforce `max_tokens ≤ 4000` (clamp or reject)
3. Check daily message count: if ≥ 50 → `429 { "error": "Daily limit reached" }`
4. Inject server-side `Authorization: Bearer ${process.env.OPENAI_API_KEY}`
5. Forward to `https://api.openai.com/v1/chat/completions`
6. On success: parse response, write to `usage_log`
7. Return response to client

**Streaming support:** When `stream: true`, pipe the SSE stream directly from OpenAI to client. Count tokens from `x-usage-*` headers or final `data: [DONE]` chunk.

Response `200`: OpenAI API response (passthrough)  
Errors:
- `429` — daily limit exceeded
- `400` — max_tokens exceeded (if not clamping)  
- `502` — OpenAI upstream error
- `503` — OpenAI timeout

---

## 4. Auth Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          REGISTER FLOW                          │
└─────────────────────────────────────────────────────────────────┘

User opens resonantclaw.com (web mode, no token in localStorage)
  → App.tsx renders <LoginGate onConnected={...} />
  → User clicks "Register" tab
  → Fills: email, password, invite_code
  → POST /auth/register
      ├─ Validate invite_code (active, not used, not expired)
      ├─ Check email uniqueness
      ├─ bcrypt.hash(password, 12)
      ├─ INSERT users + mark invite consumed (transaction)
      ├─ Sign JWT: { sub: userId, jti: sessionId, iat, exp: +24h }
      ├─ INSERT sessions (hash of token, ip, ua)
      └─ Return { token, user }
  → Frontend: localStorage.setItem('ros_api_token', token)
  → Frontend: setWebAuthToken(token)
  → LoginGate calls onConnected() → App renders main UI


┌─────────────────────────────────────────────────────────────────┐
│                           LOGIN FLOW                            │
└─────────────────────────────────────────────────────────────────┘

User opens resonantclaw.com (no/expired token)
  → App.tsx renders <LoginGate />
  → User fills: email, password
  → POST /auth/login
      ├─ Lookup user by email (timing-safe — always bcrypt.compare, even if not found)
      ├─ bcrypt.compare(password, hash)
      ├─ On match: sign JWT + INSERT session + UPDATE last_login
      └─ Return { token, user }
  → Frontend stores token, calls onConnected()


┌─────────────────────────────────────────────────────────────────┐
│                      AUTHENTICATED REQUEST                      │
└─────────────────────────────────────────────────────────────────┘

webInvoke() / fetch to /chat/completions
  → Header: Authorization: Bearer <JWT>
  → requireAuth middleware:
      ├─ Extract token from header
      ├─ jwt.verify(token, JWT_SECRET) → payload
      ├─ Check sessions table: jti exists AND not expired
      ├─ Check users table: is_active = 1
      └─ Attach req.user = { id, email }
  → Route handler proceeds
  

┌─────────────────────────────────────────────────────────────────┐
│                         LOGOUT FLOW                             │
└─────────────────────────────────────────────────────────────────┘

User clicks logout
  → POST /auth/logout (with Bearer token)
  → Backend: UPDATE sessions SET expires_at = NOW() WHERE id = jti
  → Frontend: localStorage.removeItem('ros_api_token')
  → Frontend: clearWebAuth()
  → App.tsx re-renders LoginGate


┌─────────────────────────────────────────────────────────────────┐
│                         401 HANDLING                            │
└─────────────────────────────────────────────────────────────────┘

Any API call returns 401 (expired/revoked token)
  → web-transport.ts interceptor:
      ├─ Clear localStorage token
      ├─ clearWebAuth()
      └─ Dispatch 'ros:unauthorized' event
  → App.tsx listens for event → sets authToken state to null → renders LoginGate
```

---

## 5. Frontend Changes

### 5.1 `src/components/LoginGate.tsx` (NEW — replaces TokenGate)

```typescript
// Full spec:
// - Two tabs: "Sign In" | "Register"
// - Sign In: email + password fields, "Sign In" button
// - Register: email + password + invite_code fields, "Create Account" button
// - Both call respective /auth/* endpoints
// - On success: localStorage.setItem('ros_api_token', token) + setWebAuthToken(token) + onConnected()
// - Error states: field-level validation (empty, invalid email, password < 8 chars)
// - Loading states on buttons
// - Password visibility toggle
// - Keyboard: Tab navigation, Enter submits
// - Same CSS classes as existing token-gate for visual consistency
// - Prop: onConnected: () => void (same as TokenGate — App.tsx drop-in replacement)
```

### 5.2 `src/components/TokenGate.tsx` (MODIFIED)

Keep file, change to re-export LoginGate for backward compat:
```typescript
// TokenGate.tsx — backward compatibility shim
export { LoginGate as TokenGate } from './LoginGate';
```
This ensures any other import of `TokenGate` continues to work unchanged.

### 5.3 `src/core/web-transport.ts` (MODIFIED)

Three additions:

**1. `clearWebAuth()` function:**
```typescript
export const clearWebAuth = () => {
  _authToken = null;
  localStorage.removeItem('ros_api_token');
};
```

**2. 401 interceptor in `webInvoke()`:**
```typescript
if (res.status === 401) {
  clearWebAuth();
  window.dispatchEvent(new Event('ros:unauthorized'));
  throw new Error('Unauthorized');
}
```

**3. Fix WebSocket URL derivation:**
```typescript
// BEFORE (broken — WS goes through /api/ nginx location, no upgrade headers):
const wsBase = API_BASE!.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws"));
// Produces: wss://resonantclaw.com/api/ws/screen/...
// nginx /api/ location has no WebSocket upgrade headers → connection fails

// AFTER (correct — use separate WS_BASE or strip /api path from origin):
const WS_BASE = import.meta.env.VITE_WS_BASE as string | undefined;
export function createBrowserStream(sessionId: string, onFrame: (jpeg: ArrayBuffer) => void) {
  const wsBase = WS_BASE ?? API_BASE!.replace(/\/api\/?$/, '').replace(/^https?/, (m) => m === "https" ? "wss" : "ws");
  // Produces: wss://resonantclaw.com/ws/screen/...
  // nginx /ws/ location has upgrade headers → works correctly
  ...
}
```

### 5.4 `src/App.tsx` (MODIFIED)

```typescript
// Add 401 event listener in useEffect:
useEffect(() => {
  const handler = () => {
    setAuthToken(null); // triggers LoginGate to render
  };
  window.addEventListener('ros:unauthorized', handler);
  return () => window.removeEventListener('ros:unauthorized', handler);
}, []);
```

App already uses TokenGate — since TokenGate.tsx becomes a shim, no import change needed. The LoginGate handles the `onConnected` prop identically.

### 5.5 `src/styles/styles.css` (MODIFIED)

Add styles for:
- `.auth-tabs` — tab switcher for Sign In / Register
- `.auth-tab-btn` — individual tab button, `.auth-tab-btn.active` state
- `.auth-field-group` — label + input + error row
- `.auth-field-error` — red inline error text
- `.invite-hint` — small text below invite field explaining what it is
- `.auth-footer-link` — "Need an account?" / "Already have one?" toggle

---

## 6. Deployment Steps

### 6.1 Environment Variables

**Production `.env` file** — deploy to `/var/www/ros-server/.env`, `chmod 600`:

```bash
# Required
OPENAI_API_KEY=sk-proj-...
JWT_SECRET=<64-char random hex: openssl rand -hex 32>
NODE_ENV=production
PORT=5100

# Optional tuning
JWT_EXPIRES_IN=24h
DAILY_MSG_LIMIT=50
MAX_TOKENS_PER_REQ=4000
DB_PATH=/var/www/ros-server/data/ros.db
ALLOWED_ORIGIN=https://resonantclaw.com
```

**Never commit `.env` to git.** `.env.example` (no values) is committed.

### 6.2 Build & Deploy Backend

```bash
# On local machine
cd /Users/dr.tom/resonantos-vnext/server
npm install
npm run build             # tsc → dist/

# Rsync to server
rsync -av --exclude node_modules --exclude .env \
  /Users/dr.tom/resonantos-vnext/server/ \
  root@5.161.249.196:/var/www/ros-server/

# On server
ssh root@5.161.249.196
cd /var/www/ros-server
npm install --production
mkdir -p data
# Create .env manually (see §6.1)
```

### 6.3 Generate Invite Codes (Alpha Launch)

```bash
# On server — generate 20 invite codes
cd /var/www/ros-server
node dist/scripts/seed-invites.js --count 20 --expires 2026-12-31
# Prints codes to stdout — copy to your list
```

### 6.4 systemd Service

```ini
# /etc/systemd/system/ros-server.service
[Unit]
Description=ResonantOS vNext API Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/ros-server
EnvironmentFile=/var/www/ros-server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ros-server

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/ros-server/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
# Deploy service
cp ros-server.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable ros-server
systemctl start ros-server
systemctl status ros-server
```

### 6.5 nginx Update (WebSocket Fix)

Add WebSocket upgrade support to the `/api/` location so the WS fix in §5.3 works as fallback — and also support our `VITE_WS_BASE` pointing directly at `wss://resonantclaw.com/ws/`:

```nginx
# /etc/nginx/sites-enabled/resonantclaw — update /api/ location:
location /api/ {
    proxy_pass http://127.0.0.1:5100/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    # ADD: streaming support for SSE (OpenAI stream mode)
    proxy_buffering off;
    proxy_cache off;
}
# /ws/ location already correct — no changes needed
```

```bash
nginx -t && systemctl reload nginx
```

### 6.6 Frontend Build for Web Mode

```bash
cd /Users/dr.tom/resonantos-vnext

# Create web-mode .env
cat > .env.web << 'EOF'
VITE_API_BASE=https://resonantclaw.com/api
VITE_WS_BASE=wss://resonantclaw.com
EOF

# Build
VITE_API_BASE=https://resonantclaw.com/api \
VITE_WS_BASE=wss://resonantclaw.com \
  npm run build

# Deploy to server
rsync -av dist/ root@5.161.249.196:/var/www/ros-vnext/
```

### 6.7 Verify Deployment

```bash
# Health check
curl -s https://resonantclaw.com/api/invoke/local_runtime_status \
  -X POST -H "Content-Type: application/json" -d '{}' \
  # Expected: 401 (not 502, 404, or connection refused)

# Auth check
curl -s https://resonantclaw.com/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"badpass"}'
  # Expected: 401 {"error":"Invalid credentials"}
```

---

## 7. Security Checklist

### 7.1 Secrets & Keys
- [ ] `OPENAI_API_KEY` — env var only, never in code, never logged
- [ ] `JWT_SECRET` — 64-char random hex, env var only, never in code
- [ ] `.env` file — `chmod 600`, owned by `www-data`, not in git
- [ ] `.gitignore` — `server/.env`, `server/data/`, `*.db`

### 7.2 Authentication
- [ ] bcrypt cost factor 12 (not MD5, not SHA, not cost < 10)
- [ ] Timing-safe password comparison (bcrypt.compare always runs, even for non-existent users)
- [ ] JWT `jti` stored and checked against DB (revocation on logout)
- [ ] Expired sessions purged by cron (`DELETE FROM sessions WHERE expires_at < strftime('%s','now')`)
- [ ] 401 responses never reveal whether email exists ("Invalid credentials" for both)

### 7.3 Input Validation
- [ ] All inputs validated with Zod before processing
- [ ] Email normalized to lowercase before DB operations
- [ ] Password minimum 8 characters enforced server-side (not just client)
- [ ] Invite code: only alphanumeric, case-normalized
- [ ] `max_tokens` clamped to 4000 before forwarding to OpenAI

### 7.4 SQL Injection
- [ ] ALL queries use `better-sqlite3` prepared statements — never string interpolation
- [ ] Example: `db.prepare('SELECT * FROM users WHERE email = ?').get(email)`
- [ ] No raw SQL built from user input anywhere

### 7.5 Rate Limiting
- [ ] IP-based: `express-rate-limit` on auth routes (5/15min for register, 10/min for login)
- [ ] User-based daily cap: 50 messages/day checked in DB before each OpenAI call
- [ ] Request-level: `max_tokens ≤ 4000` enforced
- [ ] Abuse prevention: account lockout after 10 failed login attempts in 15 min (track in DB or Redis)

### 7.6 HTTP Security Headers (via Helmet.js)
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Content-Security-Policy: default-src 'none'; connect-src 'self'`
- [ ] CORS: `Access-Control-Allow-Origin: https://resonantclaw.com` only

### 7.7 OpenAI Proxy Security
- [ ] Strip any `api_key` field from client-supplied request body
- [ ] Never forward `Authorization` header from client to OpenAI (use server-side key)
- [ ] Never log request/response bodies (only token counts)
- [ ] Set `User-Agent` on upstream calls to identify our proxy

### 7.8 Data Protection
- [ ] Passwords never logged at any level
- [ ] Tokens never logged (only session IDs)
- [ ] OpenAI API key never returned in any response
- [ ] DB file at `/var/www/ros-server/data/` — not web-accessible
- [ ] DB file permissions: `chmod 600`, owned by `www-data`

### 7.9 Operational Security
- [ ] `NODE_ENV=production` — disables stack traces in error responses
- [ ] systemd `NoNewPrivileges=true`, `ProtectSystem=strict`
- [ ] Service runs as `www-data`, not root
- [ ] Log rotation: `journald` handles automatically
- [ ] Session cleanup cron (see §8)

---

## 8. Test Plan

### 8.1 Unit Tests (new — `server/src/**/*.test.ts`)

| Module | Tests |
|--------|-------|
| `authService.ts` | createUser succeeds, duplicate email rejects, validateLogin correct/incorrect, token sign/verify |
| `inviteService.ts` | valid code accepts, used code rejects, expired code rejects, inactive code rejects |
| `usageTracker.ts` | logUsage inserts correctly, getDailyUsage returns correct count, limit enforcement |
| `rateLimitUser.ts` | under limit passes, at limit passes, over limit returns 429 |
| `auth middleware` | valid JWT passes, expired JWT fails, revoked JWT fails, malformed JWT fails |

### 8.2 Integration Tests (new — `server/tests/`)

| Scenario | Expected |
|----------|----------|
| Register with valid invite | 201 + JWT |
| Register with used invite | 422 |
| Register with existing email | 409 |
| Login correct credentials | 200 + JWT |
| Login wrong password | 401 (same message as wrong email) |
| Login wrong email | 401 (same message as wrong password) |
| Access /me with valid token | 200 + user object |
| Access /me without token | 401 |
| Access /me with expired token | 401 |
| POST /chat/completions authenticated | 200 (mocked OpenAI) |
| POST /chat/completions unauthenticated | 401 |
| POST /chat/completions at daily limit | 429 |
| POST /chat/completions max_tokens exceeded | 400 or clamped |
| POST /logout | 200, subsequent /me returns 401 |
| POST /invoke/local_runtime_status valid token | 200 |
| POST /invoke/unknown_command valid token | 501 |

### 8.3 Existing Tests — Must Stay Green

```bash
cd /Users/dr.tom/resonantos-vnext
npm test    # 307 tests — must all pass after frontend changes
```

**Risk areas after frontend changes:**
- `src/App.test.tsx` — if it renders TokenGate, now gets LoginGate (same props, should pass)
- Any test importing from `web-transport.ts` — check that `clearWebAuth` export doesn't break existing imports
- No other test files are expected to reference TokenGate directly (confirm with `grep -r TokenGate src/**/*.test.*`)

### 8.4 Smoke Tests (post-deploy)

```bash
# On server after deployment
node -e "
const res = await fetch('https://resonantclaw.com/api/auth/login', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({email:'x',password:'y'})
});
console.log(res.status); // expect 401
"
```

### 8.5 Load Test (pre-launch)

Use `autocannon` or `k6`:
- 50 concurrent users, 60 seconds
- Mix of `/invoke/local_runtime_status` (auth-validated) and `/chat/completions` (mocked)
- Verify: no memory leak, < 50ms P99 for non-AI endpoints, graceful 429s

---

## 9. Key Implementation Notes

### 9.1 Token Storage Decision

We store JWT as Bearer token in localStorage (not httpOnly cookie) because:
1. The existing `web-transport.ts` contract already uses `localStorage.getItem('ros_api_token')`
2. Changing to cookies requires frontend changes to every fetch call
3. The frontend is a same-origin SPA — XSS risk is mitigated by CSP headers

**Mitigation:** Strict CSP headers (no inline scripts, no unsafe-eval) reduce XSS surface area.

### 9.2 Session Cleanup Cron

Add to server crontab (`/etc/cron.d/ros-server`):
```cron
0 * * * * www-data sqlite3 /var/www/ros-server/data/ros.db "DELETE FROM sessions WHERE expires_at < strftime('%s','now');"
```

### 9.3 Streaming OpenAI Responses

When `stream: true` in the request:
- Set `res.setHeader('Content-Type', 'text/event-stream')`
- Set `res.setHeader('Cache-Control', 'no-cache')`
- Pipe `openaiResponse.body` to `res` using Node.js streams
- Token counting: parse the final SSE chunk for usage stats, write to `usage_log` async

### 9.4 Cost Estimation

```typescript
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':      { input: 0.000005, output: 0.000015 },  // per token
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICING[model] ?? { input: 0.000005, output: 0.000015 }; // default to gpt-4o pricing
  return p.input * promptTokens + p.output * completionTokens;
}
```

### 9.5 `/invoke/:command` Extensibility

The invoke bridge should use a command registry pattern:

```typescript
type InvokeHandler = (args: unknown, user: AuthUser) => Promise<unknown>;

const COMMAND_REGISTRY = new Map<string, InvokeHandler>([
  ['local_runtime_status', async () => ({ ok: true, mode: 'web', version: '0.1.0' })],
  ['provider_smoke_test',  async (_, user) => ({ ok: true, user_id: user.id })],
]);

router.post('/:command', requireAuth, async (req, res) => {
  const handler = COMMAND_REGISTRY.get(req.params.command);
  if (!handler) return res.status(501).json({ error: `Unknown command: ${req.params.command}` });
  const result = await handler(req.body, req.user!);
  res.json(result);
});
```

New commands are added to the registry — no route changes needed.

---

## 10. Dependencies

### Backend (`server/package.json`)

```json
{
  "dependencies": {
    "express": "^4.18.3",
    "better-sqlite3": "^9.4.3",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.2.0",
    "zod": "^3.22.4",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/better-sqlite3": "^7.6.8",
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/cors": "^2.8.17",
    "@types/uuid": "^9.0.8",
    "typescript": "^5.4.5",
    "vitest": "^1.5.0"
  }
}
```

**Why these choices:**
- `express` over Fastify: more ecosystem, simpler middleware model, no learning curve
- `better-sqlite3` over `node-sqlite3`: synchronous API, no callback hell, better TypeScript types
- `bcryptjs` over `bcrypt`: pure JS, no native bindings to compile on deploy
- `jsonwebtoken`: battle-tested, widely used

---

## Appendix A: Invite Code Generation Script

```typescript
// server/scripts/seed-invites.ts
import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { parseArgs } from 'util';

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '10' },
    expires: { type: 'string' },
    db: { type: 'string', default: process.env.DB_PATH ?? './data/ros.db' },
  }
});

const db = new Database(values.db as string);
const stmt = db.prepare(
  'INSERT INTO invite_codes (code, created_by, expires_at, is_active) VALUES (?, ?, ?, 1)'
);

const count = parseInt(values.count as string, 10);
const expiresAt = values.expires 
  ? Math.floor(new Date(values.expires as string).getTime() / 1000) 
  : null;

for (let i = 0; i < count; i++) {
  const code = randomBytes(8).toString('hex').toUpperCase().slice(0, 12);
  stmt.run(code, 'seed', expiresAt);
  console.log(code);
}

db.close();
```

---

## Appendix B: systemd Journal Monitoring

```bash
# Live logs
journalctl -u ros-server -f

# Last 100 lines
journalctl -u ros-server -n 100

# Errors only
journalctl -u ros-server -p err

# Since last boot
journalctl -u ros-server -b
```

---

*This plan incorporates all findings from RED-TEAM-REPORT.md. See that document for the attack surface analysis and threat model that informed the security checklist and mitigations above.*
