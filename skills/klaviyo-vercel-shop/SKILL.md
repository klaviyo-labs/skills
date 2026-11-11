---
name: klaviyo-vercel-shop
description: >
  Use this skill when someone wants to add Klaviyo to a Vercel Shop storefront (the Next.js and Shopify
  template from vercel.shop), or says "connect Klaviyo to my Vercel shop", "track product views and
  add to cart in Klaviyo", "add an email signup to my headless Shopify store", "add back in stock
  alerts", or "why aren't my storefront events showing up in Klaviyo". Covers connecting the Klaviyo
  account, adding consent-gated onsite tracking on the Hydrogen analytics bus, a footer signup form,
  back-in-stock alerts, identifying signed-in customers, a welcome flow, Vercel environment variables,
  and verifying events arrive. For Shop Agent, onsite forms or reporting, use klaviyo-vercel-shop-agent,
  klaviyo-onsite-forms or klaviyo-store-analytics after this one.
disable-model-invocation: true
---

# Klaviyo for Vercel Shop

This skill connects a Vercel Shop storefront to Klaviyo, so browsing and cart activity, email signups and back-in-stock requests reach Klaviyo, and the flows Klaviyo already runs for Shopify stores (welcome, browse abandonment, abandoned cart, back in stock) work on the headless storefront too. Shopify still owns the catalog, orders and checkout, and Klaviyo's Shopify integration still syncs them. The storefront only adds what a headless site would otherwise lose: onsite activity, which used to come from the Shopify theme.

The integration is a destination on the Hydrogen analytics bus that Vercel Shop already uses. It never publishes events itself, it loads `klaviyo.js` only after the shopper's consent allows tracking, and it uses only the public API key (the six-character site ID) and Klaviyo's client APIs. **No Klaviyo private API key ever goes into the storefront, its Vercel environment, or a commit.**

Work through the steps in order. Ask before every write to the user's Klaviyo account or Vercel project.

## Step 0 — Check the project

1. Confirm this is Vercel Shop: `package.json` has `"name": "vercel-shop"`, and `lib/analytics/client.ts` exports `addAnalyticsDestination`. Read the `version`. This skill was written against `2026.10.2`; on a later version, read each file before editing it rather than trusting the anchors in `references/code-changes.md`.
2. Check whether Klaviyo is already there. If `lib/klaviyo/index.ts` exists, don't copy anything over it: compare it with [assets/lib/klaviyo/index.ts](assets/lib/klaviyo/index.ts), report the differences, and ask before replacing it. Every edit in `references/code-changes.md` says how to tell it's already applied.
3. Check whether the Vercel project is linked (`.vercel/project.json` exists). If not, and the user wants environment variables set from the terminal, ask them to run `vercel link`.

## Step 1 — Ask what the user has and wants

Ask these together and wait for every answer:

1. **How is Klaviyo connected?** Through the Klaviyo integration on the Vercel Marketplace (the public key is already in the project's environment), through the Klaviyo MCP server in this agent, or neither (they'll paste the public key).
2. **Which features?** Onsite tracking is always on. The footer signup form needs a list. Back-in-stock alerts need Back in Stock turned on in Klaviyo and the Shopify catalog synced. Signed-in customers are identified automatically when Vercel Shop's customer accounts are on (`auth.isEnabled`); there's nothing to choose.
3. **Is Klaviyo's Shopify integration connected to the same Klaviyo account?** Product-matched flows, back in stock and order events depend on it. The storefront doesn't replace it.
4. **Does the public key have a domain allowlist?** If it does, every storefront host has to be on it, or client calls return `403`.

`references/account-setup.md` explains each answer and what to do about it.

## Step 2 — Set up the Klaviyo side

Follow `references/account-setup.md`:

- with the Marketplace integration, pull the existing variables;
- with the MCP server, read the account, pick or create the signup list, and offer a welcome flow;
- otherwise, have the user paste the public key and list ID.

Confirm the account name with the user before writing anything to it. Never pick a list for them, and never set a flow live without asking: a live flow emails every new list member.

## Step 3 — Add the code

1. Copy these files into the project at the same paths, unchanged:
   - [assets/lib/klaviyo/index.ts](assets/lib/klaviyo/index.ts): event names, payload mapping, the client API call
   - [assets/lib/klaviyo/client.ts](assets/lib/klaviyo/client.ts): the consent-gated call queue and the one `klaviyo.js` loader
   - [assets/components/analytics/klaviyo-client.tsx](assets/components/analytics/klaviyo-client.tsx): registers the `klaviyo` destination on the bus
   - [assets/components/klaviyo/email-capture-form.tsx](assets/components/klaviyo/email-capture-form.tsx): signup and back-in-stock forms
   - [assets/components/klaviyo/identify.tsx](assets/components/klaviyo/identify.tsx): identifies a signed-in customer
2. Apply every edit in `references/code-changes.md`: the config flags, the destination slot in the Shopify scripts tracker, the product image on Viewed Product, the footer form, the back-in-stock form, account identification, `.env.example` and `turbo.json`. Turn off the config flags for features the user didn't choose rather than skipping their edits. Tell the user that turning Klaviyo on also loads Shopify's analytics scripts and, in consent regions, its consent banner (edit 2 explains why).
3. If the storefront sets a Content Security Policy, add Klaviyo's hosts from `references/csp.md`. Stock Vercel Shop sets none.
4. Run `pnpm typecheck` and `pnpm lint`, and fix what they report before going on.

## Step 4 — Set the environment and deploy

The public key goes in `NEXT_PUBLIC_KLAVIYO_COMPANY_ID`, and the signup list in `NEXT_PUBLIC_KLAVIYO_LIST_ID`, in all three Vercel environments. `vercel env add` reads the value from stdin:

```bash
for env in development preview production; do
  printf %s "$COMPANY_ID" | vercel env add NEXT_PUBLIC_KLAVIYO_COMPANY_ID "$env" --force
  printf %s "$LIST_ID" | vercel env add NEXT_PUBLIC_KLAVIYO_LIST_ID "$env" --force
done
vercel env pull .env.development.local --yes
```

`next dev` gives `.env.development.local` priority over `.env.local`. `NEXT_PUBLIC_` values are compiled into the bundle, so if the project is already deployed, ask before redeploying (`vercel deploy --prod`): the live site only picks them up after a new build.

## Step 5 — Hand over what only the user can do

Tell the user, in one list, what's left in Klaviyo that has no API:

- connect Klaviyo's Shopify integration (Integrations, then Shopify), if it isn't;
- add every storefront host to the public key's allowlist, if it has one;
- turn on Back in Stock, if they chose it.

## Step 6 — Verify

Run `pnpm dev` with `NEXT_PUBLIC_KLAVIYO_DEBUG="1"` and watch the browser console:

1. Load the home page: `[klaviyo] klaviyo.js loaded after consent`, once (after accepting the consent banner, in a consent region).
2. Open a product: `Viewed Product`, with a numeric `ProductID`.
3. Add it to the cart: one `Added to Cart`, after the cart confirms.
4. Go to another page: `page change`.
5. Submit the footer form with a new test address on a domain the user controls. In Klaviyo, that profile shows the list subscription and the events from steps 2 and 3.
6. If a welcome flow is live, the profile shows Received Email within a few minutes. A profile enters a list-triggered flow only the first time it joins, so use a new address for each test.

Debug mode logs every call even without a public key, so the code can be checked before the account is connected. When something doesn't arrive, read `references/troubleshooting.md`.

## Next

- **Shop Agent:** `klaviyo-vercel-shop-agent` lets the storefront's AI shopping assistant sign shoppers up for back-in-stock alerts and records that it did.
- **Popups and embedded forms:** `klaviyo-onsite-forms` builds them, scoped to this storefront.
- **Reporting:** `klaviyo-store-analytics` answers questions about the storefront's signups, events and flows.

## Pitfalls

- **A private key in the storefront.** Everything here runs in the shopper's browser or a shopper-facing agent. A private key there can read and change the whole Klaviyo account. Refuse, even for a "quick test".
- **A second `klaviyo.js`.** A manual `<script>`, a tag manager, or a Shopify app embed on the same domain double-counts events and breaks form state. Load it only through `lib/klaviyo/client.ts`.
- **Registering the destination twice.** Removing and re-adding a destination replays the bus buffer and duplicates every event. `klaviyo-client.tsx` registers once per page lifetime; keep it that way.
- **Calling `klaviyo.js` from the destination's `setup()`.** `setup()` isn't consent-gated. Only the subscribed event handlers are.
- **Recomputing prices or IDs.** They come from the bus payloads, which come from Shopify. Klaviyo's Shopify catalog keys products by numeric ID, which `toShopifyNumericId` derives from the Storefront API GID.
- **Repointing a live store's emails.** Changing the Shopify catalog's product URL base in Klaviyo repoints every existing email at the new storefront. Leave it alone if the Shopify store already has a live storefront.
- **`no-banner` consent mode.** Visitors in consent regions never grant consent, so Klaviyo never loads for them. Keep `default-banner` unless the storefront supplies its own consent UI.

## Reference files

- `references/account-setup.md`: the four questions, the MCP setup, the welcome flow definition, and the manual path
- `references/code-changes.md`: every edit to existing Vercel Shop files, with anchors and an already-applied check
- `references/csp.md`: Klaviyo's hosts for a Content Security Policy
- `references/troubleshooting.md`: symptoms, causes and fixes
- `assets/`: the five new files, at the paths they belong in the project
