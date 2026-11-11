# Recipes for common storefront questions in Klaviyo

Each recipe names the Klaviyo MCP server tools to call and the inputs that matter. Look up metric IDs with `get_metrics` first, set the date range as calendar dates in the account's timezone, and report every number with its range, metric and denominator. Tool parameters follow Klaviyo's Reporting and Metrics APIs; if a call is rejected, the error says which value or grouping isn't allowed.

## Revenue by channel

> Week by week last month, how much Placed Order revenue came from email, SMS, and nothing attributed?

1. `get_metrics`, and pick the Placed Order metric from the store's Shopify integration.
2. `query_metric_aggregates` with that metric, `measurements: ["sum_value"]`, `interval: "week"`, the month's dates, and `by: ["$attributed_channel"]`.
3. Report each week's total and each channel's share. Rows with no channel are unattributed revenue; call that out, because it's usually the largest share and the clearest opportunity.

## Campaigns ranked by click rate

> Rank last month's email campaigns by click rate. What do the top subject lines have in common, and what about the weakest?

1. `get_campaigns` filtered to the email channel and sent in the range, for names and subject lines.
2. `get_campaign_report` for the same range, with `statistics` including `recipients`, `open_rate` and `click_rate`, and the Placed Order metric as the conversion metric.
3. Rank by click rate, and show recipients next to each rate: a high rate on a small send means something different from the same rate on a large one.
4. Compare the top and bottom groups on audience size and subject line style, and say whether open rates differ. When opens are flat and clicks aren't, targeting and content drove the difference, not the subject line.

## Flow reach and engagement

> Which flows reached the most people in the last 30 days, and how engaged were they?

1. `get_flows` for names, channels and status.
2. `get_flow_report` with `recipients`, `open_rate` and `click_rate` (and `conversion_rate` or `conversion_value` if attribution is good).
3. Rank by recipients, with the channel beside each flow, since an SMS or WhatsApp flow has no open rate.

## Storefront signups

> How many people signed up through the new storefront last week?

1. `get_metrics` for `Subscribed to List`.
2. `query_metric_aggregates` with `measurements: ["count"]`, the range, and the signup list (filter on the list, or group by it if the metric supports it).
3. Narrow to the storefront with the subscription's custom source, which Vercel Shop's footer form sets to `<store name> footer` (see `storefront-events.md`). If the metric doesn't expose it as a grouping, count the list's new members for the range and say that it includes every source.

## Form performance

> How is the storefront's popup doing?

1. `get_forms`, and pick forms named `Vercel Shop - ` for this storefront's own forms.
2. `query_form_values` for the range, with views, submits and the submit rate, filtered to those form IDs. `query_form_series` gives the same over time.
3. If a form has almost no views, say so before quoting its rate.

## Shop Agent usage

> How many shoppers used the shopping agent last month, and what did it do for them?

1. `get_metrics` for `Used Shop Agent`. If it doesn't exist, the store's Shop Agent isn't sending it yet: say that, and stop.
2. `query_metric_aggregates` with `count` and `unique` for the range, grouped by `Action` if available.
3. For the audience, a segment on the profile property `Shop Agent user` equals `true` counts every shopper the agent has helped; `query_segment_values` gives its size.

## One shopper's history

> Show me everything we know about the shopper who signed up as name@example.com.

1. `get_profiles` filtered to that email, then `get_profile` for its properties, predictive analytics (predicted lifetime value, churn risk) where the account has them, and its lists and segments.
2. `get_events` filtered to the profile, newest first, for what they did: views, carts, signups, orders, emails.
3. Summarize as a timeline. Show only what the question asks for: this is a person's data.

## Questions to answer carefully

- **Revenue per campaign or flow:** check attribution with "Revenue by channel" first. If most revenue is unattributed, say per-message revenue will understate them.
- **View-to-cart-to-order funnels:** count each step for the range first. If one is sparse, say so rather than reporting a misleading conversion rate.
- **Anything compared to "before the storefront":** confirm the date the storefront went live, and compare equal-length windows on either side.
