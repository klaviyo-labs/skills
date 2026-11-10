# Klaviyo OAuth Scopes Reference

## How scopes work
- Scopes are space-separated in the authorization URL: `scope=accounts:read lists:read profiles:write`
- **`accounts:read` is always required** — every app must include it regardless of what else they need
- Request only the minimum scopes your app actually uses — over-scoping gets apps rejected from the Klaviyo marketplace
- To find the exact scope for any endpoint: check https://developers.klaviyo.com/en/reference — each endpoint documents its required scope

---

## Scope → Endpoint mapping

| Scope | What it covers |
|-------|---------------|
| `accounts:read` | **Always required.** GET /accounts |
| `profiles:read` | GET /profiles, GET /profiles/{id}, search profiles |
| `profiles:write` | POST /profiles, PATCH /profiles/{id}, bulk profile imports |
| `lists:read` | GET /lists, GET /lists/{id}, GET list relationships |
| `lists:write` | POST /lists, PATCH /lists/{id}, DELETE /lists/{id}, manage list membership |
| `segments:read` | GET /segments, GET /segments/{id}, GET segment profiles |
| `segments:write` | POST /segments, PATCH /segments/{id}, DELETE /segments/{id} |
| `events:read` | GET /events, GET /events/{id} |
| `events:write` | POST /events (track events), POST /event-bulk-create-jobs |
| `metrics:read` | GET /metrics, GET /metrics/{id}, GET /metric-aggregates |
| `flows:read` | GET /flows, GET /flows/{id}, GET flow actions, GET flow messages |
| `flows:write` | PATCH /flows/{id}, PATCH /flow-actions/{id}, DELETE /flows/{id} |
| `campaigns:read` | GET /campaigns, GET /campaigns/{id}, GET campaign messages, GET campaign send jobs |
| `campaigns:write` | POST /campaigns, PATCH /campaigns/{id}, DELETE /campaigns/{id}, POST /campaign-send-jobs |
| `templates:read` | GET /templates, GET /templates/{id} |
| `templates:write` | POST /templates, PATCH /templates/{id}, DELETE /templates/{id}, POST /template-render |
| `subscriptions:write` | POST /profile-subscription-bulk-create-jobs, POST /profile-subscription-bulk-delete-jobs |
| `catalogs:read` | GET /catalog-items, GET /catalog-variants, GET /catalog-categories |
| `catalogs:write` | POST/PATCH/DELETE /catalog-items, /catalog-variants, /catalog-categories, bulk catalog jobs |
| `tags:read` | GET /tags, GET /tags/{id}, GET tag relationships |
| `tags:write` | POST /tags, PATCH /tags/{id}, DELETE /tags/{id}, manage tag relationships |
| `webhooks:read` | GET /webhooks, GET /webhooks/{id} |
| `webhooks:write` | POST /webhooks, PATCH /webhooks/{id}, DELETE /webhooks/{id} |
| `data-privacy:write` | POST /data-privacy-deletion-jobs |
| `images:read` | GET /images, GET /images/{id} |
| `images:write` | POST /images, PATCH /images/{id}, POST /image-upload |
| `coupons:read` | GET /coupons, GET /coupons/{id} |
| `coupons:write` | POST/PATCH/DELETE /coupons |
| `coupon-codes:read` | GET /coupon-codes, GET /coupon-codes/{id} |
| `coupon-codes:write` | POST/PATCH/DELETE /coupon-codes, bulk coupon code jobs |
| `forms:read` | GET /forms, GET /forms/{id} |

There is no separate reporting scope. The values reports are covered by the scope for what they report on: `POST /campaign-values-reports` needs `campaigns:read`, `/flow-values-reports` needs `flows:read`, `/form-values-reports` needs `forms:read`, and `/segment-values-reports` needs `segments:read`.

---

## Common integration patterns → scope sets

### Email marketing tool
```
accounts:read lists:read lists:write profiles:read profiles:write 
campaigns:read campaigns:write templates:read templates:write 
events:write metrics:read
```

### E-commerce / customer data sync
```
accounts:read profiles:read profiles:write events:write 
lists:read lists:write catalogs:read catalogs:write subscriptions:write
```

### Analytics / reporting dashboard
```
accounts:read metrics:read campaigns:read
flows:read events:read segments:read profiles:read
```

### Simple list/segment viewer
```
accounts:read lists:read segments:read profiles:read
```

### Minimal starter (just verify connection)
```
accounts:read
```
