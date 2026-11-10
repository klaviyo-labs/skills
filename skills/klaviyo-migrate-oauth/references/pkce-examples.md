# PKCE Implementation Examples

These are reference implementations for the OAuth PKCE flow. Match the language/framework the user is already using.

---

## Node.js / Express

### Generate PKCE + state (auth start)

```javascript
import { randomBytes, createHash } from 'crypto';

function base64url(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function generatePkce() {
  const codeVerifier = base64url(randomBytes(64));   // 512-bit random, URL-safe
  const codeChallenge = base64url(
    createHash('sha256').update(codeVerifier).digest()
  );
  const state = base64url(randomBytes(32));           // 256-bit CSRF token
  return { codeVerifier, codeChallenge, state };
}
```

### Build authorization URL

```javascript
export function buildAuthUrl({ clientId, redirectUri, scopes, codeChallenge, state }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://www.klaviyo.com/oauth/authorize?${params}`;
}
```

### Exchange auth code for tokens (callback)

```javascript
export async function exchangeCode({ code, codeVerifier, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  // Confidential clients: add Basic auth header with client_secret
  // Public clients (no secret): omit the Authorization header entirely
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }

  const res = await fetch('https://a.klaviyo.com/oauth/token', { method: 'POST', headers, body });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error_description || `Token exchange failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}
```

### Refresh access token

```javascript
export async function refreshToken({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }

  const res = await fetch('https://a.klaviyo.com/oauth/token', { method: 'POST', headers, body });
  const data = await res.json();

  if (!res.ok) {
    if (data.error === 'invalid_grant') {
      // Refresh token expired or app uninstalled — user must re-authorize
      throw new Error('RECONNECT_REQUIRED: ' + (data.error_description || 'Refresh token invalid'));
    }
    throw new Error(data.error_description || `Refresh failed: ${res.status}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // May or may not rotate
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}
```

### Get fresh token (call before every API request)

```javascript
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // Refresh if < 5 min remaining

export async function getFreshToken(storage) {
  const conn = storage.getConnection();
  if (!conn) throw new Error('Not connected — no stored tokens');

  const needsRefresh = conn.expiresAt - Date.now() < EXPIRY_BUFFER_MS;
  if (!needsRefresh) return conn.accessToken;

  const refreshed = await refreshToken({
    refreshToken: conn.refreshToken,
    clientId: process.env.KLAVIYO_CLIENT_ID,
    clientSecret: process.env.KLAVIYO_CLIENT_SECRET, // undefined for public clients
  });

  storage.setConnection({ ...conn, ...refreshed, lastRefreshedAt: Date.now() });
  return refreshed.accessToken;
}
```

### Revoke tokens (on disconnect)

```javascript
export async function revokeToken({ token, clientId, clientSecret }) {
  const body = new URLSearchParams({ token, client_id: clientId });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }
  await fetch('https://a.klaviyo.com/oauth/revoke', { method: 'POST', headers, body });
  // Don't throw on failure — best-effort revocation
}
```

---

## Python / Flask

### Generate PKCE

```python
import os, hashlib, base64

def base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def generate_pkce():
    code_verifier = base64url(os.urandom(64))
    code_challenge = base64url(hashlib.sha256(code_verifier.encode()).digest())
    state = base64url(os.urandom(32))
    return code_verifier, code_challenge, state
```

### Authorization URL

```python
from urllib.parse import urlencode

def build_auth_url(client_id, redirect_uri, scopes, code_challenge, state):
    params = urlencode({
        'response_type': 'code',
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'scope': ' '.join(scopes),
        'state': state,
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256',
    })
    return f'https://www.klaviyo.com/oauth/authorize?{params}'
```

### Token exchange

```python
import requests, base64, time

def exchange_code(code, code_verifier, client_id, redirect_uri, client_secret=None):
    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': redirect_uri,
        'client_id': client_id,
        'code_verifier': code_verifier,
    }
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    if client_secret:
        creds = base64.b64encode(f'{client_id}:{client_secret}'.encode()).decode()
        headers['Authorization'] = f'Basic {creds}'

    res = requests.post('https://a.klaviyo.com/oauth/token', data=data, headers=headers)
    res.raise_for_status()
    token_data = res.json()
    return {
        'access_token': token_data['access_token'],
        'refresh_token': token_data['refresh_token'],
        'expires_at': time.time() + token_data.get('expires_in', 3600),
    }
```

---

## Key facts to always mention

- **`code_verifier`**: 43–128 chars, cryptographically random, URL-safe base64 (no padding)
- **`code_challenge`**: `BASE64URL(SHA256(ASCII(code_verifier)))` — no padding
- **`code_challenge_method`**: Always `S256` (plain is not supported by Klaviyo)
- **State**: Random value, stored server-side, verified on callback to prevent CSRF
- **Token URL**: Must be `https://a.klaviyo.com/oauth/token` — NOT `www.klaviyo.com` (blocked since March 31, 2025)
- **Authorize URL**: `https://www.klaviyo.com/oauth/authorize` (this one IS www)
- **Revoke URL**: `https://a.klaviyo.com/oauth/revoke`
- **Access token lifetime**: 1 hour (always use `expires_in` from response, don't hardcode)
- **Refresh token lifetime**: 90 days of inactivity, or until app uninstalled
- **Refresh rate limit**: The token endpoint is rate-limited. On a `rate_limit_exceeded` error, wait a minute and retry
