---
name: klaviyo-migrate-oauth
description: >
  Use this skill when someone has an existing Klaviyo integration using a private API key and wants
  to migrate it to OAuth. Triggers when a user says things like "migrate my Klaviyo integration to OAuth",
  "convert from API key to OAuth", "I'm using Klaviyo-API-Key and need to switch to OAuth",
  "Klaviyo is requiring OAuth for the marketplace", or shares a codebase with Klaviyo-API-Key usage
  and asks how to convert it. Covers: auditing existing API key usage, mapping endpoints to OAuth scopes,
  creating the OAuth app, implementing PKCE, swapping auth headers, updating revision headers, and
  handling existing users through the transition.
---

# Klaviyo API Key → OAuth Migration Skill

You are a Klaviyo integration expert. Your job is to guide developers through migrating an existing Klaviyo private API key integration to OAuth 2.0 with PKCE. This is a multi-step process — work through it methodically, starting with a full audit before changing any code.

Always match the user's existing language and framework. Read their code before prescribing solutions.

---

## Step 0 — Read the codebase first

**Before writing a single line of code**, ask the user to share their codebase (or read it if already available). You need to understand:

1. What language/framework/runtime are they using?
2. Where is the Klaviyo API key currently set? (env var, hardcoded, config file)
3. How is the auth header set? (shared HTTP client, per-request, SDK)
4. Which Klaviyo endpoints are being called?
5. What `revision` header value are they using (if any)?
6. Do they have any existing token storage, session management, or database?

If they can't share the full codebase, ask them to paste:
- Their HTTP client setup / Klaviyo wrapper
- Their `.env` file structure (values redacted is fine)
- A list of Klaviyo endpoints they call

---

## Step 1 — Full codebase audit

Read `references/audit-guide.md` now for search patterns and how to structure the audit report.

Run a thorough audit of the codebase to find:
- Every place `Klaviyo-API-Key` is set as an auth header
- Every Klaviyo API endpoint being called (needed to determine scopes)
- The current `revision` header value(s) in use
- Where the API key comes from (env var ideally, or hardcoded)
- Any existing token storage infrastructure

**Produce an audit report** for the user (see `references/audit-guide.md` for the format) that lists:
- All files that need to change, with line numbers
- The minimal OAuth scope set required based on endpoints used
- Whether the revision header needs updating
- Whether any storage infrastructure needs to be added

Show this to the user and get confirmation before proceeding to code changes.

---

## Step 2 — Create the OAuth app in Klaviyo

Tell the user to complete these steps in the Klaviyo UI **before you change any code**:

1. Go to **https://www.klaviyo.com/manage-apps** (requires Owner, Admin, or Manager role)
2. Click **Create app**
3. Fill in app name and description
4. Under **OAuth settings**, set **Redirect URI(s)**:
   - Local dev: `http://localhost:3001/api/auth/callback` (match their existing server port/path)
   - Production: `https://yourdomain.com/api/auth/callback`
   - Add both now — they can be updated later if needed
5. Set **Client type** to **Confidential**
6. Add the **scopes** you identified in Step 1 (from your audit)
7. Copy the **Client ID** and **Client Secret**

**PAUSE HERE.** Before writing any code, the project needs the app's credentials in `.env`. **Never ask the user to paste the Client Secret into the chat**: anything in the conversation can end up in logs and transcripts.

1. Create or update the `.env` file in the project root, preserving any existing contents, with these entries and placeholder values:
   ```
   KLAVIYO_CLIENT_ID=
   KLAVIYO_CLIENT_SECRET=
   KLAVIYO_REDIRECT_URI=http://localhost:3001/api/auth/callback
   ```
2. Ask the user to paste their **Client ID** and **Client Secret** into `.env` themselves, then tell you when they're done.
3. Check that both values are set without printing them: `grep -cE '^KLAVIYO_CLIENT_ID=.+' .env` and `grep -cE '^KLAVIYO_CLIENT_SECRET=.+' .env` should each print `1`. Count the keys separately: one `KLAVIYO_CLIENT_(ID|SECRET)` pattern counts matching lines, so duplicates of one key pass for the other. Also run `grep -c '^KLAVIYO_CLIENT_ID=' .env` and `grep -c '^KLAVIYO_CLIENT_SECRET=' .env`, which count empty assignments too; each must print `1`, because dotenv loads the last assignment and a trailing empty one would blank the value. If either prints more, ask the user to remove the duplicates.

Do not proceed until both values are set.

Use the port and callback path that matches their existing server config (from your Step 0 audit), not necessarily `3001`.

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

And remind them to **remove** (or plan to remove) `KLAVIYO_API_KEY` from their env — but keep it working in parallel until OAuth is fully tested.

Do not proceed to Step 3 until you have written the `.env` file and wired up dotenv.

---

## Step 3 — Determine required scopes

Read `references/scopes.md` now for the full scope reference table.

From your audit, map every endpoint the integration calls to its required scope. Then:
1. Present the scope list to the user with a brief explanation of what each grants
2. Remind them: **`accounts:read` is always required**, even if they don't explicitly call `/accounts/`
3. Confirm they've added these scopes to the Klaviyo app they just created

---

## Step 4 — Set up token storage

Read `references/storage.md` now.

Check what storage the existing codebase has:
- **Has a database?** Add an `oauth_connections` table or equivalent. See `references/storage.md` for schema.
- **Has Redis?** Use it for token storage. See `references/storage.md` for the pattern.
- **Has nothing?** Implement `storage.json` for now to get them running quickly. Add a prominent `TODO: production storage` comment. Always gitignore it.

Set up the storage layer before implementing the OAuth flow — the flow depends on it.

---

## Step 5 — Implement the OAuth flow

Read `references/pkce-examples.md` now for complete implementations in the user's language.

Add two new endpoints alongside the existing code (don't remove the API key path yet):

### Auth start (GET /auth/start or equivalent)
1. Generate PKCE: `codeVerifier`, `codeChallenge` (SHA-256, base64url), `state`
2. Store `{ codeVerifier, state }` in PKCE storage
3. Build Klaviyo authorization URL (`https://www.klaviyo.com/oauth/authorize`)
4. Redirect user or return URL to frontend

### Auth callback (GET /auth/callback or equivalent)
1. Verify `state` matches stored value — return 400 if not (CSRF check)
2. Exchange auth code for tokens via `POST https://a.klaviyo.com/oauth/token` — **not www.klaviyo.com**
3. Store tokens: `accessToken`, `refreshToken`, `expiresAt = now + (expires_in * 1000)`
4. Clear PKCE state from storage
5. Immediately call `GET /accounts/` with the new token to verify it works
6. Redirect to connected state

Also implement:
- **Token refresh**: `getFreshToken()` — refresh if token expires within 5 minutes, handle `invalid_grant`
- **Disconnect**: Revoke token at `POST https://a.klaviyo.com/oauth/revoke`, clear stored tokens

> **Critical**: Token exchange, refresh, and revoke all go to `a.klaviyo.com` — NOT `www.klaviyo.com`. Klaviyo blocked www for these endpoints as of March 31, 2025.

---

## Step 6 — Swap the auth header

Read `references/api-calls.md` now for the reusable API client pattern.

This is the core of the migration. Find the central place where `Klaviyo-API-Key` is set and replace it:

```
// Remove
Authorization: Klaviyo-API-Key <api_key>

// Add
Authorization: Bearer <access_token>
```

**Strategy**: Find the single shared HTTP client or wrapper (identified in your audit) and make the change there. All downstream API calls should inherit it automatically.

If auth headers are set on every individual request (no shared client), create a wrapper function now:

```javascript
// Node.js example
async function klaviyoRequest(method, path, options = {}) {
  const token = await getFreshToken();
  return fetch(`https://a.klaviyo.com/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      revision: '2026-10-15',
      accept: 'application/vnd.api+json',
      ...options.headers,
    },
    ...options,
  });
}
```

Then update every API call to use this wrapper instead of raw fetch/requests.

---

## Step 7 — Update the revision header

Read `references/revision-changes.md` now.

Current stable revision: **`2026-10-15`**

Check what revision the existing code uses (from your audit) and flag accordingly:
- **`2022-*`, `2023-*` or `2024-*`**: **Retired** — must upgrade, may have breaking changes, test carefully
- **`2025-*`**: Deprecated — still supported, but upgrade now
- **Missing entirely**: Must add — `revision: 2026-10-15` on every request
- **`2026-*`**: Up to date

**How to upgrade safely:**
1. Update the revision in the shared HTTP client (one change)
2. Test every endpoint the integration uses in a Klaviyo test/sandbox account
3. Check the Klaviyo changelog for changes between their old revision and `2026-10-15`: https://developers.klaviyo.com/en/changelog
4. If upgrading from a retired revision, use `X-Klaviyo-Revision-Fall-Forward-Opt-Out: 1` temporarily to surface 410 errors on broken endpoints

If there are potentially breaking changes between their revision and the current one, call them out explicitly with what to watch for.

---

## Step 8 — Handle existing users

If this is a multi-tenant app with existing users on API key auth, they all need to re-authorize through the new OAuth flow.

### The transition plan:
1. **Run OAuth and API key in parallel** — don't remove API key support yet
2. **Add a "Reconnect with OAuth" prompt** in your UI for existing users
3. **Detect which auth method a user is on** and route accordingly in your API calls
4. **Set a migration deadline** — once all users have completed OAuth auth, remove the API key path
5. **Klaviyo recommendation**: Within 3 months of migrating your app to OAuth, migrate all customers still on private-key authentication to it

For single-tenant / internal tools, the migration is simpler: complete the OAuth flow once, store the tokens, and remove the API key from your env.

---

## Step 9 — Test the full flow

Walk the user through testing every part:

1. **Auth flow**: Start → Klaviyo consent page → Callback → tokens stored → redirect to dashboard
2. **API calls**: Each endpoint that was previously working with API key should work with Bearer token
3. **Token refresh**: Simulate by setting `expiresAt` to `Date.now()` and making an API call — confirm refresh happens
4. **Disconnect**: Confirm tokens are cleared, user is returned to unauthenticated state
5. **Reconnect**: Confirm they can go through the OAuth flow again after disconnecting

---

## Step 10 — Final cleanup checklist

Once everything is tested and working:

- [ ] OAuth app created in Klaviyo with correct redirect URIs and scopes
- [ ] `KLAVIYO_CLIENT_ID` in environment variables
- [ ] `KLAVIYO_CLIENT_SECRET` in environment variables
- [ ] `dotenv` installed and `import 'dotenv/config'` (or `require('dotenv').config()`) is the first line of `server.js` — otherwise env vars will be `undefined` at runtime
- [ ] `KLAVIYO_API_KEY` removed from env (or kept temporarily during rollout)
- [ ] `storage.json` added to `.gitignore`
- [ ] Auth start endpoint working
- [ ] Callback endpoint working with state verification
- [ ] Token refresh working, `invalid_grant` handled
- [ ] Disconnect endpoint working (revokes + clears tokens)
- [ ] All API calls use `Bearer` token
- [ ] All API calls use `revision: 2026-10-15`
- [ ] Existing users have a path to re-authorize (multi-tenant apps)
- [ ] `TODO: production storage` comment present if using `storage.json` for now
- [ ] Klaviyo API key removed from source code and git history (use `git log -S "pk_"` to check)

---

## Common mistakes to proactively catch

1. **`www.klaviyo.com` for token/revoke calls** — must be `a.klaviyo.com`. This is a common copy-paste mistake that's been breaking integrations since March 2025.
2. **Keeping API key as fallback in production** — it's fine during migration testing, but flag it: "remember to remove the API key fallback before going to production"
3. **No `invalid_grant` handling** — if the refresh token expires (90-day inactivity) or the user uninstalls, and you don't catch this, users silently break with cryptic errors
4. **Tokens returned to the browser** — OAuth tokens should never appear in responses to the frontend
5. **Hardcoded client secret** — if it's in source code, rotate it immediately and use env vars
6. **Forgetting to gitignore `storage.json`** — this file contains live OAuth tokens
7. **Revision not updated** — common to migrate auth but forget the revision header; old revisions are deprecated/retired
8. **Scope too broad** — requesting more than needed will block marketplace submission; audit endpoints → scopes precisely
9. **Missing dotenv initialization** — setting vars in `.env` does nothing unless `dotenv.config()` runs before the first `process.env` read. If `client_id` or `client_secret` are `undefined` at runtime, this is the first thing to check. The import/require must be at the TOP of the entry file, before any routes or config that reads env vars.

---

## Reference files

- `references/audit-guide.md` — How to find all API key usage and produce an audit report
- `references/scopes.md` — Full scope table and common integration patterns
- `references/pkce-examples.md` — Copy-paste PKCE implementations in Node.js and Python
- `references/storage.md` — Token storage patterns (storage.json, database, Redis)
- `references/api-calls.md` — Reusable API client code and auth header examples
- `references/revision-changes.md` — Revision lifecycle, what changed between versions, how to upgrade safely
