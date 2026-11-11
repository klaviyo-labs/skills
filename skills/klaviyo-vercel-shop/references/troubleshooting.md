# Troubleshooting Klaviyo on Vercel Shop

Start every investigation with `NEXT_PUBLIC_KLAVIYO_DEBUG="1"` and the browser console open. Every Klaviyo call the storefront makes is logged with a `[klaviyo]` prefix, so the first question is always whether the call happened and, if it did, what Klaviyo answered (the Network tab, filtered to `klaviyo`).

| Symptom | Likely cause | Fix |
|---|---|---|
| No `[klaviyo]` lines at all | `analytics.klaviyo.isEnabled` is off, or `isShopifyScriptsEnabled` doesn't include it, so the analytics bus never starts | Check edits 2 and 4 in `code-changes.md` |
| `[klaviyo]` lines, but never `klaviyo.js loaded after consent` | Consent hasn't been granted: the banner wasn't accepted, or `consent.mode` is `no-banner` in a consent region | Accept the banner, or set `default-banner` |
| `debug mode, no company ID` instead of `klaviyo.js loaded after consent` | `NEXT_PUBLIC_KLAVIYO_COMPANY_ID` isn't in the build | Set it, and restart `next dev` or redeploy: `NEXT_PUBLIC_` values are compiled in |
| `403` or a CORS error from `a.klaviyo.com/client/` | The public key's domain allowlist doesn't include this host | The user adds the host in Klaviyo (Settings, API keys, Manage options). Locally, add `127.0.0.1` and browse to `http://127.0.0.1:3000` |
| Footer form missing | `signupForm.isEnabled` is off, or `NEXT_PUBLIC_KLAVIYO_LIST_ID` is unset | Set both. Debug mode with no list ID shows the form against a placeholder list |
| Footer form says it worked, but the profile isn't on the list | The list uses double opt-in: the profile joins after confirming by email | Check the inbox, or switch the list to single opt-in if the user wants that |
| Welcome flow didn't send | The flow is a draft, or the test address was already on the list | Set the flow live (with the user's approval), and test with a new address |
| Back-in-stock form missing on a sold-out product | `backInStock.isEnabled` is off, or the product is available for sale | Check the flag, and test on a product with no available variant |
| Back-in-stock form errors | Back in Stock isn't turned on in Klaviyo, or the catalog hasn't synced, so the variant ID is unknown | Turn it on, and check that Klaviyo's Shopify integration syncs the catalog |
| Events arrive, but products don't match the catalog in emails | Klaviyo's Shopify integration isn't connected to the same account, or is connected to another store | Connect the same Shopify store in the same Klaviyo account |
| Every event arrives twice | Two copies of `klaviyo.js` (a manual tag, a tag manager or a Shopify app embed), or the destination registered twice | Remove the other copy. Don't change how `klaviyo-client.tsx` registers |
| Popups never show | `static-tracking.klaviyo.com` is blocked by a CSP, or the form targets another domain | See `csp.md`, and check the form's URL targeting in Klaviyo |
| Popup shows on one page, then never after client-side navigation | `PAGE_CHANGE` isn't reaching `klaviyo.js` | Check that `components/analytics/klaviyo-client.tsx` is unchanged |
| Signed-in customers aren't identified | Customer accounts are off (`auth.isEnabled`), or the account layout edit is missing | Check edit 9 in `code-changes.md` |
| Emails link to the `myshopify.com` theme | The Shopify catalog's product URL base in Klaviyo still points at the theme | Change it only if this is the store's only storefront; it repoints every existing email |

When the network shows a successful call and Klaviyo still doesn't show the activity, give it a few minutes: client API calls are accepted with `202` and processed asynchronously. Look up the test profile by email in Klaviyo, and check its activity feed rather than a report, which updates more slowly.
