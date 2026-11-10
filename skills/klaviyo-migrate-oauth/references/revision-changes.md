# Klaviyo API Revision Changes & Migration Notes

## Current stable revision: `2026-10-15`

Always update to this revision when migrating. It's the latest stable as of October 2026. Klaviyo releases a new revision each quarter, so check the [changelog](https://developers.klaviyo.com/en/changelog) for a newer one before pinning.

---

## Revision lifecycle

| Phase | Duration | What it means |
|-------|----------|---------------|
| Stable | Year 1 | Non-breaking changes only; fully supported |
| Deprecated | Year 2 | Works but you should upgrade |
| Retired | After 2 years | Returns `410` errors or silently falls forward (breaking!) |

**Status as of October 2026** (each revision's support end date is in the [changelog](https://developers.klaviyo.com/en/changelog)):
- `2022-*`, `2023-*` and `2024-*` — **RETIRED** — upgrade immediately
- `2025-*` — **DEPRECATED** — still supported, but upgrade soon
- `2026-01-15` and later — stable, supported

---

## How to audit revision usage in a codebase

```bash
# Find all revision headers
grep -r "revision" . --include="*.{js,ts,py,rb}" | grep -i "klaviyo\|2022\|2023\|2024\|2025\|2026"

# Find hardcoded revision dates
grep -r "20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]" . | grep -v node_modules | grep -v ".git"
```

---

## Key changes between common old revisions and `2026-10-15`

### If upgrading from a `2024-*` or `2025-*` revision
- Read the changelog entry for every revision between yours and `2026-10-15`; each one lists its breaking changes: https://developers.klaviyo.com/en/changelog
- Response shapes for some endpoints have gained fields, which is additive and shouldn't break
- `GET /accounts/` behavior unchanged

### If upgrading from `2023-*` revisions
- Several endpoints changed their JSON:API response shapes
- Relationship payloads were restructured in 2024 revisions
- Bulk job endpoints were added/changed
- Recommend: test each endpoint your integration uses against `2026-10-15` in a dev account before deploying

### If upgrading from `legacy` revision
- The `legacy` revision is a compatibility shim for very old (pre-2022) integrations
- Migrating from `legacy` to a dated revision may require significant changes to request/response handling
- Treat this as a full API migration, not just a header change

---

## How to update safely

1. **Pin to `2026-10-15`** across all API calls in one place (the shared HTTP client)
2. **Test every endpoint your app uses** against the new revision in a Klaviyo test account
3. **Use `X-Klaviyo-Revision-Fall-Forward-Opt-Out: 1`** on your old revision temporarily to get explicit 410 errors instead of silent fall-forward — helps surface broken endpoints before you migrate
4. **Deploy revision update separately** from the OAuth migration if possible — two changes at once makes debugging harder

---

## Checking for fall-forward behavior

If your current revision is retired and you're getting unexpected responses (not 410 errors), you may be subject to Klaviyo's fall-forward behavior — the request silently routes to the next available revision, which may have breaking changes.

Add this header to your current calls to opt out:
```
X-Klaviyo-Revision-Fall-Forward-Opt-Out: 1
```

If you start getting 410 errors, your revision is retired — migrate to `2026-10-15` immediately.

---

## Staying current going forward

- Subscribe to the Klaviyo developer newsletter at https://developers.klaviyo.com
- Check the changelog quarterly: https://developers.klaviyo.com/en/changelog
- Plan a revision update every 12–18 months to stay ahead of deprecations
- Klaviyo provides minimum 30 days notice before breaking changes
