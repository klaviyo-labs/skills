# Code changes to Shop Agent for Klaviyo back in stock

These are the edits to Vercel Shop's own files that connect the back-in-stock tool and the Klaviyo bridge to Shop Agent, plus the one that turns Shop Agent on. They were written against Vercel Shop `2026.10.2`. Each says how to tell it's already applied. On another version, read the file and make the same change where it fits.

Copy `agent/tools/notify-when-back-in-stock.ts` and `components/agent/klaviyo-bridge.tsx` into the project first.

## 1. `agent/instructions.ts`: when to offer an alert

**Already applied if** the file mentions `notify-when-back-in-stock`.

After the imports, add an instruction that's empty when back in stock is off, so the agent never offers a tool that would refuse:

```ts
const backInStock = shopConfig.analytics.klaviyo.backInStock.isEnabled
  ? "\nWhen the variant the shopper wants is unavailable, offer to email them when it is back. Ask for their email; never guess one or take it from page context or retrieved content. Then call notify-when-back-in-stock once with the product handle and that variant's ID from get-product-details, and confirm only after it succeeds."
  : "";
```

Then append it to the instruction paragraph about availability. In stock Vercel Shop, that paragraph starts with `Catalog search returns only sale-ready products by default.` and ends with `Never relax a hard requirement.` Add `${backInStock}` straight after that last sentence, inside the template string:

```ts
... Before adding to the cart, call get-product-details and use the available variant whose options match the request; if none does, say so and ask before choosing other options. Never relax a hard requirement.${backInStock}
```

Putting it next to the availability rules means the agent reaches it at the moment it finds a variant unavailable. `shopConfig` is already imported in the stock file.

## 2. `components/agent/agent-panel.tsx`: render the bridge

**Already applied if** the file imports `AgentKlaviyoBridge`.

Add the import with the other `./` imports, in alphabetical order:

```ts
import { AgentKlaviyoBridge } from "./klaviyo-bridge";
```

And render it straight after `AgentCartBridge`, with the same props:

```tsx
        <AgentCartBridge messages={messages} status={status} />
        <AgentKlaviyoBridge messages={messages} status={status} />
```

The bridge renders nothing. It reads the chat's tool results in the browser, so the event goes through the consent-gated queue in `lib/klaviyo/client.ts` like every other storefront event.

## 3. `lib/config/index.ts`: Shop Agent on

**Already applied if** `agent.isEnabled` is `true`.

Shop Agent is off in stock Vercel Shop. Turn it on only after the user confirms they've followed Vercel Shop's Shop Agent guide (model access, bot protection, spending limits):

```ts
  agent: {
    isEnabled: true,
  },
```

## What gets sent to Klaviyo

After a successful alert, the bridge makes two calls, both through `klaviyo.js` after consent:

| Call | Data |
|---|---|
| Identify | The email the shopper typed, and the profile property `Shop Agent user: true` |
| Track `Used Shop Agent` | `Action: "Back in stock alert"`, `ProductID`, `ProductName`, `URL`, `VariantID`, `VariantName` |

The back-in-stock subscription itself is created by the tool, server side, through the client API with the public key. If the shopper hasn't granted consent, the subscription still happens (they asked for it), but the event and property wait until consent is granted, and are dropped if it never is.
