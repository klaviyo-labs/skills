"use client";

import type { EveMessage } from "eve/react";
import { useEffect, useRef } from "react";

import { KLAVIYO_EVENT, toShopAgentBackInStock } from "@/lib/klaviyo";
import { identifyKlaviyoProfile, trackKlaviyoEvent } from "@/lib/klaviyo/client";

const BACK_IN_STOCK_TOOL = "notify-when-back-in-stock";

interface BackInStockAlert {
  email: string;
  handle: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
}

function readString(value: object, key: string): string | undefined {
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function getBackInStockAlert(part: EveMessage["parts"][number]): BackInStockAlert | undefined {
  if (part.type !== "dynamic-tool" || part.toolName !== BACK_IN_STOCK_TOOL) return undefined;
  if (part.state !== "output-available" || part.partial) return undefined;
  const { input, output } = part;
  if (!output || typeof output !== "object" || !("subscribed" in output)) return undefined;
  if (!input || typeof input !== "object") return undefined;
  const email = readString(input, "email");
  const handle = readString(input, "handle");
  const variantId = readString(input, "variantId");
  const productId = readString(output, "productId");
  const productName = readString(output, "productName");
  const variantName = readString(output, "variantName");
  if (!email || !handle || !variantId || !productId || !productName || !variantName)
    return undefined;
  return { email, handle, productId, productName, variantId, variantName };
}

export function AgentKlaviyoBridge({
  messages,
  status,
}: {
  messages: readonly EveMessage[];
  status: string;
}) {
  const seen = useRef(new Set<string>());
  const hydrated = useRef(false);
  const busy = status === "submitted" || status === "streaming" || status === "resuming";
  // Restored conversations replay old tool results, which must not re-identify the browser or repeat events.
  useEffect(() => {
    for (const message of messages)
      for (const part of message.parts) {
        if (part.type !== "dynamic-tool" || seen.current.has(part.toolCallId)) continue;
        const alert = getBackInStockAlert(part);
        if (!alert) continue;
        seen.current.add(part.toolCallId);
        if (!hydrated.current && !busy) continue;
        identifyKlaviyoProfile({ email: alert.email, "Shop Agent user": true });
        trackKlaviyoEvent(
          KLAVIYO_EVENT.USED_SHOP_AGENT,
          toShopAgentBackInStock({ ...alert, origin: window.location.origin }),
        );
      }
    if (!busy) hydrated.current = true;
  }, [busy, messages]);
  return null;
}
