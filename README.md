# Klaviyo Agent Skills

Skills that give a coding agent the context it needs to work with Klaviyo's API and MCP server. Each
directory under `skills/` is one skill in the [Agent Skills](https://agentskills.io/specification)
format.

## Installation

Install any skill by name:

```sh
npx skills add klaviyo-labs/skills --skill <name>
```

## Available Skills

Supported skills live in [`skills/`](./skills/):

- **klaviyo-new-oauth** — Set up a new OAuth app and its authorization flow.
- **klaviyo-migrate-oauth** — Move an existing integration from API keys to OAuth.
- **klaviyo-vercel-shop** — Add Klaviyo to a Vercel Shop (Next.js and Shopify) storefront: consent-gated onsite tracking, a signup form, back-in-stock alerts, customer identification, a welcome flow and event verification.
- **klaviyo-vercel-shop-agent** — Let a Vercel Shop storefront's Shop Agent sign shoppers up for back-in-stock alerts through a Klaviyo agent tool, and record agent usage for segmentation.
- **klaviyo-onsite-forms** — Create, edit, publish and unpublish a Klaviyo popup, flyout or embedded form on a headless storefront, targeted only to that storefront's hosts.
- **klaviyo-store-analytics** — Answer storefront performance questions through the Klaviyo MCP server, and build segments, templates and campaigns as drafts a person reviews and sends.

## Experimental Skills

[`experimental/`](./experimental/) holds skills we are still developing. Treat them as previews:

- We don't commit to supporting them, and they get less review and testing than the skills in
  [`skills/`](./skills/).
- Klaviyo's developer site leaves them out of its skill index, so installing from the site doesn't
  include them. Install one by name, as above.
- [`experimental/README.md`](./experimental/README.md) lists them and explains what to expect.

## About this repository

This repository is a read-only mirror, published automatically from an internal repository. Changes
made here are overwritten. To report a problem or suggest a change, open an issue.
