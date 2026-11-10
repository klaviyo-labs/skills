# Reference

Request shapes, the JSONata cookbook, and the full pitfall detail behind `SKILL.md`.

## API basics

All requests need a `revision` header. Pin a date and keep it consistent across the proxy, the client, and the data source — mismatched revisions produce confusing schema differences.

```
authorization: Klaviyo-API-Key <private_key>
accept: application/vnd.api+json
content-type: application/vnd.api+json
revision: 2026-10-15
```

### Create an event

`POST https://a.klaviyo.com/api/events/`

```json
{
  "data": {
    "type": "event",
    "attributes": {
      "properties": {
        "session_id": "0f2c...",
        "source": "website",
        "step": "payment",
        "reason": "payment_declined",
        "latency_ms": 1840
      },
      "value": 175,
      "unique_id": "9b31...",
      "metric": {
        "data": { "type": "metric", "attributes": { "name": "Checkout Error" } }
      },
      "profile": {
        "data": {
          "type": "profile",
          "attributes": { "external_id": "0f2c...", "email": "user@your-store-demo.com" }
        }
      }
    }
  }
}
```

Returns `202` on acceptance. See "The 202 trap" below.

Notes:

- The metric is referenced **by name**. Klaviyo creates it on first use.
- `unique_id` is your idempotency key. Omit it and retries or double-fired effects create duplicates.
- `value` drives revenue aggregation. Only send it where it means something.
- `external_id` is the identity anchor. Send it on every event in the workflow.

### Read events

`GET https://a.klaviyo.com/api/events/`

```
?filter=and(greater-or-equal(datetime,2026-08-01T00:00:00Z),less-than(datetime,2026-08-04T00:00:00Z))
&page[size]=1000
&sort=-datetime
```

`page[size]` maxes at 1000. Response rows carry:

- `attributes.datetime` — ISO timestamp
- `attributes.event_properties` — everything you sent in `properties`
- `relationships.metric.data.id` — the metric ID to filter on
- `relationships.profile.data.id` — the resolved profile ID

Filter by metric ID client-side rather than adding more API filters; the filter grammar is limited and you want one request feeding many panels.

### List metrics

`GET https://a.klaviyo.com/api/metrics/`

Returns `data[].id`, `data[].attributes.name`, and `data[].attributes.integration.name`. Use the integration name to disambiguate same-named metrics.

## The 202 trap

`202 Accepted` means the request entered asynchronous processing. It does **not** prove the event was stored, that a metric was created, that identity resolved, that the event is queryable, or that it was not silently dropped.

There is no ingestion status endpoint, no processing timestamp, and no rejection reason surfaced to the caller. The only way to know is to poll Get Events and look. Build that into your workflow permanently, not just during setup.

**Reserved domains.** Klaviyo documents that events for domains such as `example.com` and `test.com` may return `202` and be discarded. This bites hard because those domains are the default in nearly every code sample and generated fixture. Use a domain you control or a `-demo.com` variant.

## Identity stitching

The sequence that works:

1. First page view: generate a UUID, persist in `sessionStorage`.
2. Every event: `profile.data.attributes.external_id = <session_id>`.
3. The moment an email is known: send `external_id` **and** `email` in the same event payload.
4. Klaviyo merges the anonymous profile into the identified one.

Verify with `scripts/verify-delivery.sh --session <id>` and confirm a single profile ID across the journey. There is no identity inspector, no merge history view, and no conflict report — polling is the only visibility you get.

`sessionStorage` clears on tab close, which is usually the behavior you want for a session. Use `localStorage` if you want the anchor to survive across visits, and accept that shared devices will merge distinct people.

## CORS and local development

The server-side Create Event endpoint needs a private API key, which must never reach the browser. Hence the proxy.

Locally, a Vite dev proxy needs to strip browser-origin headers or Klaviyo returns `403`:

```ts
server: {
  proxy: {
    '/api/klaviyo-events': {
      target: 'https://a.klaviyo.com',
      changeOrigin: true,
      rewrite: () => '/api/events/',
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.removeHeader('origin')
          proxyReq.removeHeader('referer')
          proxyReq.removeHeader('sec-ch-ua')
          proxyReq.removeHeader('sec-ch-ua-mobile')
          proxyReq.removeHeader('sec-ch-ua-platform')
          proxyReq.setHeader('user-agent', 'product-friction-demo')
          proxyReq.setHeader(
            'authorization',
            `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`
          )
          proxyReq.setHeader('revision', '2026-10-15')
        })
      },
    },
  },
}
```

## Onsite JavaScript vs the Events API

The onsite `window.klaviyo.track` snippet is fine for real users and wrong for anything you want to test automatically. Under a headless browser it detects a robot, logs that tracking is disabled, leaves promises unresolved, and queues commands that never flush — with no delivery receipt either way.

Use the Events API path for any journey you plan to verify in CI or exercise with Playwright. `assets/telemetry.ts` shows the branch: onsite for normal traffic, Events API when a demo or test flag is set.

## Key storage

Do not commit keys. Two patterns that work:

**macOS Keychain**, for local Grafana:

```bash
security add-generic-password -a "$USER" -s klaviyo-friction-demo -w    # prompts, no shell history
export KLAVIYO_API_KEY="$(security find-generic-password -a "$USER" -s klaviyo-friction-demo -w)"
```

**Platform environment variable**, for the deployed proxy: mark it sensitive, scope it to preview/staging, and confirm it never appears in the client bundle.

Grafana holds the read key in the data source's `secureJsonData`, which is encrypted at rest and never sent to the browser. Note that a container recreated by Docker's restart policy reuses the environment captured at creation time — if you rotate the key, recreate the container rather than restarting it.

Scope keys narrowly: `events:write` for the ingest proxy, `events:read` and `metrics:read` for Grafana. There is no ingestion-only credential type, so the write key is more powerful than you want it to be. Keep it off anything public.

## Why not Query Metric Aggregates

QMA is the obvious tool and it does not fit. It supports a fixed set of aggregate attributes, a one-year query range, and one additional non-date filter. It cannot group by arbitrary event properties, which means it cannot answer "which `reason` dominates" or "what is average `latency_ms` by `step`" — the actual questions.

It also rate-limits aggressively. One QMA call per dashboard panel returns `429` as soon as several panels render together.

So: pull raw events once, aggregate in the query layer, share the result across panels.

## JSONata cookbook

These run in the Infinity data source's `root_selector` with `"parser": "backend"`.

**Filter to your workflow's events:**

```
data[(relationships.metric.data.id = $m_start
   or relationships.metric.data.id = $m_error
   or relationships.metric.data.id = $m_done)
   and attributes.event_properties.source = "website"]
```

**Rates, guarded against divide-by-zero:**

```
$errorRate := $count($starts) = 0 ? 0 : $count($errors) / $count($starts);
```

Return rates as fractions and format the panel as `percentunit`. Returning `0.42` and formatting as `percent` is how you get 42% displayed as 4,200%.

**Unique affected users:**

```
$count($distinct($errors.relationships.profile.data.id))
```

**Group by day** (string date, avoids timezone drift in the bucket key):

```
$days := $sort($distinct($map($events, function($e) {
  $substring($e.attributes.datetime, 0, 10)
})));
```

**Failure-reason distribution:**

```
$reasons := $distinct($errors.attributes.event_properties.reason);
$map($reasons, function($r) {{
  "reason": $r,
  "count": $count($errors[attributes.event_properties.reason = $r])
}})
```

**Always guard the empty case.** An empty `data` array makes downstream expressions error rather than render an empty panel:

```
$count($events) = 0 ? [] : ( ... )
```

**Compute overall figures once and repeat them on every row.** Stat panels then reduce with `lastNotNull` instead of trying to re-derive a rate from summed columns — which is the specific mistake that produces 1,600%.

## Grafana wiring

**Shared source panels.** Display panels use `{"type": "datasource", "uid": "-- Dashboard --"}` with `"panelId": <source panel id>` in the target. Each additional source query is another upstream API call per refresh, so keep the count small — the template uses two.

**Field selection.** `filterFieldsByName` to a single column, then set the panel's reducer, is more predictable than `organize`/`excludeByName` chains.

**Constants.** Metric IDs live in dashboard variables of type `constant` and interpolate into the root selector as `${metric_error}`. Editing four variables is friendlier than editing JSONata.

**499s during load.** Panels sharing a source query may briefly show canceled requests while the source resolves. Direct API calls succeeding while the browser looks half-loaded is expected; it settles once the source query returns.

## Scaling limits

| Constraint | Consequence |
|---|---|
| 1,000 events per read, newest first | Long windows silently truncate; unrelated account activity competes for slots |
| No truncation metadata | Nothing tells you the number is incomplete — including an AI agent reading the same API |
| No server-side ordered funnel | Stage ratios are aggregate comparisons, not user-level conversion |
| No sessions primitive | `session_id` is your convention; nothing enforces or interprets it |
| No retention or cohort query | Segments are audiences, not cohorts |
| No diagnostic context | No replay, stack traces, source maps, or error grouping |

Past demo scale, the honest options are a supported aggregate query surface, an export to a warehouse, or a dedicated product analytics tool alongside Klaviyo.

## Sources

- [Klaviyo Events API overview](https://developers.klaviyo.com/en/reference/events_api_overview)
- [Klaviyo API rate limits](https://developers.klaviyo.com/en/reference/api_overview)
- [Grafana Infinity data source](https://grafana.com/docs/plugins/yesoreyeram-infinity-datasource/latest/)
- [JSONata documentation](https://docs.jsonata.org/)
