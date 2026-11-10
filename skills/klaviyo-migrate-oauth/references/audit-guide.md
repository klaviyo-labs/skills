# Codebase Audit Guide: Finding API Key Usage

When migrating from Klaviyo private API key auth to OAuth, the first step is a complete audit of every place in the codebase that touches the API key. Don't start writing OAuth code until you know the full scope of what needs to change.

---

## What to search for

### String patterns to grep/search for

```bash
# Auth headers
grep -r "Klaviyo-API-Key" .
grep -r "Klaviyo-API-Key" . --include="*.{js,ts,py,rb,go,php,java}"

# Common env var names
grep -r "KLAVIYO_API_KEY\|KLAVIYO_PRIVATE_KEY\|KLAVIYO_KEY\|KL_API_KEY" .

# Klaviyo SDK initialization
grep -r "new Klaviyo\|Klaviyo(" .              # JS SDK
grep -r "klaviyo\.setup\|klaviyo\.api_key" .   # Python SDK
grep -r "Klaviyo.new\|klaviyo_key" .           # Ruby SDK

# Private key prefix
grep -r "pk_" . --include="*.{json,env,yml,yaml}"

# Klaviyo base URL (catches any raw fetch/requests usage)
grep -r "a\.klaviyo\.com\|klaviyo\.com/api" .
```

### Files to always check

- `.env`, `.env.local`, `.env.production`, `config.py`, `secrets.yml`, `application.yml`
- HTTP client setup files: axios instance creation, requests Session setup, custom fetch wrappers
- Middleware files: auth middleware, interceptors
- Any file named `klaviyo.js/ts/py`, `klaviyo_client.*`, `api.js`, `http.js`
- SDK initialization (usually near app startup)

---

## Categorizing what you find

Group findings into these categories:

### Category 1: API key source
Where is the key coming from?
- Env variable (good — easy to swap)
- Hardcoded string (needs to be removed)
- Config file (needs to move to env var)
- Passed as function argument (trace the call chain)

### Category 2: HTTP client setup
Where is the auth header set? This is usually the MOST IMPORTANT change — fix it here and everything downstream may work automatically.
- Axios instance with `headers: { 'Klaviyo-API-Key': ... }`
- requests.Session with `session.headers.update(...)`
- Custom fetch wrapper
- Set on every individual request (harder to change — needs a wrapper)

### Category 3: Endpoint calls
Every place that calls a Klaviyo API URL. For each:
- What endpoint? (used to determine required OAuth scope)
- Does it set its own auth header, or inherit from a shared client?

### Category 4: Revision header usage
What `revision` value is being used? Note it — you'll likely need to update this too.
- Missing entirely (must add)
- Pinned to a retired value (`2024-*` or older) — must update; a deprecated `2025-*` value should be updated
- Current: `2026-10-15`

---

## Producing the audit report

Create a summary for the user that looks like:

```
## Klaviyo API Key Audit

### API key sources
- [x] src/config.js line 12 — reads from process.env.KLAVIYO_API_KEY ✓
- [ ] src/utils/klaviyo.js line 3 — hardcoded fallback 'pk_...' ⚠️ REMOVE

### Auth header set in
- src/lib/klaviyo.js lines 15–20 — shared axios instance (CHANGE THIS ONE)
  → All other files inherit from this; only one change needed

### Endpoints being called (→ required OAuth scopes)
- GET /api/lists/ → lists:read
- POST /api/events/ → events:write
- GET /api/profiles/ → profiles:read
- PATCH /api/profiles/{id} → profiles:write
- GET /api/accounts/ → accounts:read (already required)

### Required scopes
accounts:read lists:read profiles:read profiles:write events:write

### Revision header
- Current value: '2024-10-15' (retired — upgrade to 2026-10-15)

### Files that need changes
1. src/lib/klaviyo.js — replace API key auth header with Bearer token
2. src/config.js — add KLAVIYO_CLIENT_ID, KLAVIYO_CLIENT_SECRET env vars
3. src/routes/auth.js — ADD new file: OAuth flow endpoints
4. .env — remove KLAVIYO_API_KEY, add KLAVIYO_CLIENT_ID etc.
5. .gitignore — add storage.json
```
