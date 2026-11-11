# Building a draft campaign from storefront data

A draft campaign is three things: a segment (who), an email template (what), and a campaign that joins them. All three are created through the Klaviyo MCP server, named `Vercel Shop - <purpose>`, and left for a person to review and send in Klaviyo. Nothing here sends a message.

## Before creating anything

Show the user, and wait for approval:

1. the segment definition in plain words ("viewed a product in the last 30 days, and placed no order in the last 30 days");
2. the subject line, preview text and a summary of the email;
3. the sender (the account's default from `get_account_details`, unless they name another).

## 1. The segment

`create_segment` named `Vercel Shop - <audience>`. A common one, people who viewed but didn't buy:

- condition 1: `Viewed Product` at least once in the last 30 days;
- condition 2: `Placed Order` zero times in the last 30 days, using the Shopify Placed Order metric;
- optionally, a third condition to exclude profiles who can't receive email marketing.

Use metric IDs from `get_metrics`. Segments fill in asynchronously, so a new segment can show zero members for a few minutes. `query_segment_values` gives its size once it's built.

## 2. The template

`create_email_template` named `Vercel Shop - <purpose> email`: short HTML in the store's voice (ask for a sample, or read the store's recent campaigns with `get_campaigns` and `get_campaign_message`), one clear call to action linking to the storefront, and `{% unsubscribe 'Unsubscribe' %}` in the footer. Never invent offers, prices or discount codes: ask for them.

## 3. The campaign

`create_campaign` named `Vercel Shop - <purpose> (draft)`, with the segment as the audience, an email message with the subject line and preview text, and the template assigned (`assign_template_to_campaign_message` if it isn't set at creation). Don't schedule it.

## Afterwards

Tell the user the campaign's name, its audience size, and that it sends only when someone schedules or sends it in Klaviyo. To remove a draft later, delete the campaign, then the template and segment if nothing else uses them.
