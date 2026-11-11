---
name: klaviyo-store-analytics
description: >
  Use this skill when someone with Klaviyo connected to their storefront asks how it's doing or wants
  a draft campaign from that data: "how many signups did the new storefront get", "which flows reached
  the most people last month", "rank our campaigns by click rate", "how much revenue came from email vs
  SMS", "how many shoppers used the shopping agent", or "draft a campaign for people who viewed but
  didn't buy". Covers read-only reporting through the Klaviyo MCP server (metric aggregates, campaign,
  flow, form and segment reports, profiles), questions specific to a Vercel Shop storefront's events
  and signup sources, and building segments, templates and campaigns as drafts that a person reviews
  and sends. Never sends anything.
disable-model-invocation: true
---

# Klaviyo analytics and draft campaigns for a storefront

This skill answers questions about a store's Klaviyo data, and turns the answers into draft segments and campaigns, through the Klaviyo MCP server. It knows what a Vercel Shop storefront sends to Klaviyo (Viewed Product, Added to Cart, Viewed Collection, Submitted Search, Active on Site, list signups with their source, back-in-stock subscriptions and, with Shop Agent, Used Shop Agent), so it can answer questions about the new storefront as well as the account as a whole.

Reporting is read-only. Anything a shopper could receive is created as a draft, and a person reviews and sends it in Klaviyo. **Never call `send_campaign`, `create_template_preview_send_job`, or anything else that sends a message, and never set a flow live from this skill.**

## Step 0 — Connect

Use Klaviyo's remote MCP server, `https://mcp.klaviyo.com/mcp`. For reporting only, add `?read-only=true` to the URL, so the server exposes no tool that can change the account. Drafting campaigns needs the full server.

Call `get_account_details` and confirm the account name with the user before answering: an agent signed in to the wrong account answers about the wrong store.

## Step 1 — Pin down the question

Before running anything, settle:

- **The date range**, as calendar dates in the account's timezone (from `get_account_details`). "Last month" is the previous calendar month, not the last 30 days, unless the user says otherwise.
- **The metric.** Look up metric IDs with `get_metrics`; names alone are ambiguous when several integrations define the same one (two `Placed Order` metrics, from Shopify and from an API integration, is common).
- **The denominator** for any rate: recipients, delivered, opens, sessions.
- **The scope:** the whole account, or only this storefront. `references/storefront-events.md` says how to tell the storefront's activity apart.

Ask when the question leaves one of these open and the answer depends on it.

## Step 2 — Answer it

`references/questions.md` has recipes for common questions: revenue by channel, campaigns ranked by click rate, flow reach and engagement, storefront signups, form performance, Shop Agent usage, and one shopper's history. In general:

- **Event counts, sums and trends:** `query_metric_aggregates`, with the metric ID, the measurement (`count`, `sum_value`, `unique`), the date range, an interval, and a grouping where the metric supports it.
- **Campaigns and flows:** `get_campaign_report` and `get_flow_report`, with the statistics you need and the conversion metric (usually Placed Order) for revenue.
- **Forms and segments:** `query_form_values`, `query_form_series`, `query_segment_values`, `query_segment_series`.
- **One shopper:** `get_profiles` with an email filter, then `get_profile` and `get_events` for their activity.

Report every number with its date range, metric and denominator, and say what the data can't answer: sparse events, no attribution, or a metric the account doesn't have. Don't pad a weak answer, and don't compute numbers the tools didn't return.

Profiles and events contain shoppers' personal data. Show only what the question needs, and don't copy it into files or other tools.

## Step 3 — Draft a campaign, if asked

Follow `references/drafts.md`: a segment with `create_segment`, an email with `create_email_template`, and a campaign with `create_campaign` that uses both, every one named `Vercel Shop - <purpose>`. Show the user the segment definition, the subject line and the audience size estimate first, and create nothing until they approve.

End by telling the user where the draft is and that it sends only when a person schedules or sends it in Klaviyo.

## Pitfalls

- **Revenue per message that comes back near zero.** Many accounts attribute little revenue to individual campaigns or flows, so check attribution with a channel breakdown before ranking messages by revenue, and say so if it's thin.
- **A funnel with no middle.** If Added to Cart is rare or missing for the period (common before a storefront's events are flowing), a view-to-cart-to-order funnel is misleading. Count each step and say which one is sparse.
- **The wrong Placed Order.** Pick the metric by its integration, and say which one you used.
- **"Last 30 days" versus "last month".** Say which window every number covers.
- **A campaign sent by accident.** This skill only drafts. If the user asks to send, tell them to send it from Klaviyo.

## Reference files

- `references/questions.md`: recipes for common questions, with the tools and parameters
- `references/storefront-events.md`: what a Vercel Shop storefront sends to Klaviyo, and how to isolate it
- `references/drafts.md`: building a segment, template and campaign as drafts
