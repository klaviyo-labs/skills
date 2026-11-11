"use client";

import { useEffect } from "react";

import { addAnalyticsDestination, AnalyticsEvent, getAnalytics } from "@/lib/analytics/client";
import {
  KLAVIYO_EVENT,
  toAddedToCart,
  toSubmittedSearch,
  toViewedCollection,
  toViewedProduct,
} from "@/lib/klaviyo";
import {
  activateKlaviyo,
  publishKlaviyoPageChange,
  trackKlaviyoEvent,
  trackKlaviyoViewedItem,
} from "@/lib/klaviyo/client";

let isRegistered = false;

// Registered once per page lifetime: removing and re-adding a destination replays the bus buffer and duplicates events.
function registerKlaviyoDestination(): boolean {
  if (isRegistered) return true;
  if (!getAnalytics()) return false;
  isRegistered = true;
  let lastPageUrl: string | null = null;

  addAnalyticsDestination({
    name: "klaviyo",
    setup({ subscribe }) {
      subscribe(AnalyticsEvent.PAGE_VIEWED, ({ url }) => {
        activateKlaviyo();
        const pageUrl = url ?? window.location.href;
        if (lastPageUrl && lastPageUrl !== pageUrl) publishKlaviyoPageChange(pageUrl);
        lastPageUrl = pageUrl;
      });

      subscribe(AnalyticsEvent.PRODUCT_VIEWED, (payload) => {
        activateKlaviyo();
        const viewed = toViewedProduct(payload, window.location.origin);
        if (!viewed) return;
        trackKlaviyoEvent(KLAVIYO_EVENT.VIEWED_PRODUCT, viewed.properties);
        trackKlaviyoViewedItem(viewed.item);
      });

      subscribe(AnalyticsEvent.PRODUCT_ADD_TO_CART, (payload) => {
        activateKlaviyo();
        const properties = toAddedToCart(payload, window.location.origin);
        if (properties) trackKlaviyoEvent(KLAVIYO_EVENT.ADDED_TO_CART, properties);
      });

      subscribe(AnalyticsEvent.COLLECTION_VIEWED, (payload) => {
        activateKlaviyo();
        trackKlaviyoEvent(KLAVIYO_EVENT.VIEWED_COLLECTION, toViewedCollection(payload));
      });

      subscribe(AnalyticsEvent.SEARCH_VIEWED, (payload) => {
        activateKlaviyo();
        const properties = toSubmittedSearch(payload);
        if (properties) trackKlaviyoEvent(KLAVIYO_EVENT.SUBMITTED_SEARCH, properties);
      });
    },
  });
  return true;
}

export function KlaviyoTracker() {
  useEffect(() => {
    if (registerKlaviyoDestination()) return;
    const interval = window.setInterval(() => {
      if (registerKlaviyoDestination()) window.clearInterval(interval);
    }, 100);
    return () => window.clearInterval(interval);
  }, []);
  return null;
}
