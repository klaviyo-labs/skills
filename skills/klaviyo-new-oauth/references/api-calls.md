# Making Klaviyo API Calls with OAuth

## The only thing that changes from API key auth

**Before (API key):**
```
Authorization: Klaviyo-API-Key pk_xxxxxxxxxxxxxxxxxxxxxxxx
```

**After (OAuth):**
```
Authorization: Bearer <access_token>
```

Everything else — URL, `revision` header, request body, response shape — stays identical.

---

## Required headers for every request

```
Authorization: Bearer <access_token>
revision: 2026-10-15
accept: application/vnd.api+json        (for GET requests)
content-type: application/vnd.api+json  (for POST/PATCH requests)
```

---

## Reusable API client pattern

Build one thin wrapper so the Bearer token swap and revision header happen in one place, not scattered across every call.

### Node.js

```javascript
const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const REVISION = '2026-10-15';

export async function klaviyoGet(path, accessToken, params = {}) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${KLAVIYO_BASE}${path}${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      revision: REVISION,
      accept: 'application/vnd.api+json',
    },
  });

  const json = await res.json();
  if (!res.ok) {
    const message = json?.errors?.[0]?.detail || `Klaviyo API error ${res.status}`;
    throw new Error(message);
  }
  return json;
}

export async function klaviyoPost(path, accessToken, body) {
  const res = await fetch(`${KLAVIYO_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      revision: REVISION,
      'content-type': 'application/vnd.api+json',
      accept: 'application/vnd.api+json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const message = json?.errors?.[0]?.detail || `Klaviyo API error ${res.status}`;
    throw new Error(message);
  }
  return json;
}
```

### Python / requests

```python
import requests

KLAVIYO_BASE = 'https://a.klaviyo.com/api'
REVISION = '2026-10-15'

def klaviyo_get(path, access_token, params=None):
    res = requests.get(
        f'{KLAVIYO_BASE}{path}',
        headers={
            'Authorization': f'Bearer {access_token}',
            'revision': REVISION,
            'accept': 'application/vnd.api+json',
        },
        params=params or {},
    )
    res.raise_for_status()
    return res.json()

def klaviyo_post(path, access_token, body):
    res = requests.post(
        f'{KLAVIYO_BASE}{path}',
        headers={
            'Authorization': f'Bearer {access_token}',
            'revision': REVISION,
            'content-type': 'application/vnd.api+json',
            'accept': 'application/vnd.api+json',
        },
        json=body,
    )
    res.raise_for_status()
    return res.json()
```

---

## Always refresh before calling

Wire the fresh-token check into every API call so it's automatic:

```javascript
// Node.js example — wrap your API client with token refresh
export async function callKlaviyo(path, storage) {
  const token = await getFreshToken(storage);  // refreshes if needed
  return klaviyoGet(path, token);
}
```

---

## Common API call examples

### Get account info
```javascript
const account = await klaviyoGet('/accounts/', token);
// Returns 1 account object — use to verify connection
```

### Get lists
```javascript
const lists = await klaviyoGet('/lists/', token);
```

### Get segments
```javascript
const segments = await klaviyoGet('/segments/', token);
```

### Get profiles (with field selection)
```javascript
const profiles = await klaviyoGet('/profiles/', token, {
  'fields[profile]': 'email,first_name,last_name',
});
```

### Track an event
```javascript
await klaviyoPost('/events/', token, {
  data: {
    type: 'event',
    attributes: {
      metric: { data: { type: 'metric', attributes: { name: 'Placed Order' } } },
      profile: { data: { type: 'profile', attributes: { email: 'user@example.com' } } },
      properties: { order_id: '12345', total: 99.99 },
      time: new Date().toISOString(),
    },
  },
});
```

---

## Error handling patterns

| HTTP status | Meaning | Action |
|-------------|---------|--------|
| `401` | Token expired or invalid | Call `getFreshToken()` and retry once; if it fails again, prompt re-auth |
| `403` | Missing scope | Check your app's scope list at klaviyo.com/manage-apps |
| `404` | Resource not found | Handle gracefully |
| `429` | Rate limited | Respect `Retry-After` header, implement exponential backoff |
| `400` | Bad request | Check error details in `json.errors[0].detail` |

---

## Revision header — important notes

- Always use the **current revision**: `2026-10-15`
- Klaviyo releases new revisions quarterly (YYYY-MM-15 format), so check the changelog for a newer one before pinning
- Revisions are supported for 2 years total: 1 year stable, 1 year deprecated
- After 2 years, a revision is **retired** — calls get `410` errors or silently fall forward to the next revision (which may have breaking changes)
- Opt out of fall-forward behavior with header: `X-Klaviyo-Revision-Fall-Forward-Opt-Out: 1`
- Older revisions to audit for: anything in the `2022-`, `2023-` or `2024-` range is retired, and `2025-` revisions are deprecated
