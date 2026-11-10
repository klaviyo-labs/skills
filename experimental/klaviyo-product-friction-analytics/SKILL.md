---
name: klaviyo-product-friction-analytics
description: Build a product friction investigator on Klaviyo — instrument a web app to emit workflow and error events, stitch them to one profile and session, verify delivery, and visualize failure rate, affected users, failure reasons, and recovery in Grafana. Use when someone wants non-marketing product analytics on Klaviyo, wants to diagnose why users fail a core workflow (checkout, signup, booking, payment, upload), or asks to track error and recovery events with Klaviyo's Events API and build a dashboard on them.
disable-model-invocation: true
---

# Klaviyo Product Friction Analytics

Instrument a product workflow so you can answer: **where are users failing, why, who is affected, and do they recover?** Klaviyo is the event and identity store. No warehouse, no analytics database, no custom backend.

This was validated end to end on a live demo store. Every pitfall listed here was hit for real — treat them as landmines, not theory.

## The pattern

The worked example is checkout, but the shape is general:

```
actor → attempts an action on an entity → hits friction → retries or abandons → reaches or misses an outcome
```

You emit three metrics and a shared property contract:

| Metric | Meaning | Example |
|---|---|---|
| `<Workflow> Started` | Attempt began | `Started Checkout` |
| `<Workflow> Error` | Attempt failed | `Checkout Error` |
| `<Workflow> Completed` | Outcome reached | `Placed Order` |

Applies to SaaS activation, bookings, transfers, uploads, level completion, lesson submission. Only the taxonomy changes.

## Prerequisites

- Klaviyo account with a **private API key** that has `events:write` and `events:read`.
- Docker (for Grafana), `jq`, and `curl`.
- A web app you can add code to, with a server-side runtime (Vercel function, Next.js route handler, Express, etc.).

Never put a private key in browser code. Step 2 exists specifically to prevent this.

## Workflow

Copy this checklist and track progress:

```
- [ ] 1. Define the event contract
- [ ] 2. Stand up a server-side ingest proxy
- [ ] 3. Instrument the app (session + identity + events)
- [ ] 4. Verify delivery — do not skip
- [ ] 5. Pin metric IDs
- [ ] 6. Stand up the dashboard
- [ ] 7. Read the results and state the limits
```

---

### 1. Define the event contract

Write the contract down **before** instrumenting. An ungoverned taxonomy is the failure mode that shows up three weeks later, when someone emits `Checkout Failed` alongside your `Checkout Error` and every number is quietly wrong.

Every event in the workflow carries:

| Property | Type | Why it exists |
|---|---|---|
| `session_id` | string (UUID) | Ties pre-identity events to post-identity ones |
| `source` | string | Separates `website` from backfills and seeds |
| `step` | string | Where in the workflow it happened |

Error events additionally carry:

| Property | Type | Why it exists |
|---|---|---|
| `reason` | string, **closed set** | The dominant-failure-mode question |
| `latency_ms` | number | Distinguishes "broken" from "slow" |

Define `reason` as a fixed enum, not free text. High-cardinality free-text reasons make the distribution panel useless. The reference example uses `size_unavailable`, `form_validation`, `payment_declined`, each mapped to a `step`.

Keep PII out of event properties. Email belongs on the profile.

### 2. Stand up a server-side ingest proxy

**The server-side Create Event endpoint needs a private API key, and a private key must never reach the browser.** You need a same-origin route that forwards to Klaviyo and holds the key server-side. Klaviyo's client-side `POST /client/events` takes your public site ID instead and needs no proxy. This skill uses the server-side endpoint so the key, and what gets written, stay under your server's control.

Copy `assets/api/klaviyo-events.js` (Vercel-style handler; portable to any Node runtime). It forwards only the metric names in its `ALLOWED_METRICS` set, so set those to your contract's names. It caps the body size and never returns Klaviyo's error body to the browser. **The route is public and holds a write key: put it behind your app's own session check and a rate limit before deploying.**

Set the key as a server-only environment variable named `KLAVIYO_PRIVATE_API_KEY`. Mark it sensitive and scope it to preview/staging while testing.

For local dev with Vite, proxy `/api/klaviyo-events` and strip `origin`, `referer`, and `sec-ch-ua*` headers — Klaviyo returns 403 if browser-origin headers survive the hop. See `reference.md`.

### 3. Instrument the app

Copy `assets/telemetry.ts` and adapt the metric names. It handles the three things that are easy to get wrong:

**Session ID.** Generate a UUID on first touch, persist in `sessionStorage`, attach to every event.

**Identity stitching.** Product events happen before the user types an email. Send `external_id: <session_id>` on every event. When the email finally arrives, send `external_id` **and** `email` together on the same event — that is what makes Klaviyo resolve the whole sequence to one profile. Verify it in step 4; do not assume it worked.

**Duplicate suppression.** Set `unique_id` per event. React Strict Mode double-fires effects in development, and a `useRef` guard on the "workflow started" effect is worth adding on top.

Use the Events API path rather than the onsite `window.klaviyo.track` snippet for anything you intend to test automatically. The onsite script detects headless browsers as robots, disables tracking, and leaves promises unresolved with no delivery receipt.

### 4. Verify delivery — do not skip

**HTTP 202 does not mean the event was stored.** It means the request entered asynchronous processing. It does not prove the event was persisted, that a metric was created, that identity resolved, or that the event is queryable. Events can return 202 and be silently dropped.

Run the verification loop:

```bash
export KLAVIYO_PRIVATE_API_KEY="..."         # or store in Keychain, see reference.md
scripts/verify-delivery.sh --session <session_id>
```

The script polls Get Events and prints, per event: metric name and ID, profile ID, session ID, and key properties.

**You are done when all events in one journey share a single profile ID and a single session ID.** If profile IDs differ, identity stitching is broken — fix step 3 before continuing. Everything downstream is wrong otherwise.

If nothing appears at all, check whether you used a reserved test domain. **Events for `example.com` and `test.com` return 202 and are silently discarded** — which is exactly what integration examples and generated test fixtures use. Use a domain you control.

### 5. Pin metric IDs

Klaviyo auto-creates a metric on the first event with a given name, and **the same display name can exist multiple times from different integrations** — "Placed Order from API" and "Placed Order from Shopify" are different metrics with different IDs. Querying by name is ambiguous; the dashboard must use IDs.

```bash
scripts/list-metrics.sh --name "Checkout Error"
```

Record the three IDs. Note that a metric does not exist until its first event fires, so run one real journey before this step.

### 6. Stand up the dashboard

Grafana with the Infinity data source is the validated path. Klaviyo stays the only event store; Grafana just polls the read API.

```bash
cd assets
cp -r . /path/to/your/grafana-stack && cd /path/to/your/grafana-stack
export KLAVIYO_API_KEY="..."      # read key; Grafana keeps it server-side
docker compose up -d
```

Open `http://localhost:3000` and sign in as `admin` with the `GRAFANA_ADMIN_PASSWORD` you set. Then set the four dashboard constants under **Dashboard settings → Variables**: `metric_started`, `metric_error`, `metric_completed`, and `event_source`.

Two things about the dashboard template that are load-bearing:

**It uses two shared source queries, not one per panel.** Display panels read from them via the `-- Dashboard --` data source. One aggregate query per panel returns HTTP 429 as soon as several panels load at once. If you add panels, point them at the existing source panels.

**It aggregates client-side with JSONata, by necessity.** Query Metric Aggregates cannot group by arbitrary event properties like `reason`, `step`, or `latency_ms` — it supports a fixed set of aggregate attributes with a one-year range and a single non-date filter. So the source panel pulls raw events and computes counts, rates, unique users, and latency in the query itself. Put calculations in the JSONata root selector, not in Grafana panel transformations; transformation pipelines silently produce wrong scaling (a 100% rate rendering as 1,600% is a real thing that happened).

*Using something other than Grafana?* The portable part is the Get Events request and the JSONata aggregation in `reference.md`. Any tool that can call a REST endpoint with a bearer header and reshape JSON will work. Grafana is recommended because the provisioning is already written and the secure-header handling keeps the key off the client.

**No real traffic yet?** Populate the dashboard first so you can see the shape:

```bash
scripts/seed-friction-events.sh --sessions 12 --failure-rate 0.66
```

### 7. Read the results and state the limits

The dashboard answers: attempts, errors, completions, affected users, error rate, completion rate, average error latency, and failure-reason distribution.

State these limits whenever you show it to anyone:

- **The read caps at 1,000 events per query window**, newest first, with no truncation warning. A "30-day" view may silently represent far less, and unrelated account activity competes for those 1,000 slots.
- **Stage ratios are aggregate, not ordered funnels.** Comparing counts of Started to Completed is not the same as tracking individual users through steps in order. There is no server-side ordered funnel primitive.
- **Polling is near-real-time**, not streaming — 30s refresh plus Klaviyo's processing delay.
- **No session replay, stack traces, or error grouping.** You get the event you emitted and nothing more.
- **No native retention or cohort analysis.** Segments identify audiences; they are not cohort analysis.

## Known pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| CORS error on event POST | Browser → Klaviyo directly | Server-side proxy (step 2) |
| 403 from Klaviyo via local dev proxy | Browser origin headers forwarded | Strip `origin`, `referer`, `sec-ch-ua*` |
| 202 but no event visible | Async processing, or silent drop | Poll Get Events (step 4) |
| Nothing lands, ever | Reserved test domain | Stop using `example.com` / `test.com` |
| Events split across profiles | `external_id` not sent with email | Send both on the same event |
| Duplicate events in dev | React Strict Mode | `unique_id` + `useRef` guard |
| Dashboard shows wrong metric's data | Duplicate metric names | Pin metric IDs (step 5) |
| HTTP 429 on dashboard load | One query per panel | Shared source panels |
| Rate renders as 1,600% | Grafana transformation pipeline | Compute in JSONata |
| Counts drift over time | 1,000-event cap | Narrow the window; state the limit |

Full detail, request shapes, and the JSONata cookbook are in [reference.md](reference.md).

## Assets

| Path | Purpose |
|---|---|
| `assets/api/klaviyo-events.js` | Same-origin ingest proxy |
| `assets/telemetry.ts` | Session, identity, and event helpers |
| `assets/docker-compose.yml` | Grafana with Infinity preinstalled |
| `assets/provisioning/` | Klaviyo data source and dashboard provider |
| `assets/dashboards/friction-template.json` | Dashboard with shared source queries |
| `scripts/list-metrics.sh` | Resolve metric names to IDs, flag duplicates |
| `scripts/verify-delivery.sh` | Prove events landed and identity resolved |
| `scripts/seed-friction-events.sh` | Generate sample journeys |

## When not to use this

Reach for a dedicated product analytics tool instead if the requirement includes session replay or stack-trace debugging, ordered multi-step funnels with conversion windows, cohort retention curves, experimentation, or event volumes where a 1,000-event read cap is meaningless.

This approach is strongest when the point is connecting product friction to **customer identity and downstream action** — finding which real customers hit an error so you can segment, message, or route them. That is the part a standalone analytics tool cannot do.
