# RED-TEAM-REPORT.md — ResonantOS vNext Auth + API Proxy

**Red Team:** 3 adversarial architects attacking the BUILD-PLAN  
**Date:** 2026-05-20  
**Severity Scale:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## 0. Executive Summary

**Total Findings: 22**  
🔴 Critical: 4 · 🟠 High: 7 · 🟡 Medium: 7 · 🟢 Low: 4

The plan is solid architectural work. The critical findings are edge cases that could burn the OpenAI budget or expose the API key. Every finding below has been addressed — the mitigations are integrated into BUILD-PLAN.md.

---

## 1. Security: Can Someone Steal the API Key?

### FINDING-01 🔴 CRITICAL — API Key in Server Logs

**Attack:**  
The original plan doesn't specify what to log in the OpenAI proxy. If the proxy logs the upstream URL or outbound headers (common in Express debug middleware), the `Authorization: Bearer sk-proj-...` header leaks into systemd journal. Any user with `journalctl` access (or compromised monitoring) gets the key.

**Proof of concept:**
```javascript
// morgan('dev') logs: "POST https://api.openai.com/v1/chat/completions 200 412ms"
// morgan('combined') logs request headers including Authorization on outbound requests
// Any error handler that logs req.headers exposes the key
```

**Mitigation (incorporated into BUILD-PLAN):**
- Never use `morgan` on outbound upstream requests
- Never log `req.headers` in error handlers
- Scrub `Authorization` and `x-api-key` from any structured logs
- Use a dedicated logger (pino/winston) with a serializer that redacts secrets:
  ```typescript
  const redactedHeaders = (headers: Record<string,string>) => {
    const out = {...headers};
    delete out['authorization'];
    delete out['x-api-key'];
    return out;
  };
  ```
- Rotate the key immediately if logs are ever compromised (set up as muscle memory)

---

### FINDING-02 🔴 CRITICAL — API Key in Error Responses

**Attack:**  
If the OpenAI upstream returns an error and the proxy naively passes the response body through, OpenAI errors sometimes echo back request metadata including identifying information. More critically: if the backend crashes with an unhandled exception and `NODE_ENV` is not production, Express sends the full stack trace (which may include the key if it appears in a caught error's `.config` property — axios and node-fetch do this by default).

**Proof of concept (axios):**
```
AxiosError: Request failed with status 401
  at ... {
    config: {
      headers: { Authorization: 'Bearer sk-proj-YOURKEY' }  // ← leaked
    }
  }
```

**Mitigation (incorporated into BUILD-PLAN):**
- `NODE_ENV=production` MUST be set — disables Express error stack traces
- Use `node-fetch` or the native `fetch` (no axios) — native errors don't attach request config
- Global error handler: `process.on('uncaughtException', ...)` never logs the full error object — log only `err.message` and `err.code`
- Central error handler strips all non-safe fields before sending JSON response
- Set `process.env.OPENAI_API_KEY` to an empty string after use? (Don't — this breaks things; just log carefully)

---

### FINDING-03 🟠 HIGH — JWT Secret Weak or Predictable

**Attack:**  
"Generate a JWT_SECRET" in the plan is too vague. If an operator uses a short, guessable, or reused value (e.g., the word "secret", a password they use elsewhere, or a UUID), an attacker can:
1. Collect several JWTs (from account creation, login)
2. Run offline brute-force against the HMAC-SHA256 signature
3. Forge arbitrary tokens for any user, including future users

**Proof of concept:**
```bash
# hashcat on 7-character secrets takes minutes on a GPU
hashcat -a 3 -m 16500 eyJ...TOKEN...signature ?a?a?a?a?a?a?a
```

**Mitigation (incorporated into BUILD-PLAN):**
- Mandate `JWT_SECRET=$(openssl rand -hex 32)` — 256-bit entropy, unbreakable
- Document this exact command in BUILD-PLAN
- Add startup validation: if `JWT_SECRET.length < 32`, throw and refuse to start
```typescript
if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
  throw new Error('JWT_SECRET must be at least 32 bytes. Run: openssl rand -hex 32');
}
```

---

### FINDING-04 🟠 HIGH — SQLite File Web-Accessible

**Attack:**  
The nginx `root /var/www/ros-vnext` serves static files. If the server DB is placed anywhere under `/var/www/` and the nginx config has no explicit deny for `.db` files, a request to `https://resonantclaw.com/ros.db` could return the entire database: all user emails, bcrypt hashes, session tokens, usage logs.

Even if bcrypt hashes don't crack easily, email enumeration alone could be exploited for targeted phishing.

**Mitigation (incorporated into BUILD-PLAN):**
- **DB path MUST be outside nginx root:** `/var/www/ros-server/data/ros.db` — the nginx root is `/var/www/ros-vnext/`, which is a different directory. ✅ The plan already separates them, but this needs to be explicit.
- Add nginx deny rule as defense-in-depth:
  ```nginx
  location ~* \.(db|sqlite|sqlite3|sql|env|log)$ {
      deny all;
      return 404;
  }
  ```
- Verify: `curl -I https://resonantclaw.com/ros.db` → must return 404, not 200

---

## 2. Security: Can Someone Bypass Auth?

### FINDING-05 🟠 HIGH — JWT Without DB Revocation Check

**Attack:**  
The plan specifies JWT verification but the initial description doesn't make the DB revocation check mandatory on every request. A standard `jwt.verify()` check validates the signature and expiry but NOT whether the session was explicitly revoked (logged out). An attacker who steals a valid 24h JWT can use it for the full 24h window even after the victim logs out.

**Scenario:** User logs in from a shared computer, logs out, closes browser. Attacker found the token in browser history/local storage. Token is still valid for up to 24h.

**Mitigation (incorporated into BUILD-PLAN):**
- The `requireAuth` middleware MUST check DB on every request:
```typescript
export const requireAuth = (req, res, next) => {
  const payload = jwt.verify(token, JWT_SECRET); // signature + expiry
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
    .get(payload.jti, Math.floor(Date.now() / 1000));
  if (!session) return res.status(401).json({ error: 'Session expired or revoked' });
  req.user = { id: payload.sub, email: payload.email };
  next();
};
```
- SQLite synchronous check adds ~0.1ms — negligible vs. the value
- Index on `sessions(id, expires_at)` makes this a single-row B-tree lookup

---

### FINDING-06 🟡 MEDIUM — Account Enumeration via Timing Attack

**Attack:**  
If the login endpoint returns faster for non-existent emails (no bcrypt needed) than for wrong passwords (full bcrypt.compare takes ~100ms), an attacker can enumerate valid email addresses by measuring response time:
- Response in 5ms → email not in DB
- Response in 120ms → email exists (wrong password, but email is real)

**Mitigation (incorporated into BUILD-PLAN):**
```typescript
// Always run bcrypt.compare, even when user not found
const DUMMY_HASH = '$2a$12$dummy.hash.for.timing.attack.prevention.only.xxxxxxxx';
const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
const hash = user?.password_hash ?? DUMMY_HASH;
const valid = await bcrypt.compare(password, hash);
if (!user || !valid) return res.status(401).json({ error: 'Invalid credentials' });
```
- Same message for both cases: `"Invalid credentials"` — never "Email not found"

---

### FINDING-07 🟡 MEDIUM — Invite Code Brute Force

**Attack:**  
12-character alphanumeric codes have 36^12 = ~4.7 × 10^18 possibilities — computationally infeasible to brute force. BUT: if codes are generated with `Math.random()` (only 53 bits of entropy), and the attacker can observe timing of "invalid vs. used" responses (which tell them whether a code format is valid), the search space shrinks.

More realistically: if an operator generates only 20 invite codes, and each is 8 hex characters (the plan's seed script), the space is 16^8 = ~4.3 billion — brute-forceable in minutes with no rate limiting on register.

**Mitigation (incorporated into BUILD-PLAN):**
- Use `randomBytes` from Node's `crypto` module (not `Math.random()`) ✅ already in plan
- Rate limit `/auth/register` aggressively: 5 requests per 15 minutes per IP
- "Invalid invite" response must be identical timing to other validation errors (no short-circuit before bcrypt)
- Consider HMAC-signed invite codes that can be validated without a DB lookup (as future enhancement)

---

### FINDING-08 🟡 MEDIUM — Password Brute Force

**Attack:**  
The plan mentions rate limiting on login but doesn't specify account lockout. An attacker distributing requests across many IPs (residential proxy network) can try thousands of passwords without triggering per-IP rate limits.

**Mitigation (incorporated into BUILD-PLAN):**
- Track failed login attempts per email in DB:
```sql
-- Add to users table:
ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until INTEGER;  -- NULL = not locked
```
- After 10 failures in 15 min: `locked_until = NOW() + 15min`
- Check `locked_until` before bcrypt.compare
- Reset counter on successful login
- Return `429` with `Retry-After` header when locked (don't use 401 — different semantics)

---

## 3. Security: SQL Injection / XSS

### FINDING-09 🟢 LOW — SQL Injection Surface (Mitigated by Library)

**Analysis:**  
`better-sqlite3` uses prepared statements exclusively. SQL injection requires string interpolation into a query, which the API makes difficult but not impossible (developers can still write `.prepare('SELECT * FROM users WHERE id = ' + id)` if careless).

**Recommendation:**  
Create a lint rule or code review checklist item:
```typescript
// BANNED: never do this
db.exec(`SELECT * FROM users WHERE email = '${email}'`);
db.prepare(`SELECT * FROM users WHERE email = '${email}'`).get();

// REQUIRED: always use this
db.prepare('SELECT * FROM users WHERE email = ?').get(email);
```

---

### FINDING-10 🟢 LOW — XSS via Stored Data

**Attack:**  
If any API endpoint returns user-controlled strings that are rendered as HTML in the frontend (e.g., email address in the `GET /me` response rendered into a React component), and if the React component uses `dangerouslySetInnerHTML`, stored XSS is possible.

**Analysis:**  
React escapes strings by default in JSX. The risk is low unless someone uses `dangerouslySetInnerHTML`. The `/me` endpoint returns email and counts — no rich text.

**Mitigation:**  
- Set CSP header: `Content-Security-Policy: default-src 'self'; script-src 'self'` — blocks inline scripts and external script sources even if XSS occurs
- Never use `dangerouslySetInnerHTML` with data from `/me` response

---

## 4. Cost Exposure: Can Someone Burn the Budget?

### FINDING-11 🔴 CRITICAL — Rate Limit Bypass via Multiple Accounts

**Attack:**  
The per-user daily limit is 50 messages. But if invite codes are used to create many accounts, an attacker can create N accounts × 50 messages = unlimited API spend. With 20 invite codes, that's 1000 messages per day. At GPT-4o pricing (~$0.15 per 1k tokens, 4000 tokens max), worst case: 1000 × 4000 / 1000 × $0.15 = **$600/day**.

**Mitigation (incorporated into BUILD-PLAN):**
- Invite codes are single-use ✅ (plan already specifies this)
- Add per-invite-batch spend tracking: when total monthly spend across all users exceeds threshold, pause ALL requests and alert operator
- Add `MONTHLY_SPEND_LIMIT_USD` env var (default $50) — hard cutoff
- Alert mechanism: when 80% of budget consumed, log warning; at 100%, return 503 with "Service temporarily unavailable"
```typescript
// In chat route, before proxying:
const monthlySpend = getMonthlySpend(); // SUM(cost_usd) from usage_log this month
if (monthlySpend >= MONTHLY_SPEND_LIMIT_USD) {
  return res.status(503).json({ error: 'Service at capacity. Please try again later.' });
}
```

---

### FINDING-12 🔴 CRITICAL — Rate Limit Check-Then-Act Race Condition

**Attack:**  
The per-user daily cap check is:
1. `SELECT COUNT(*) FROM usage_log WHERE user_id = ? AND created_at > today`
2. If count < 50, proceed with OpenAI call
3. Insert into usage_log

Steps 1-3 are NOT atomic. Under concurrent requests (user has multiple browser tabs, or a script sending parallel requests), the count check in step 1 can pass in multiple concurrent requests before any of them complete step 3. Result: user sends 50 × N_concurrent requests.

**Proof of concept:**
```bash
# Send 10 parallel requests simultaneously — all pass the "count < 50" check
for i in {1..10}; do
  curl -s -X POST https://resonantclaw.com/api/chat/completions \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}' &
done
wait
```

**Mitigation (incorporated into BUILD-PLAN):**

SQLite serializes writes, but the read-check-then-write pattern still has a race window. Solution: use a database-level atomic increment with a constraint check:

```sql
-- Option A: Atomic counter table (preferred)
CREATE TABLE IF NOT EXISTS daily_counters (
  user_id    TEXT NOT NULL,
  day        TEXT NOT NULL,   -- YYYY-MM-DD
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Atomic increment with limit check:
-- This runs as a single SQLite write (serialized):
INSERT INTO daily_counters (user_id, day, count) VALUES (?, date('now'), 1)
ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1
WHERE count < 50;
-- If count was already at 50, the UPDATE's WHERE clause fails → 0 rows changed → reject
```

Implementation:
```typescript
const result = db.prepare(`
  INSERT INTO daily_counters (user_id, day, count) VALUES (?, date('now'), 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1
  WHERE count < ?
`).run(userId, DAILY_LIMIT);

if (result.changes === 0) {
  return res.status(429).json({ error: 'Daily limit reached' });
}
// Proceed with OpenAI call
// If OpenAI fails, decrement counter (best-effort):
// db.prepare('UPDATE daily_counters SET count = count - 1 WHERE user_id = ? AND day = date("now")').run(userId);
```

---

### FINDING-13 🟠 HIGH — Token Counting Unreliable for Streaming

**Attack:**  
For streaming responses (`stream: true`), the plan notes "parse the final SSE chunk for usage stats." The final chunk with usage data is optional and can be absent in some OpenAI API versions/configurations. If token counting fails silently:
1. `usage_log` has NULL or 0 for tokens
2. The daily message counter (FINDING-12's fix) still increments, but actual token spend is untracked
3. `monthly_spend` calculation is wrong → spend cap (FINDING-11's fix) doesn't work

**Mitigation (incorporated into BUILD-PLAN):**
- Always request `stream_options: { include_usage: true }` when streaming (OpenAI API v1 feature)
- If usage chunk is absent (older API behavior), estimate token count from character count: `Math.ceil(charCount / 4)`
- Log `{ estimated: true }` when using estimates
- For the spend cap (FINDING-11), add 10% buffer when using estimated counts

---

### FINDING-14 🟡 MEDIUM — No Request Timeout to OpenAI

**Attack:**  
If OpenAI is slow or hanging (not uncommon during incidents), the `/chat/completions` endpoint holds the connection open indefinitely. With enough concurrent slow requests, the event loop backs up, memory spikes, and the service goes OOM or becomes unresponsive for all users — including auth endpoints.

**Mitigation (incorporated into BUILD-PLAN):**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30s

try {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    ...options,
    signal: controller.signal,
  });
} catch (err) {
  if (err.name === 'AbortError') {
    // Decrement counter if we incremented it
    return res.status(504).json({ error: 'AI service timeout. Please try again.' });
  }
  throw err;
} finally {
  clearTimeout(timeout);
}
```

---

## 5. Failure Modes

### FINDING-15 🟠 HIGH — OpenAI Is Down — No Graceful Degradation

**Attack (failure mode):**  
When OpenAI returns 503, 429 (their rate limit), or is unreachable, the current plan passes the error back to the frontend but doesn't:
1. Distinguish between "user's fault" vs. "upstream fault" errors
2. Avoid decrementing the user's daily message count (they shouldn't be penalized)
3. Return a user-friendly message

**Mitigation (incorporated into BUILD-PLAN):**
```typescript
// Categorize upstream errors:
if (openaiResponse.status === 503 || openaiResponse.status === 529) {
  // OpenAI overloaded — decrement user counter, return 503
  decrementDailyCounter(userId);
  return res.status(503).json({ 
    error: 'AI service temporarily unavailable. Your message limit was not used.',
    retry_after: 60
  });
}
if (openaiResponse.status === 429) {
  // OpenAI rate limiting our API key — this is our problem
  decrementDailyCounter(userId);
  return res.status(429).json({ error: 'Service at capacity. Please try again in a moment.' });
}
```

---

### FINDING-16 🟡 MEDIUM — DB Corruption / WAL Lock

**Attack (failure mode):**  
If the process crashes mid-write (power loss, OOM kill, SIGKILL), SQLite in WAL mode can be left in a partially-committed state. On restart, WAL recovery runs automatically, but if the WAL file is corrupt, the DB refuses to open and the entire service is down.

**Mitigation (incorporated into BUILD-PLAN):**
- **Backups:** daily cron `sqlite3 /var/www/ros-server/data/ros.db ".backup /var/backups/ros-$(date +%Y%m%d).db"`
- **Integrity check:** on startup, run `PRAGMA integrity_check;` — if not `ok`, log critical alert and refuse to start (better to fail fast than silently corrupt more data)
- **WAL checkpoint:** configure `PRAGMA wal_autocheckpoint = 100` (checkpoint every 100 pages) to prevent WAL file from growing large
- **systemd `Restart=on-failure`** handles transient crashes ✅ already in plan

---

### FINDING-17 🟡 MEDIUM — JWT Secret Rotation / Loss

**Attack (failure mode):**  
If `JWT_SECRET` is lost (env var not saved, file deleted), ALL existing user sessions become invalid simultaneously. Every user gets logged out with no warning. If the secret is accidentally rotated (new `.env` deployed), same effect.

**Mitigation (incorporated into BUILD-PLAN):**
- Store `JWT_SECRET` in `/var/www/ros-server/.env` AND in a backup location (password manager, encrypted note)
- On deployment, diff `.env` against previous version before applying
- Consider graceful rotation: support `JWT_SECRET_PREVIOUS` env var — verify against both secrets during a 24h overlap window

---

### FINDING-18 🟡 MEDIUM — No Monitoring / No Alerting

**Attack (failure mode):**  
The service crashes and nobody knows for hours. No monitoring means:
- Users get connection refused and think the site is broken
- Budget burn continues if the crash is in auth middleware only (chat endpoint still running)
- No visibility into error rates, latency spikes, or DB lock waits

**Mitigation (incorporated into BUILD-PLAN):**
- Add a simple health endpoint: `GET /health` → `200 { "ok": true, "db": "connected", "uptime": 12345 }`
- Hetzner monitoring: set up HTTP check on `https://resonantclaw.com/api/health` every 1 minute
- Alert destination: email / Discord webhook when check fails 3 consecutive times
- Log ERROR-level events to stderr (systemd journal) for later triage
- Optional: UptimeRobot (free tier, 50 monitors, 5min interval) for external monitoring

---

## 6. Edge Cases

### FINDING-19 🟡 MEDIUM — Concurrent Register Race (Duplicate Email)

**Attack:**  
Two requests register with the same email simultaneously. Both pass the "email uniqueness" check at the application layer. The `INSERT` races — SQLite's `UNIQUE` constraint on `users.email` prevents a duplicate, but the first inserted gets a cryptic "UNIQUE constraint failed" error instead of a clean 409.

**Mitigation (incorporated into BUILD-PLAN):**
```typescript
try {
  db.prepare('INSERT INTO users ...').run(...);
} catch (err) {
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'Email already registered' });
  }
  throw err;
}
```
Wrap ALL inserts in constraint-aware error handling. Don't rely on pre-check queries.

---

### FINDING-20 🟠 HIGH — No CORS Enforcement Allows Cross-Origin Token Theft

**Attack:**  
Without strict CORS, any website can make cross-origin requests to the `/auth/login` endpoint. More critically, a malicious page at `http://evil.com` can make a request to `https://resonantclaw.com/api/me` with the user's cookies/auth. Since we use `Authorization: Bearer` (not cookies), this is lower risk — but the preflight check still matters.

**Mitigation (incorporated into BUILD-PLAN):**
```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ?? 'https://resonantclaw.com',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,  // We use Bearer, not cookies
}));
```
- `ALLOWED_ORIGIN` env var set to `https://resonantclaw.com` in production
- For local dev: `ALLOWED_ORIGIN=http://localhost:1430`
- Never use `origin: '*'` — that defeats the purpose entirely

---

### FINDING-21 🟢 LOW — Large Request Body DoS

**Attack:**  
An attacker sends a `/chat/completions` request with a 100MB body. Node.js reads the entire body into memory before Express can parse it, causing OOM.

**Mitigation (incorporated into BUILD-PLAN):**
```typescript
import express from 'express';
app.use(express.json({ limit: '512kb' })); // Reject bodies > 512KB
```
A 4000-token message in JSON is at most ~25KB. 512KB limit is 20× headroom.

---

### FINDING-22 🟢 LOW — Insufficient Log Rotation

**Attack (failure mode):**  
`journald` has default log retention limits but if the server is a low-cost Hetzner box (20GB disk), and the application is verbose, logs could fill the disk over weeks, causing the server to stop accepting writes — including DB writes.

**Mitigation:**
- Set in `/etc/systemd/journald.conf`:
  ```ini
  SystemMaxUse=500M
  SystemKeepFree=1G
  ```
- Verify disk space monitoring is in place (see FINDING-18)

---

## 7. Deployment Risks

### DEPLOY-01 🟠 HIGH — Backend Crashes Leave Frontend Broken (No Circuit Breaker)

**Attack (failure mode):**  
Backend crashes. Users see the login page but every form submission returns 502. There's no "backend down" message, just a generic network error. Users churn without understanding what's happening.

**Mitigation:**  
- The `LoginGate.tsx` should detect network errors (not just API errors) and show: "Service temporarily unavailable. Please try again in a moment."
- Distinguish between `err.message === 'Failed to fetch'` (backend down) vs. `res.status === 401` (wrong credentials)
- systemd `Restart=on-failure; RestartSec=5` handles most crashes ✅ already in plan

---

### DEPLOY-02 🟠 HIGH — Frontend Build Without VITE_API_BASE Set

**Attack (human error):**  
Developer runs `npm run build` without the `VITE_API_BASE` env var set. The build succeeds but deploys a version where `isWebMode()` returns `false` — every user gets dropped straight into the app without authentication, and any API call fails silently.

**Mitigation:**  
Add a Vite plugin / build check:
```typescript
// vite.config.ts — add to plugins:
{
  name: 'check-web-env',
  buildStart() {
    if (process.env.VITE_API_BASE === undefined) {
      console.warn('[WARNING] VITE_API_BASE not set — building in Tauri mode (no auth gate)');
    }
  }
}
```
Better: create a `Makefile` or `package.json` script for web builds:
```json
"build:web": "VITE_API_BASE=https://resonantclaw.com/api VITE_WS_BASE=wss://resonantclaw.com npm run build"
```
Use `build:web` for all server deployments, never raw `npm run build`.

---

### DEPLOY-03 🟡 MEDIUM — No Rollback Plan

**Failure mode:**  
New backend version breaks auth. All users get 500s. No rollback procedure documented.

**Mitigation:**  
Before each deploy:
```bash
# Tag current backend dist
cp -r /var/www/ros-server/dist /var/www/ros-server/dist.backup
# Tag current frontend
cp -r /var/www/ros-vnext /var/www/ros-vnext.backup
```

Rollback procedure:
```bash
systemctl stop ros-server
cp -r /var/www/ros-server/dist.backup /var/www/ros-server/dist
systemctl start ros-server
# Verify health
curl https://resonantclaw.com/api/health
```

---

## 8. Summary Table

| ID | Severity | Category | Finding | Mitigation Status |
|----|---------|----------|---------|------------------|
| F-01 | 🔴 Critical | API Key Leak | Key in server logs | ✅ In BUILD-PLAN §7.1 |
| F-02 | 🔴 Critical | API Key Leak | Key in error responses | ✅ In BUILD-PLAN §7.1 |
| F-03 | 🟠 High | Auth | Weak JWT secret | ✅ In BUILD-PLAN §7.1 |
| F-04 | 🟠 High | Auth | DB file web-accessible | ✅ In BUILD-PLAN §6.1 |
| F-05 | 🟠 High | Auth Bypass | No JWT revocation check | ✅ In BUILD-PLAN §4 |
| F-06 | 🟡 Medium | Auth Bypass | Email enumeration timing | ✅ In BUILD-PLAN §7.2 |
| F-07 | 🟡 Medium | Auth Bypass | Invite code brute force | ✅ In BUILD-PLAN §7.5 |
| F-08 | 🟡 Medium | Auth Bypass | Password brute force | ✅ In BUILD-PLAN §7.5 |
| F-09 | 🟢 Low | Injection | SQL injection surface | ✅ In BUILD-PLAN §7.4 |
| F-10 | 🟢 Low | XSS | Stored XSS via email | ✅ In BUILD-PLAN §7.6 |
| F-11 | 🔴 Critical | Cost | Multi-account budget burn | ✅ In BUILD-PLAN §3.3 |
| F-12 | 🔴 Critical | Cost | Rate limit race condition | ✅ In BUILD-PLAN §3.3 |
| F-13 | 🟠 High | Cost | Unreliable stream token count | ✅ In BUILD-PLAN §9.3 |
| F-14 | 🟡 Medium | Cost | No request timeout to OpenAI | ✅ In BUILD-PLAN §3.3 |
| F-15 | 🟠 High | Failure | OpenAI down, no graceful degradation | ✅ In BUILD-PLAN §3.3 |
| F-16 | 🟡 Medium | Failure | DB corruption / WAL lock | ✅ In BUILD-PLAN §8 (test plan) |
| F-17 | 🟡 Medium | Failure | JWT secret loss/rotation | ✅ In BUILD-PLAN §6.1 |
| F-18 | 🟡 Medium | Failure | No monitoring | ✅ In BUILD-PLAN §6.7 |
| F-19 | 🟡 Medium | Edge Case | Concurrent register race | ✅ In BUILD-PLAN §2 |
| F-20 | 🟠 High | Edge Case | No CORS enforcement | ✅ In BUILD-PLAN §7.6 |
| F-21 | 🟢 Low | Edge Case | Large body DoS | ✅ In BUILD-PLAN §9.4 |
| F-22 | 🟢 Low | Deployment | Log rotation/disk fill | ✅ In BUILD-PLAN §7.9 |
| D-01 | 🟠 High | Deployment | No circuit breaker on backend crash | ✅ In BUILD-PLAN §5.3 |
| D-02 | 🟠 High | Deployment | Frontend built without VITE_API_BASE | ✅ In BUILD-PLAN §6.6 |
| D-03 | 🟡 Medium | Deployment | No rollback plan | ✅ In BUILD-PLAN §6.2 |

---

## 9. Red Team Verdict

The plan is ship-quality after mitigations. The top 4 critical items:

1. **F-12 (Race condition on rate limit)** — The `UPSERT WHERE count < N` pattern is the correct fix. Any other approach has the race.
2. **F-11 (Multi-account budget burn)** — Monthly spend cap is the safety net. Invites being single-use is necessary but not sufficient.
3. **F-01 / F-02 (API key in logs)** — Review logging setup before any production deploy. One `console.log(config)` can expose the key.

**Recommended first action:** Write the `/chat/completions` handler last, after the atomic rate-limit counter (F-12 fix) is tested and verified working. Don't ship an OpenAI proxy with a racy counter.

**One thing the plan does right:** Using `better-sqlite3` (synchronous) means the UPSERT atomic counter pattern works cleanly — no async gap between the read and the write. This is actually safer than a Postgres solution would be without explicit transactions.

---

*Red Team report complete. All findings incorporated into BUILD-PLAN.md revision.*
