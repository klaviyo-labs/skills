import { defineTool } from "eve/tools";
import { z } from "zod";

import { shopConfig } from "../../lib/config";
import {
  isKlaviyoConfigured,
  postKlaviyoClientApi,
  toBackInStockSubscription,
} from "../../lib/klaviyo";
import { fetchProductWithVariants } from "../../lib/shopify/operations/products/server";
import { productHandleSchema } from "../lib/catalog";

export default defineTool({
  description:
    "Email the shopper when an unavailable variant is back in stock. Only after get-product-details shows the variant unavailable and the shopper typed their email and asked to be notified.",
  inputSchema: z.strictObject({
    email: z.email().max(254),
    handle: productHandleSchema,
    variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/[0-9]+$/),
  }),
  label: { start: () => "Set up a back-in-stock alert" },
  execute: async ({ email, handle, variantId }) => {
    if (!shopConfig.analytics.klaviyo.backInStock.isEnabled || !isKlaviyoConfigured)
      return { error: "Back-in-stock alerts are unavailable at this store." };
    const product = await fetchProductWithVariants({ handle });
    const variant = product?.variants?.find((candidate) => candidate.id === variantId);
    if (!product || !variant) return { error: "That variant is not part of this product." };
    if (variant.availableForSale)
      return { error: "That variant is available now. Offer to add it to the cart instead." };
    const isSubscribed = await postKlaviyoClientApi(
      "back-in-stock-subscriptions",
      toBackInStockSubscription({ email, variantId }),
    );
    return isSubscribed
      ? {
          productId: product.id,
          productName: product.title,
          subscribed: true,
          variantName: variant.title,
        }
      : { error: "The alert could not be set up. Suggest the Notify me form on the product page." };
  },
});
