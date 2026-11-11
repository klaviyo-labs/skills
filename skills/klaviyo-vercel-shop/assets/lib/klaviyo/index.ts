import type {
  AnalyticsCart,
  AnalyticsCartLine,
  CartLineUpdatePayload,
  CollectionViewPayload,
  ProductViewPayload,
  SearchViewPayload,
} from "@shopify/hydrogen";

export const KLAVIYO_EVENT = {
  ADDED_TO_CART: "Added to Cart",
  SUBMITTED_SEARCH: "Submitted Search",
  USED_SHOP_AGENT: "Used Shop Agent",
  VIEWED_COLLECTION: "Viewed Collection",
  VIEWED_PRODUCT: "Viewed Product",
} as const;

export type KlaviyoEventName = (typeof KLAVIYO_EVENT)[keyof typeof KLAVIYO_EVENT];

export type KlaviyoProperties = Record<string, unknown>;

export interface KlaviyoViewedItem {
  ImageUrl?: string;
  ItemId: string;
  Metadata: { Brand: string; Price: number };
  Title: string;
  Url: string;
}

export interface KlaviyoProfile {
  email: string;
  first_name?: string;
  last_name?: string;
  "Shop Agent user"?: boolean;
}

export const KLAVIYO_CLIENT_API_REVISION = "2026-10-15";

export const KLAVIYO_COMPANY_ID = process.env.NEXT_PUBLIC_KLAVIYO_COMPANY_ID;
export const IS_KLAVIYO_DEBUG = process.env.NEXT_PUBLIC_KLAVIYO_DEBUG === "1";
export const KLAVIYO_LIST_ID =
  process.env.NEXT_PUBLIC_KLAVIYO_LIST_ID ?? (IS_KLAVIYO_DEBUG ? "debug-list" : undefined);

// Debug mode logs every call without a company ID, so the integration can be exercised before an account is connected.
export const isKlaviyoConfigured = Boolean(KLAVIYO_COMPANY_ID) || IS_KLAVIYO_DEBUG;

// Klaviyo's Shopify catalog keys products and variants by numeric ID, not by Storefront API GID.
export function toShopifyNumericId(gid: string): string {
  return gid.split("/").at(-1) ?? gid;
}

export function toKlaviyoCatalogVariantId(variantGid: string): string {
  return `$shopify:::$default:::${toShopifyNumericId(variantGid)}`;
}

export function logKlaviyoDebug(label: string, args?: unknown) {
  if (IS_KLAVIYO_DEBUG) console.info(`[klaviyo] ${label}`, args ?? "");
}

// The client API takes only the public company ID, so the browser and the agent share it without a private key.
export async function postKlaviyoClientApi(
  resource: "back-in-stock-subscriptions" | "subscriptions",
  body: unknown,
): Promise<boolean> {
  logKlaviyoDebug(`POST /client/${resource}`, body);
  if (!KLAVIYO_COMPANY_ID) return IS_KLAVIYO_DEBUG;
  try {
    const response = await fetch(
      `https://a.klaviyo.com/client/${resource}/?company_id=${KLAVIYO_COMPANY_ID}`,
      {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/vnd.api+json",
          revision: KLAVIYO_CLIENT_API_REVISION,
        },
        method: "POST",
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export function toListSubscription(input: { email: string; listId: string; source: string }) {
  return {
    data: {
      attributes: {
        custom_source: input.source,
        profile: { data: { attributes: { email: input.email }, type: "profile" } },
      },
      relationships: { list: { data: { id: input.listId, type: "list" } } },
      type: "subscription",
    },
  };
}

export function toBackInStockSubscription(input: { email: string; variantId: string }) {
  return {
    data: {
      attributes: {
        channels: ["EMAIL"],
        profile: { data: { attributes: { email: input.email }, type: "profile" } },
      },
      relationships: {
        variant: {
          data: { id: toKlaviyoCatalogVariantId(input.variantId), type: "catalog-variant" },
        },
      },
      type: "back-in-stock-subscription",
    },
  };
}

// Records what the agent did, never what the shopper typed: chat text can hold personal details.
export function toShopAgentBackInStock(input: {
  handle: string;
  origin: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
}): KlaviyoProperties {
  return {
    Action: "Back in stock alert",
    ProductID: toShopifyNumericId(input.productId),
    ProductName: input.productName,
    URL: productUrl(input.origin, input.handle),
    VariantID: toShopifyNumericId(input.variantId),
    VariantName: input.variantName,
  };
}

function productUrl(origin: string, handle: unknown): string | undefined {
  return typeof handle === "string" && handle ? `${origin}/products/${handle}` : undefined;
}

export function toViewedProduct(
  payload: ProductViewPayload,
  origin: string,
): { item: KlaviyoViewedItem; properties: KlaviyoProperties } | null {
  const product = payload.products[0];
  if (!product) return null;
  const price = Number(product.price.amount);
  const url = productUrl(origin, product.handle) ?? payload.url ?? origin;
  const imageUrl = typeof product.imageUrl === "string" ? product.imageUrl : undefined;
  const productId = toShopifyNumericId(product.id);

  return {
    item: {
      ImageUrl: imageUrl,
      ItemId: productId,
      Metadata: { Brand: product.vendor, Price: price },
      Title: product.title,
      Url: url,
    },
    properties: {
      Brand: product.vendor,
      ImageURL: imageUrl,
      Price: price,
      ProductID: productId,
      ProductName: product.title,
      SKU: product.sku ?? undefined,
      URL: url,
      VariantID: toShopifyNumericId(product.variantId),
      VariantName: product.variantTitle,
    },
  };
}

function cartLines(cart: AnalyticsCart | null): AnalyticsCartLine[] {
  if (!cart) return [];
  return cart.lines.nodes ?? cart.lines.edges?.map((edge) => edge.node) ?? [];
}

function toCartItem(line: AnalyticsCartLine, origin: string): KlaviyoProperties {
  const itemPrice = Number(line.merchandise.price.amount);
  return {
    ItemPrice: itemPrice,
    ProductID: toShopifyNumericId(line.merchandise.product.id),
    ProductName: line.merchandise.product.title,
    ProductURL: productUrl(origin, line.merchandise.product.handle),
    Quantity: line.quantity,
    RowTotal: itemPrice * line.quantity,
    SKU: line.merchandise.sku ?? undefined,
    VariantID: toShopifyNumericId(line.merchandise.id),
  };
}

export function toAddedToCart(
  payload: CartLineUpdatePayload,
  origin: string,
): KlaviyoProperties | null {
  const line = payload.currentLine;
  if (!line) return null;
  const addedQuantity = line.quantity - (payload.prevLine?.quantity ?? 0);
  if (addedQuantity <= 0) return null;

  const items = cartLines(payload.cart).map((cartLine) => toCartItem(cartLine, origin));
  const value = items.reduce((total, item) => total + (item.RowTotal as number), 0);
  const checkoutUrl = payload.cart?.checkoutUrl;

  return {
    $value: value,
    AddedItemPrice: Number(line.merchandise.price.amount),
    AddedItemProductID: toShopifyNumericId(line.merchandise.product.id),
    AddedItemProductName: line.merchandise.product.title,
    AddedItemQuantity: addedQuantity,
    AddedItemSKU: line.merchandise.sku ?? undefined,
    AddedItemURL: productUrl(origin, line.merchandise.product.handle),
    AddedItemVariantID: toShopifyNumericId(line.merchandise.id),
    CheckoutURL: typeof checkoutUrl === "string" ? checkoutUrl : undefined,
    ItemNames: items.map((item) => item.ProductName),
    Items: items,
  };
}

export function toViewedCollection(payload: CollectionViewPayload): KlaviyoProperties {
  return {
    CollectionHandle: payload.collection.handle,
    CollectionID: toShopifyNumericId(payload.collection.id),
    URL: payload.url,
  };
}

export function toSubmittedSearch(payload: SearchViewPayload): KlaviyoProperties | null {
  return payload.searchTerm ? { SearchTerm: payload.searchTerm, URL: payload.url } : null;
}
