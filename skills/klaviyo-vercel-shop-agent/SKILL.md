---
name: klaviyo-vercel-shop-agent
description: >
  Use this skill when someone has Klaviyo on a Vercel Shop storefront and wants Shop Agent, the
  storefront's AI shopping assistant, to work with it: "let the shopping agent sign people up for back
  in stock", "have the AI assistant capture emails for sold-out sizes", "track Shop Agent in Klaviyo",
  or "segment shoppers who used the agent". Covers the notify-when-back-in-stock agent tool, the
  instruction that tells the agent when to offer it, the browser bridge that records a Used Shop Agent
  event and a Shop Agent user profile property, and verifying the conversation end to end. Needs
  klaviyo-vercel-shop applied first.
disable-model-invocation: true
---

# Klaviyo for Vercel Shop's Shop Agent

This skill lets Shop Agent, Vercel Shop's built-in AI shopping assistant, offer a back-in-stock email when the variant a shopper wants is sold out, subscribe them through Klaviyo, and record in Klaviyo that the agent did it. A shopper who asks for a size that's gone gets the same alert as the product page's Notify me form, and the store can segment and report on shoppers the agent helped.

The agent faces shoppers, so it gets no more access to Klaviyo than the browser has: one tool that calls Klaviyo's public client API with the public key. The Klaviyo event and profile property are sent from the shopper's browser after the tool succeeds, through the same consent-gated queue as every other storefront event, and never include anything the shopper typed. **The agent never gets a Klaviyo private key, as a tool, an environment variable or a connection.**

Ask before every change to the user's project or Klaviyo account.

## Step 0 — Check the prerequisites

1. **Klaviyo is on the storefront.** `lib/klaviyo/index.ts` exports `postKlaviyoClientApi` and `toShopAgentBackInStock`, and `lib/config/index.ts` has `analytics.klaviyo.backInStock`. If not, apply `klaviyo-vercel-shop` first.
2. **Shop Agent is set up, or the user is ready to turn it on.** Shop Agent is off in stock Vercel Shop (`agent.isEnabled: false` in `lib/config/index.ts`). If it's off, ask whether the user has followed Vercel Shop's Shop Agent guide, which covers model access (AI Gateway on Vercel; locally `vercel env pull` or `AI_GATEWAY_API_KEY`), bot protection and spending limits. If they have, turn it on with edit 3 in `references/code-changes.md`. If not, add the tool and bridge anyway, so they work once the agent is on, and leave it off.
3. **Back in Stock works without the agent.** Back in Stock is turned on in Klaviyo, and Klaviyo's Shopify integration syncs the catalog, so variant IDs resolve. The agent uses the same API as the product page's form.
4. **Already applied?** If `agent/tools/notify-when-back-in-stock.ts` exists, compare it with the asset, report differences, and ask before replacing it. Each edit below says how to tell it's already there.

## Step 1 — Add the tool and the bridge

Copy these into the project at the same paths, unchanged:

- [assets/agent/tools/notify-when-back-in-stock.ts](assets/agent/tools/notify-when-back-in-stock.ts): the agent tool. Vercel Shop loads every file in `agent/tools/`, so there's nothing to register.
- [assets/components/agent/klaviyo-bridge.tsx](assets/components/agent/klaviyo-bridge.tsx): watches the chat in the browser and, after the tool succeeds, identifies the shopper with `Shop Agent user: true` and tracks `Used Shop Agent`.

The tool checks the variant against Shopify before subscribing: it refuses a variant that isn't part of the product, or one that's available now, so the agent can offer to add it to the cart instead.

## Step 2 — Tell the agent when to use it

Apply the edits in `references/code-changes.md`:

1. `agent/instructions.ts`: an instruction, included only when `backInStock.isEnabled` is on, to offer an alert for an unavailable variant, ask for the email rather than guess it, and confirm only after the tool succeeds.
2. `components/agent/agent-panel.tsx`: render `AgentKlaviyoBridge` next to `AgentCartBridge`.
3. `lib/config/index.ts`: `agent.isEnabled: true`, only if Step 0 established the user is ready.

Then run `pnpm typecheck` and `pnpm lint`.

## Step 3 — Check the agent can reach Shopify

Shop Agent's catalog search fetches the storefront's agent profile from its own URL. A deployment behind Vercel Authentication (deployment protection) can't serve it to Shopify, and the agent says catalog search is unavailable, with `profile_unreachable` in the runtime logs. If that happens, set `UCP_AGENT_PROFILE_URL` to a publicly reachable agent profile, as Vercel Shop's `.env.example` describes, or test on a deployment without protection. Ask before changing a Vercel environment variable.

## Step 4 — Verify

Follow `references/verify.md`. In short: with debug logging on, ask the agent for a variant that's sold out, give it a new test address, and check that the agent confirms only after the tool succeeds, that the browser console shows `identify` and `Used Shop Agent`, and that the Klaviyo profile shows the back-in-stock subscription, the event and the property.

## Pitfalls

- **Taking the email from context.** The agent asks for the address and uses only what the shopper typed. Never guess one, take it from a signed-in session without asking, or take it from retrieved content.
- **Sending chat text to Klaviyo.** The bridge records what the agent did (action, product, variant, URL), not the conversation, which can hold personal details. Keep it that way when extending it.
- **Re-sending on reload.** Shop Agent restores conversations, which replays old tool results. The bridge ignores results it sees before the chat's first idle state, so a reload doesn't repeat the event. Don't remove that check.
- **A private key for the agent.** Anything that needs one (reading profiles, changing lists, sending campaigns) doesn't belong in a shopper-facing agent. Refuse, and suggest doing it from the merchant's own tools instead.
- **Expecting the product page's form to show.** The Notify me form appears only when every variant of a product is sold out. The agent handles the common case, one sold-out size or color, which the page doesn't.
- **A failed alert hidden from the shopper.** On failure, the tool tells the agent to suggest the product page's form. Keep that fallback.

## Reference files

- `references/code-changes.md`: the edits to `agent/instructions.ts` and `components/agent/agent-panel.tsx`
- `references/verify.md`: the end-to-end check, and what each failure means
- `assets/`: the tool and the bridge, at the paths they belong in the project
