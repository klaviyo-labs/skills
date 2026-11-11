# Verifying Shop Agent's back-in-stock alerts

This check proves the whole path: the agent offers an alert for a sold-out variant, subscribes the shopper through Klaviyo, and the storefront records that the agent did it. It writes a real back-in-stock subscription to the user's Klaviyo account, so use a new test address on a domain the user controls, and say so before starting.

## Find a sold-out variant

The test needs a product with at least one unavailable variant. Ask the user for one, or find one through the agent itself: ask for a product, then for its options, and look for a size or color it says is unavailable. A product where every variant is sold out also shows the product page's Notify me form, which tests the same API without the agent.

## Run the conversation

1. Run `pnpm dev` with `NEXT_PUBLIC_KLAVIYO_DEBUG="1"`, open the storefront, accept the consent banner if one shows, and open the browser console.
2. Open Shop Agent and ask for the sold-out variant by name, size and color: "Do you have the <product> in <color>, size <size>?"
3. The agent should say it's unavailable and offer an email when it's back. If it doesn't offer, check the instruction edit and that `backInStock.isEnabled` is on.
4. Give it the test address. The agent should confirm only after the tool returns. The tool runs on the server, so the `pnpm dev` terminal logs `[klaviyo] POST /client/back-in-stock-subscriptions`. Then the browser console shows `identify` with `Shop Agent user: true`, and `Used Shop Agent`.
5. In Klaviyo, look up the test profile. It should show Subscribed to Back in Stock for that variant, a `Used Shop Agent` event, and the `Shop Agent user` property. Client API calls are processed asynchronously, so allow a few minutes.
6. Reload the page. The restored conversation must not log a second `Used Shop Agent`.

## When a step fails

| What happens | Why | Fix |
|---|---|---|
| The agent says catalog search is unavailable | Shopify can't fetch the storefront's agent profile, usually because of deployment protection (`profile_unreachable` in the runtime logs) | See Step 3 of `SKILL.md` |
| The agent says alerts are unavailable at this store | `backInStock.isEnabled` is off, or no public key is set and debug mode is off | Check `lib/config/index.ts` and `NEXT_PUBLIC_KLAVIYO_COMPANY_ID` |
| The agent says the variant is available now | The variant is in stock; the tool refuses rather than subscribe to something purchasable | Pick a sold-out variant, or let the agent add it to the cart |
| The tool fails and the agent suggests the product page's form | Klaviyo rejected the subscription: Back in Stock is off, the public key is wrong, or the catalog hasn't synced, so the variant is unknown | Check each in Klaviyo. The call comes from the server without a browser referrer, so the public key's allowlist passes it unless "Allow empty domains" is turned off |
| Subscription arrives, but no event or property | Consent wasn't granted, or the host isn't on the public key's allowlist, so `klaviyo.js` calls are blocked | Accept the banner; add the host to the allowlist |
| The event arrives twice after a reload | The bridge's replay check was changed | Restore `components/agent/klaviyo-bridge.tsx` from the asset |
