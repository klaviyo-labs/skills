---
name: klaviyo-new-oauth
description: >
  Use this skill when someone is building a brand new Klaviyo integration using OAuth from scratch.
  Triggers when a user says things like "I want to integrate with Klaviyo", "help me build a Klaviyo OAuth app",
  "I need to connect my app to Klaviyo", "how do I set up Klaviyo OAuth", or shares a codebase and asks
  how to add Klaviyo as an integration. Covers: creating an OAuth app, selecting scopes, implementing the
  PKCE flow, token storage, making API calls with Bearer tokens, and revision header requirements.
---

# Klaviyo New OAuth Integration Skill

You are a Klaviyo integration expert. Your job is to guide developers through building a complete, production-ready Klaviyo OAuth integration from scratch. You adapt to whatever language and framework the user is working in — match their stack exactly. When in doubt, ask.

Work through the steps below in order, but adapt based on what the user already has. If they share existing code, read it first to understand their stack before prescribing anything.

---

## Step 0 — Understand their situation

Before writing any code, ask or infer:
- What language and framework are they using? (Node.js/Express, Python/Flask, Ruby/Rails, etc.)
- What do they want to DO with Klaviyo? (sync profiles, send campaigns, track events, read lists, etc.)
- Do they already have a Klaviyo account with admin access?
- Are they building for a single account (internal tool) or multi-tenant (SaaS / marketplace app)?

If they share a codebase, **read the relevant files first** to understand:
- What language/framework/package manager they use
- How their server is structured (routes, middleware)
- Whether they have any existing HTTP client setup or auth patterns
- Where they currently store config/secrets

---

## Step 1 — Determine required scopes

Read `references/scopes.md` now for the full scope reference table.

Ask the user what Klaviyo APIs they plan to call, or look at their existing code to figure it out. Then:

1. Map their use cases to the minimum required scopes using the table in `references/scopes.md`
2. **Always include `accounts:read`** — it is required for every OAuth app
3. Present the scope list to the user and explain what each one grants
4. Warn them: requesting unnecessary scopes will get their app rejected from the Klaviyo marketplace

Give them the scope string they'll need — space-separated:
```
accounts:read lists:read profiles:write events:write
```

The app is created with these scopes in Step 2. If they change later, update the app's scopes too (in the Klaviyo UI, or with the beta Update Application API), or the OAuth flow will be refused.

---

## Step 2 — Create the OAuth app in Klaviyo

First work out, from the user's code or by asking:
- the **redirect URI** their server will handle the callback on: `http://localhost:3001/api/auth/callback` for a new project, or the port and path their server already uses. Add the production one too if they know it.
- the **scopes** from Step 1.
- a **title** for the app, as account users will see it when they connect it.

Then create the app one of two ways. Either way, **never ask the user to paste the Client Secret into the chat**: anything in the conversation can end up in logs and transcripts.

### Option A: create it through the API (preferred)

Klaviyo's Create Application endpoint is in **beta** (revision `2026-10-15.pre`), so tell the user that before you use it. It needs a **private API key with the `applications:write` scope** from the account that will own the app.

1. Ask the user to set the key in their shell, not in the chat: `export KLAVIYO_API_KEY=pk_...`. If they don't have one with `applications:write`, use Option B.
2. Run `scripts/create-oauth-app.mjs` (Node 18+, no dependencies) from the project root:
   ```bash
   node create-oauth-app.mjs \
     --title "<app title>" \
     --redirect-uri http://localhost:3001/api/auth/callback \
     --scopes "accounts:read lists:read profiles:write events:write"
   ```
   For several redirect URIs, separate them with commas.
3. The script:
   - generates a throwaway RSA key pair and sends only its public half
   - calls `POST https://a.klaviyo.com/api/applications` with the title, redirect URIs and scopes
   - decrypts the client secret Klaviyo returns (encrypted to that key, and returned only once)
   - writes `KLAVIYO_CLIENT_ID`, `KLAVIYO_CLIENT_SECRET` and `KLAVIYO_REDIRECT_URI` to `.env`, readable only by its owner

   It prints the app's ID and client ID, never the secret.
4. If it fails, show the user the error it prints. A `403` usually means the key lacks `applications:write`. If the app was created but the secret couldn't be decrypted, the app must be deleted and created again, because the secret can't be fetched a second time.

The app starts as a **draft**: it works for the account that owns it, which is all local development needs. Listing it on the Klaviyo marketplace is a separate review.

### Option B: create it in the Klaviyo UI

If there's no key with `applications:write`, or the API call fails, have the user create the app themselves:

1. Go to **https://www.klaviyo.com/manage-apps** (they must be an account Owner, Admin, or Manager).
2. Click **Create app**, and fill in the app name and description.
3. Under **OAuth settings**, set the **Redirect URI(s)** to exactly the URLs above. Add both the local and production ones now.
4. Set **Client type** to **Confidential**, and add the scopes from Step 1.
5. After creating, note the **Client ID**, and save the **Client Secret** somewhere secure: Klaviyo shows it only once.

Then:

1. Create or update the `.env` file in the project root, preserving any existing contents, with these entries and placeholder values:
   ```
   KLAVIYO_CLIENT_ID=
   KLAVIYO_CLIENT_SECRET=
   KLAVIYO_REDIRECT_URI=http://localhost:3001/api/auth/callback
   ```
2. Ask the user to paste their **Client ID** and **Client Secret** into `.env` themselves, then tell you when they're done.

### Either way

> **Note on redirect URIs**: Klaviyo also allows installation from its own marketplace — meaning the redirect must work from `klaviyo.com` subdomains too, not just your own domain. For local dev this doesn't apply, but flag it for production.

Check that both values are set without printing them, for example `grep -cE '^KLAVIYO_CLIENT_(ID|SECRET)=.+' .env` should print `2`. Do not proceed until both are set.

Remind the user: never hardcode these values in source files.

Also ensure `.env` is in `.gitignore` — add it if it isn't already.

**Wire up dotenv** — env vars in `.env` are not automatically loaded in Node.js. Install and initialize dotenv:

```bash
npm install dotenv
```

Then add this as the **very first line** of `server.js` (before any imports that read `process.env`):

```javascript
// ESM (package.json has "type": "module")
import 'dotenv/config';

// CommonJS (no "type": "module")
require('dotenv').config();
```

Check `package.json` — if it has `"type": "module"`, use the ESM form; otherwise use `require`. This applies whether they run `node server.js` or `npm run dev`.

Do not proceed to Step 3 until you have written the `.env` file and wired up dotenv.

---

## Step 3 — Implement token storage

Read `references/storage.md` now.

Before implementing the OAuth flow, set up storage — you need somewhere to persist tokens.

- **Local dev / getting started quickly**: Use `storage.json` — implement it now using the pattern in `references/storage.md`
- **Production**: Use an encrypted database column or secret manager — call this out with a `TODO` comment if you're setting up local dev storage for now

Key things to store: `accessToken`, `refreshToken`, `expiresAt`, `accountId`, `accountName`.

Also set up PKCE state storage (lives for only ~5 minutes during the OAuth flow):
- Local dev: same `storage.json` file with a `pkce` key
- Production: Redis with short TTL or server-side session

If the codebase already has a database or session layer, use it — don't add storage.json if something better exists.

---

## Step 4 — Implement the PKCE OAuth flow

Read `references/pkce-examples.md` now for complete, copy-paste implementations in the user's language.

The flow has three parts:

### Part A: Auth start endpoint (GET /auth/start or equivalent)

1. Generate `codeVerifier`, `codeChallenge` (SHA-256 of verifier, base64url), and `state` (CSRF token)
2. Store `{ codeVerifier, state }` in your PKCE storage (cleared after callback)
3. Build the authorization URL — always uses `https://www.klaviyo.com/oauth/authorize`
4. Redirect the user (or return the URL to the frontend to redirect)

Required URL parameters:
```
response_type=code
client_id=<KLAVIYO_CLIENT_ID>
redirect_uri=<KLAVIYO_REDIRECT_URI>
scope=<space-separated scopes>
state=<random state>
code_challenge=<sha256 of verifier, base64url>
code_challenge_method=S256
```

### Part B: Callback endpoint (GET /auth/callback or equivalent)

This is where Klaviyo sends the user after they authorize.

1. Check for `?error` param — if present, show the user a clear error (e.g., "access_denied")
2. Verify `state` matches what you stored — return 400 if not (CSRF protection)
3. Retrieve `codeVerifier` from storage using the state as key
4. Exchange the code for tokens via `POST https://a.klaviyo.com/oauth/token`:
   - Add `Authorization: Basic base64(client_id:client_secret)` header
5. Store the returned `access_token`, `refresh_token`, `expires_at = now + expires_in * 1000`
6. Clear PKCE state from storage
7. Immediately fetch account info (GET /accounts/) to verify the token works and get account details
8. Redirect to your app's connected/dashboard state

> **Critical URL note**: Token exchange goes to `https://a.klaviyo.com/oauth/token` — NOT `www.klaviyo.com`. Using `www` for token calls is blocked by Klaviyo as of March 31, 2025.

### Part C: Token refresh

Wire this into a `getFreshToken()` function that is called before **every** API request:

1. Check if `expiresAt - now < 5 minutes`
2. If so, POST to `https://a.klaviyo.com/oauth/token` with `grant_type=refresh_token`
3. Update stored tokens with the new values (refresh token may or may not rotate — always use whatever comes back)
4. On `invalid_grant` error: the user has uninstalled or the refresh token expired (90-day inactivity limit) → clear stored tokens and surface a "reconnect required" error to the user
5. Return the valid access token

---

## Step 5 — Add a disconnect endpoint

Users must be able to disconnect. When they do:
1. Call `POST https://a.klaviyo.com/oauth/revoke` with the access token (best-effort — don't throw on failure)
2. Clear all stored tokens from your storage
3. Return the user to the disconnected/login state

---

## Step 6 — Make API calls with Bearer token

Read `references/api-calls.md` now for the reusable API client pattern and examples.

The key change from API key auth:
```
// Before
Authorization: Klaviyo-API-Key pk_xxxxxxx

// After
Authorization: Bearer <access_token>
```

Build one central API client that:
- Calls `getFreshToken()` before every request (auto-refresh)
- Sets `Authorization: Bearer <token>`
- Sets `revision: 2026-10-15` on every request
- Handles errors and surfaces useful messages

Show them example calls for the endpoints they said they'd be using.

---

## Step 7 — Revision header audit

Always flag the revision header. Current stable revision: **`2026-10-15`**

- Revisions follow a 2-year lifecycle: 1 year stable → 1 year deprecated → retired (410 errors)
- Any revision from 2024 or earlier is retired, and `2025-*` revisions are deprecated
- Use `X-Klaviyo-Revision-Fall-Forward-Opt-Out: 1` if you want explicit errors instead of silent fall-forward on a retired revision
- Tell the user to plan for a revision update every 12–18 months

---

## Step 8 — Final checklist

Before wrapping up, run through this with the user:

- [ ] OAuth app created in Klaviyo with correct redirect URIs and scopes (through the API or the UI)
- [ ] `KLAVIYO_CLIENT_ID` and `KLAVIYO_CLIENT_SECRET` in environment variables
- [ ] `dotenv` installed and `import 'dotenv/config'` (or `require('dotenv').config()`) is the first line of `server.js` — otherwise env vars will be `undefined` at runtime
- [ ] `storage.json` gitignored (or production storage in place)
- [ ] Auth start endpoint working — generates PKCE, redirects to Klaviyo
- [ ] Callback endpoint working — exchanges code, stores tokens, verifies with `/accounts/`
- [ ] Token refresh working — proactive refresh before expiry, handles `invalid_grant`
- [ ] Disconnect endpoint working — revokes token, clears storage
- [ ] All API calls use `Bearer` token (not API key)
- [ ] All API calls include `revision: 2026-10-15`
- [ ] `TODO: production storage` comment left if using `storage.json` for now

---

## Common mistakes to proactively catch

1. **`www.klaviyo.com` for token calls** — must be `a.klaviyo.com` for `/oauth/token` and `/oauth/revoke`
2. **Tokens returned to the browser** — access/refresh tokens should never appear in frontend API responses
3. **No `invalid_grant` handling** — if refresh fails and you don't catch it, users silently break
4. **Requesting new tokens before every call** — always reuse the stored token until it's near expiry
5. **Hardcoded client secret** — must live in env vars or secret manager, never in source code
6. **Missing `revision` header** — every Klaviyo API call requires it
7. **Scope mismatch** — 403 errors usually mean the scope wasn't added in the Klaviyo app settings
8. **State not verified on callback** — skipping CSRF check is a security vulnerability
9. **Missing dotenv initialization** — setting vars in `.env` does nothing unless `dotenv.config()` runs before the first `process.env` read. If `client_id` or `client_secret` are `undefined` at runtime, this is the first thing to check. The import/require must be at the TOP of the entry file, before any routes or config that reads env vars.

---

## Reference files

- `references/scopes.md` — Full scope table and common integration patterns
- `references/pkce-examples.md` — Copy-paste PKCE implementations in Node.js and Python
- `references/storage.md` — Token storage patterns (storage.json, database, Redis)
- `references/api-calls.md` — Reusable API client code and common endpoint examples
- `scripts/create-oauth-app.mjs` — Creates the OAuth app through the beta Create Application API and writes its credentials to `.env` (Step 2, Option A)
