# Code changes to Vercel Shop for Klaviyo

These are the edits to Vercel Shop's own files that connect the five new Klaviyo files to the storefront. They were written against Vercel Shop `2026.10.2`. Each one names the file, the anchor to find, the change, and how to tell it's already there, so running the skill twice changes nothing. On another version, read the file and make the same change where it fits, rather than forcing the anchor.

Copy the new files first (Step 3 of `SKILL.md`), or the imports below won't resolve. Put each new import in the file's existing group for its kind (`@/` aliases together, `./` relative imports together), in alphabetical order; `pnpm lint` checks the formatting.

## 1. `lib/config/types.ts`: the Klaviyo flags

**Already applied if** `analytics` has a `klaviyo` key.

Inside `export interface ShopConfig`, add `klaviyo` as the first key of `analytics`:

```ts
  analytics: {
    klaviyo: {
      backInStock: {
        isEnabled: boolean;
      };
      isEnabled: boolean;
      signupForm: {
        isEnabled: boolean;
      };
    };
    shopify: {
```

## 2. `lib/config/index.ts`: turn the features on

**Already applied if** `shopConfig.analytics` has a `klaviyo` key.

Add `klaviyo` as the first key of `analytics`, with each feature set to what the user chose:

```ts
  analytics: {
    klaviyo: {
      backInStock: {
        isEnabled: true,
      },
      isEnabled: true,
      signupForm: {
        isEnabled: true,
      },
    },
    shopify: {
```

Then add `shopConfig.analytics.klaviyo.isEnabled` to `isShopifyScriptsEnabled`, because the destination needs the analytics bus and consent that `ShopifyScripts` creates:

```ts
export const isShopifyScriptsEnabled =
  shopConfig.analytics.klaviyo.isEnabled ||
  shopConfig.analytics.shopify.isEnabled ||
  shopConfig.analytics.shopify.consent.isEnabled ||
  shopConfig.shopify.webmcp.isEnabled;
```

Leave `analytics.shopify.isEnabled` as it is unless the user also wants Shopify's own analytics, and keep `analytics.shopify.consent.mode` at `default-banner`.

Tell the user what this changes: with Klaviyo on, every page loads Hydrogen's `ShopifyScripts` (the analytics bus and Shopify's customer privacy API), and visitors in consent regions see Shopify's consent banner. That's what holds `klaviyo.js` back until consent. It happens as soon as the flag is on, even before a public key is set; only the Klaviyo destination itself waits for the key.

## 3. `components/analytics/shopify-client.tsx`: a slot for destinations

**Already applied if** `ShopifyScriptsTrackerProps` has `destinations`.

Add the prop to the interface:

```ts
interface ShopifyScriptsTrackerProps {
  destinations?: ReactNode;
  i18n: ShopifyScriptsI18n;
  shop: ShopifyScriptsShop;
}
```

Take it in the component signature:

```ts
export function ShopifyScriptsTracker({ destinations, i18n, shop }: ShopifyScriptsTrackerProps) {
```

And render it first inside `<AnalyticsReady>`, so the destination registers before the page-view tracker fires:

```tsx
      <AnalyticsReady>
        {destinations}
        <PageViewedTracker />
        <CartAnalyticsTracker />
      </AnalyticsReady>
```

The stock file already imports `ReactNode` from `react`.

## 4. `components/analytics/index.tsx`: pass the Klaviyo destination

**Already applied if** the file imports `KlaviyoTracker`.

Add the imports:

```ts
import { isKlaviyoConfigured } from "@/lib/klaviyo";

import { KlaviyoTracker } from "./klaviyo-client";
```

Replace the one-line `ShopifyScriptsTracker` render with:

```tsx
      {isShopifyScriptsEnabled && (
        <ShopifyScriptsTracker
          destinations={
            shopConfig.analytics.klaviyo.isEnabled && isKlaviyoConfigured ? (
              <KlaviyoTracker />
            ) : null
          }
          i18n={i18n}
          shop={shop}
        />
      )}
```

## 5. `components/analytics/trackers.tsx`: handle and image on Viewed Product

**Already applied if** the `ProductViewedTracker` payload includes `imageUrl`.

Klaviyo's Viewed Product event and its browse-abandonment emails need the product URL and image, which the stock payload leaves out. The stock file imports the Hydrogen types on one line (`import type { AnalyticsCart, CollectionViewPayload, ProductPayload } from "@shopify/hydrogen";`). Replace it with this, which adds `OtherData`:

```ts
import type {
  AnalyticsCart,
  CollectionViewPayload,
  OtherData,
  ProductPayload,
} from "@shopify/hydrogen";
```

Add `featuredImage` to the `product` prop's `Pick`:

```ts
  product: Pick<ProductDetails, "featuredImage" | "handle" | "id" | "title" | "vendor">;
```

And widen the payload, adding `handle` and `imageUrl`:

```ts
    const payload: ProductPayload & OtherData = {
      handle: product.handle,
      id: product.id,
      imageUrl: variant.image?.url ?? product.featuredImage?.url,
      price: variant.price as MoneyV2,
```

Keep the rest of the payload as it is.

## 6. `app/products/[handle]/page.tsx`: pass the image

**Already applied if** the `ProductViewedTracker` `product` prop includes `featuredImage`.

```tsx
        <ProductViewedTracker
          product={{
            featuredImage: product.featuredImage,
            handle: product.handle,
```

## 7. `components/footer/index.tsx`: the signup form

**Already applied if** the file imports `KlaviyoSignupForm`.

Add the imports:

```ts
import { KlaviyoSignupForm } from "@/components/klaviyo/email-capture-form";
import { isKlaviyoConfigured, KLAVIYO_LIST_ID } from "@/lib/klaviyo";
```

Render the form first inside the footer's `<Sections>`:

```tsx
        <Sections className="gap-10">
          {shopConfig.analytics.klaviyo.signupForm.isEnabled &&
            isKlaviyoConfigured &&
            KLAVIYO_LIST_ID && <FooterSignup listId={KLAVIYO_LIST_ID} />}
```

And add the component below `Footer`. Ask the user for the heading and copy, or keep these:

```tsx
function FooterSignup({ listId }: { listId: string }) {
  return (
    <div className="grid gap-5 border-b pb-10 md:grid-cols-2 md:items-end">
      <div className="grid gap-2">
        <h2 className="text-lg font-semibold">Get first access to new drops</h2>
        <p className="text-sm text-muted-foreground">
          New arrivals, restocks, and members-only offers. Unsubscribe anytime.
        </p>
      </div>
      <KlaviyoSignupForm
        labels={{
          button: "Sign up",
          error: "That didn't go through. Check your email and try again.",
          placeholder: "Email address",
          success: "You're on the list. Check your inbox for a welcome.",
        }}
        listId={listId}
        source={`${shopConfig.site.name} footer`}
      />
    </div>
  );
}
```

`source` is stored on the subscription as its custom source, which is how reports tell storefront signups from other signups.

## 8. `components/product-detail/product-detail-section.tsx`: back in stock

**Already applied if** the file imports `KlaviyoBackInStockForm`.

Add the imports:

```ts
import { KlaviyoBackInStockForm } from "@/components/klaviyo/email-capture-form";
import { isKlaviyoConfigured } from "@/lib/klaviyo";
```

In `ProductInfoContent`, after `const hasOptions = ...`, find the sold-out variant:

```ts
  const soldOutVariant = product.availableForSale
    ? undefined
    : (selectedVariant ?? product.defaultVariant);
```

Render the form as the last child of the `<div>` inside `<ProductForm>`, after the buy buttons. `ProductForm` is a context provider, not an HTML `<form>`, and `BuyButtons` renders its own `<form>`, so the signup form sits beside it rather than inside it:

```tsx
        {soldOutVariant ? <BackInStock variantId={soldOutVariant.id} /> : null}
```

And add the component after `ProductInfoContent`:

```tsx
function BackInStock({ variantId }: { variantId: string }) {
  if (!shopConfig.analytics.klaviyo.backInStock.isEnabled || !isKlaviyoConfigured) return null;
  return (
    <div className="grid gap-2.5">
      <p className="text-sm font-medium">Get an email when it's back in stock</p>
      <KlaviyoBackInStockForm
        labels={{
          button: "Notify me",
          error: "We couldn't save that. Check your email and try again.",
          placeholder: "Email address",
          success: "Done. We'll email you as soon as it's back.",
        }}
        variantId={variantId}
      />
    </div>
  );
}
```

## 9. `app/account/(authenticated)/layout.tsx`: identify signed-in customers

**Already applied if** the file imports `KlaviyoIdentify`.

This runs only when Vercel Shop's customer accounts are on (`auth.isEnabled`). Add the imports:

```ts
import { KlaviyoIdentify } from "@/components/klaviyo/identify";
import { isKlaviyoConfigured } from "@/lib/klaviyo";
```

Render it after the closing `</Sections>` in `AccountLayout`:

```tsx
          {shopConfig.analytics.klaviyo.isEnabled && isKlaviyoConfigured && (
            <Suspense>
              <AccountKlaviyoIdentify />
            </Suspense>
          )}
```

And add the component after `AccountLabel`:

```tsx
async function AccountKlaviyoIdentify() {
  if (!shopConfig.auth.isEnabled) return null;
  await requireCustomerSession();
  if (!(await getCustomerAccessToken())) return null;
  const profile = await getCustomerProfile();
  if (!profile?.email) return null;
  return (
    <KlaviyoIdentify
      email={profile.email}
      firstName={profile.firstName}
      lastName={profile.lastName}
    />
  );
}
```

`requireCustomerSession`, `getCustomerAccessToken` and `getCustomerProfile` are already imported in the stock file.

## 10. `.env.example`: document the variables

**Already applied if** the file mentions `NEXT_PUBLIC_KLAVIYO_COMPANY_ID`.

Add these to the optional block, in alphabetical order with the others:

```bash
# NEXT_PUBLIC_KLAVIYO_COMPANY_ID="AbC123" # Klaviyo public API key (site ID); the Klaviyo Vercel integration sets it. Leave unset to skip Klaviyo.
# NEXT_PUBLIC_KLAVIYO_DEBUG="1" # Log every Klaviyo call in the browser console; works without a company ID.
# NEXT_PUBLIC_KLAVIYO_LIST_ID="XyZ789" # Klaviyo list for the footer signup form; leave unset to hide the form.
```

## 11. `turbo.json`: let the variables through the build cache

**Already applied if** `globalEnv` lists `NEXT_PUBLIC_KLAVIYO_COMPANY_ID`.

Add the three names to `globalEnv`, in alphabetical order:

```json
    "NEXT_PUBLIC_KLAVIYO_COMPANY_ID",
    "NEXT_PUBLIC_KLAVIYO_DEBUG",
    "NEXT_PUBLIC_KLAVIYO_LIST_ID",
```

Without them, Turborepo can reuse a cached build made with other values.

## How the pieces fit

- `lib/klaviyo/index.ts` maps Hydrogen payloads to Klaviyo's standard event properties, converts Storefront API GIDs to the numeric IDs Klaviyo's Shopify catalog uses, and posts to the client API with only the public key. It's safe to import on the server.
- `lib/klaviyo/client.ts` queues every call until the first consent-gated event, then installs Klaviyo's call queue from bundled code (so a strict CSP needs no inline-script exception) and loads `klaviyo.js` once.
- `components/analytics/klaviyo-client.tsx` registers the `klaviyo` destination once per page, and tells `klaviyo.js` about client-side navigation so forms re-target and re-render.
- `components/klaviyo/` holds the signup, back-in-stock and identify components. Their copy stays in the server components that render them.
