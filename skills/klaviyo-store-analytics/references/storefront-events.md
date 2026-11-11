# What a Vercel Shop storefront sends to Klaviyo

A Vercel Shop storefront with Klaviyo connected sends onsite activity from the shopper's browser through `klaviyo.js`, after consent, and signups through Klaviyo's client APIs. Klaviyo's Shopify integration separately sends orders, checkouts, fulfillment and the catalog. This file lists what comes from the storefront, so questions about it can be answered separately from the rest of the account.

## Events from the storefront

| Metric | When | Useful properties |
|---|---|---|
| `Active on Site` | Every page view, sent by `klaviyo.js` | Page URL |
| `Viewed Product` | A product page view | `ProductID` (numeric Shopify ID), `ProductName`, `Price`, `Brand`, `VariantID`, `URL`, `ImageURL` |
| `Added to Cart` | An item added to the cart | `$value` (cart total), `AddedItemProductID`, `AddedItemProductName`, `AddedItemQuantity`, `Items`, `CheckoutURL` |
| `Viewed Collection` | A collection page view | `CollectionHandle`, `CollectionID`, `URL` |
| `Submitted Search` | A search with a term | `SearchTerm`, `URL` |
| `Used Shop Agent` | Shop Agent did something for the shopper, such as a back-in-stock alert | `Action`, `ProductID`, `ProductName`, `VariantID`, `VariantName`, `URL` |

`Viewed Product`, `Added to Cart` and `Active on Site` can also come from a Shopify theme if the store still has one. To count only the new storefront, filter or group on the URL property by host.

## Signups and subscriptions

- **Footer signups** join the list in the storefront's `NEXT_PUBLIC_KLAVIYO_LIST_ID`, and record `Subscribed to List`. The subscription's custom source is `<store name> footer`.
- **Back-in-stock requests**, from the product page or Shop Agent, record `Subscribed to Back in Stock` for the variant.
- **Onsite forms** created for the storefront are named `Vercel Shop - <purpose>`, and their submits show in form reports.

## Profile properties

- `Shop Agent user: true` is set on a shopper's profile after Shop Agent sets up an alert for them. A segment on it is the audience of agent-assisted shoppers.
- Signed-in customers are identified with their email, first name and last name from their Shopify customer account.

## What the storefront never sends

Chat text from Shop Agent, payment details, or anything typed into a field other than an email form. Orders come from Shopify, not the storefront.
