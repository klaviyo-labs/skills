# Setting up the Klaviyo account for Vercel Shop

This file covers the Klaviyo side of connecting a Vercel Shop storefront: what to ask the user, how to get the public API key and signup list into the project, and how to give the list a welcome email. Every write to the account needs the user's approval first.

## The four questions

### 1. How is Klaviyo connected?

- **The Klaviyo integration on the Vercel Marketplace.** Installing it sets `NEXT_PUBLIC_KLAVIYO_COMPANY_ID` in every environment of the project. Run `vercel env pull .env.development.local --yes` to get it locally, then ask for a list ID if they want the signup form.
- **The Klaviyo MCP server in this agent.** Set everything up from the terminal, as in "Set up with the MCP server" below.
- **Neither.** Ask for the public API key: in Klaviyo, Settings, then API keys, under Public API Key / site ID. It's six characters. Set it as `NEXT_PUBLIC_KLAVIYO_COMPANY_ID` (see "Set up by hand").

If the user offers a private key (it starts with `pk_`), don't use it, and tell them not to paste it anywhere. The storefront needs only the public key.

### 2. Which features?

| Feature | Needs |
|---|---|
| Onsite tracking: Viewed Product, Added to Cart, Viewed Collection, Submitted Search, Active on Site, and Klaviyo popups and flyouts | Only the public key |
| Footer signup form | A list for `NEXT_PUBLIC_KLAVIYO_LIST_ID`. There's no default: ask which list signups join |
| Back-in-stock form on sold-out product pages | Back in Stock turned on in Klaviyo, and the Shopify catalog synced to Klaviyo |
| Identifying signed-in customers | Vercel Shop's customer accounts turned on (`auth.isEnabled`) |

### 3. Is Klaviyo's Shopify integration connected?

Vercel Shop replaces the Shopify theme, not Shopify, so Klaviyo's Shopify integration still brings in the catalog, orders, customers and checkout events. Without it, product-matched flows, back-in-stock alerts and revenue attribution don't work, because the storefront's events refer to products Klaviyo doesn't know.

If it isn't connected, the user connects the same Shopify store in Klaviyo (Integrations, then Shopify) and turns on catalog and order sync.

If this storefront will be the store's only storefront, they can also set the Shopify catalog's product URL base to the storefront's production domain, so emails link here instead of to the `myshopify.com` theme. If the Shopify store already has a live storefront, leave the URL base alone: changing it repoints every existing email.

### 4. Does the public key have a domain allowlist?

In Klaviyo, Settings, API keys, then Manage options under the public key. If the allowlist has any entries, every host the storefront runs on has to be on it: the `.vercel.app` production domain, preview domains if they test there, any custom domain (`example.com` and `*.example.com` for the root and its subdomains), and `127.0.0.1` for local development, which is what Klaviyo's allowlist documentation names, so open the dev server at `http://127.0.0.1:3000`. The list takes up to 20 entries, separated by commas.

Until then, client API calls from a missing host are rejected (`403`): forms still display but don't submit, `klaviyo.js` tracks no events, and profiles aren't identified. The Manage options dialog also shows which domains used the key in the last seven days, which confirms whether a host is reaching Klaviyo at all.

The allowlist has no API, so the user changes it in Klaviyo. An empty allowlist accepts every host. Its "Allow empty domains" setting, on by default, lets calls without a browser referrer through, such as Shop Agent's server-side back-in-stock tool.

## Set up with the MCP server

Klaviyo's MCP server is at `https://mcp.klaviyo.com/mcp` and signs in with OAuth, so no key passes through the chat. In Claude Code: `claude mcp add --transport http klaviyo https://mcp.klaviyo.com/mcp`, then sign in from `/mcp`. In other agents, add the same URL as a remote MCP server.

1. See what the Vercel project already has. Match the variable names, not the word "klaviyo", which can be in the team name, and keep the fallback because `grep` exits non-zero on no match:

   ```bash
   vercel env ls 2>&1 | grep NEXT_PUBLIC_KLAVIYO || echo "No Klaviyo variables on this project yet"
   ```

2. Call `get_account_details`. Read the account name, the public API key, and the default sender name and email. **Confirm the account name with the user** before writing anything: an agent signed in to the wrong account writes to the wrong store.
3. Pick the signup list. Call `get_lists` and `get_flows`, and show the user every list with its opt-in setting and any live flow it triggers, plus "Create a new list". Never pick one for them. A list that already triggers a welcome flow is a good suggestion, but say what it means: storefront signups get the same emails as the store's other signups.
   - **Existing list:** use its ID, and change nothing on it unless asked.
   - **New list:** ask for a name (suggest "<store name> website signups") and call `create_list`. Ask whether new signups should confirm by email first (double opt-in) or not (single opt-in), and call `update_list` to match.
4. Make sure the list sends a welcome email. If a live flow already triggers on it, say so and move on. Otherwise offer one, and skip it if the user declines:
   1. `create_email_template` named `Vercel Shop - Welcome email`: a short HTML email in the store's voice, with a button to the storefront's production URL and `{% unsubscribe 'Unsubscribe' %}` in the footer.
   2. `create_flow` named `Vercel Shop - Welcome`, with the definition below, the sender from step 2 and the template from step 4.1.
   3. Ask the user, then call `update_flow` to set it live. A live flow emails every new list member.

   ```json
   {
     "triggers": [{ "type": "list", "id": "<list ID>" }],
     "profile_filter": null,
     "entry_action_id": "welcome",
     "actions": [
       {
         "temporary_id": "welcome",
         "type": "send-email",
         "links": { "next": null },
         "data": {
           "message": {
             "name": "Welcome email",
             "from_email": "<default sender email>",
             "from_label": "<default sender name>",
             "subject_line": "Welcome to <store name>",
             "preview_text": "You're on the list for new drops and restocks.",
             "template_id": "<template ID>",
             "smart_sending_enabled": false,
             "transactional": false,
             "add_tracking_params": true
           },
           "status": "live"
         }
       }
     ]
   }
   ```

   The message's `"status": "live"` only makes the email active inside the flow. The flow itself is created as a draft until `update_flow` sets it live.

5. Set `NEXT_PUBLIC_KLAVIYO_COMPANY_ID` and `NEXT_PUBLIC_KLAVIYO_LIST_ID` in every environment, as in Step 4 of `SKILL.md`.

## Set up by hand

Without the MCP server, the user reads the values in Klaviyo and you set them:

- the public key, from Settings, API keys;
- the list ID, from Audience, Lists & segments, then the list's Settings.

Put them in `.env.local` for local development, and in all three environments on Vercel with the loop in Step 4 of `SKILL.md`, or in the project's Environment Variables settings. Suggest the user builds a welcome flow on the list in Klaviyo's flow builder.

## What the public key can and can't do

The public key identifies the account to Klaviyo's client APIs (`/client/subscriptions`, `/client/back-in-stock-subscriptions`, `/client/events`, `/client/profiles`) and to `klaviyo.js`. It can create subscriptions, events and profiles, and nothing else: it can't read data. That's why it's safe in a browser bundle, and why it's the only key this integration uses.
