# Token Storage Guide

## The goal
You need to store three things per connected account:
1. `access_token` — used in every API call (`Authorization: Bearer <token>`)
2. `refresh_token` — used to get a new access token when it expires
3. `expires_at` — timestamp (epoch ms) so you know when to refresh proactively

---

## Recommended approach by environment

### Local development → storage.json (fastest to get running)

For local dev and demos, a JSON file is the simplest option. **Always gitignore it** since it contains live tokens.

**Schema:**
```json
{
  "connection": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1712345678000,
    "lastRefreshedAt": 1712345000000,
    "accountId": "XXXXXXXXXX",
    "accountName": "Example Store",
    "accountEmail": "owner@example.com"
  },
  "pkce": {
    "codeVerifier": "...",
    "state": "..."
  }
}
```

**Node.js implementation:**
```javascript
import fs from 'fs';
import path from 'path';

const STORAGE_PATH = path.join(process.cwd(), 'storage.json');
const DEFAULT = { connection: null, pkce: null };

function read() {
  try { return JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf-8')); }
  catch { return { ...DEFAULT }; }
}
function write(data) {
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(data, null, 2));
}

export const storage = {
  getConnection: () => read().connection,
  setConnection: (conn) => write({ ...read(), connection: conn }),
  clearConnection: () => write({ ...read(), connection: null }),
  getPkce: () => read().pkce,
  setPkce: (pkce) => write({ ...read(), pkce }),
  clearPkce: () => write({ ...read(), pkce: null }),
};
```

**Important:** Add `storage.json` to `.gitignore` — it contains live OAuth tokens.

---

### Production → Database (recommended)

For multi-user apps or production deployments, store tokens in your database encrypted at rest.

**Minimum schema (SQL example):**
```sql
CREATE TABLE klaviyo_connections (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE,     -- your app's user identifier
  access_token  TEXT NOT NULL,            -- encrypted
  refresh_token TEXT NOT NULL,            -- encrypted
  expires_at    BIGINT NOT NULL,          -- epoch milliseconds
  account_id    TEXT,
  account_name  TEXT,
  account_email TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Key requirements:**
- Encrypt `access_token` and `refresh_token` at rest (AES-256 or your platform's secret manager)
- Never return raw tokens to the frontend
- Index on `user_id` for fast lookups

---

### Production → Redis (for session-based or high-throughput apps)

Redis works well if you already use it and tokens are per-session rather than per-user-account.

```javascript
// Store connection
await redis.set(
  `klaviyo:${userId}`,
  JSON.stringify({ accessToken, refreshToken, expiresAt }),
  'EX', 90 * 24 * 60 * 60  // 90-day TTL matches refresh token lifetime
);

// Retrieve
const raw = await redis.get(`klaviyo:${userId}`);
const conn = raw ? JSON.parse(raw) : null;
```

---

## PKCE state: where to store it during the flow

PKCE `codeVerifier` and `state` only need to live for the duration of the OAuth flow (typically < 5 minutes).

| Environment | Recommendation |
|-------------|---------------|
| Local dev | `storage.json` (cleared after callback) |
| Single-server prod | Server-side session (express-session, Flask session) |
| Multi-server prod | Redis with short TTL (10–15 min) |

**Never store PKCE state in a browser cookie or localStorage** — it could be intercepted.

---

## What to call out when no storage exists

If you're working in a codebase with no existing token storage, tell the user:

> "I'll set up `storage.json` for local development so we can get you running quickly. Before you go to production, you'll want to move token storage to an encrypted database or secret manager — I've left a `TODO` comment marking exactly where that swap needs to happen."

Then implement the `storage.json` approach and add a clearly marked `TODO: production storage` comment in the storage module.
