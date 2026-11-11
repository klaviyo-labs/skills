"use client";

import {
  KLAVIYO_COMPANY_ID,
  type KlaviyoEventName,
  type KlaviyoProfile,
  type KlaviyoProperties,
  type KlaviyoViewedItem,
  logKlaviyoDebug,
  postKlaviyoClientApi,
  toBackInStockSubscription,
  toListSubscription,
} from "./index";

interface KlaviyoOnsite {
  identify(profile: KlaviyoProfile): Promise<unknown>;
  track(event: KlaviyoEventName, properties: KlaviyoProperties): Promise<unknown>;
  trackViewedItem(item: KlaviyoViewedItem): Promise<unknown>;
}

declare global {
  interface Window {
    _klOnsite?: unknown[];
    klaviyo?: KlaviyoOnsite;
  }
}

interface KlaviyoCall {
  args: unknown;
  invoke: (klaviyo: KlaviyoOnsite) => Promise<unknown>;
  label: string;
}

const KLAVIYO_SCRIPT_SELECTOR = 'script[src*="static.klaviyo.com/onsite/js/"]';

const pending: KlaviyoCall[] = [];
let isActive = false;

// Same queue klaviyo.js's inline init snippet creates, built from bundled code so a strict CSP needs no inline-script exception.
function installQueue() {
  if (window.klaviyo) return;
  // oxlint-disable-next-line no-underscore-dangle -- klaviyo.js drains its call queue from window._klOnsite.
  const queue = (window._klOnsite ??= []);
  window.klaviyo = new Proxy({} as KlaviyoOnsite, {
    get(_target, method: string) {
      if (method === "push") return (...args: unknown[]) => queue.push(...args);
      return (...args: unknown[]) =>
        new Promise((resolve) => {
          queue.push([method, ...args, resolve]);
        });
    },
  });
}

function loadScript(companyId: string) {
  if (document.querySelector(KLAVIYO_SCRIPT_SELECTOR)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://static.klaviyo.com/onsite/js/${companyId}/klaviyo.js?company_id=${companyId}`;
  document.head.appendChild(script);
}

function run(call: KlaviyoCall) {
  logKlaviyoDebug(call.label, call.args);
  if (KLAVIYO_COMPANY_ID && window.klaviyo) void call.invoke(window.klaviyo);
}

function enqueue(call: KlaviyoCall) {
  if (isActive) run(call);
  else pending.push(call);
}

// The analytics bus delivers its first event only after consent allows tracking, so klaviyo.js and its cookies wait for consent.
export function activateKlaviyo() {
  if (isActive) return;
  isActive = true;
  if (KLAVIYO_COMPANY_ID) {
    installQueue();
    loadScript(KLAVIYO_COMPANY_ID);
  }
  logKlaviyoDebug(
    KLAVIYO_COMPANY_ID ? "klaviyo.js loaded after consent" : "debug mode, no company ID",
  );
  for (const call of pending.splice(0)) run(call);
}

export function trackKlaviyoEvent(event: KlaviyoEventName, properties: KlaviyoProperties) {
  enqueue({
    args: properties,
    invoke: (klaviyo) => klaviyo.track(event, properties),
    label: event,
  });
}

export function trackKlaviyoViewedItem(item: KlaviyoViewedItem) {
  enqueue({ args: item, invoke: (klaviyo) => klaviyo.trackViewedItem(item), label: "viewed item" });
}

export function identifyKlaviyoProfile(profile: KlaviyoProfile) {
  enqueue({ args: profile, invoke: (klaviyo) => klaviyo.identify(profile), label: "identify" });
}

// klaviyo.js re-evaluates form targeting and re-renders embeds when it sees PAGE_CHANGE, which client-side routing never emits.
export function publishKlaviyoPageChange(url: string) {
  if (!isActive) return;
  logKlaviyoDebug("page change", url);
  window.dispatchEvent(
    new CustomEvent("onsite-event-publish", {
      detail: { payload: { currentPageUrl: url }, type: "PAGE_CHANGE" },
    }),
  );
}

export async function subscribeKlaviyoProfile(input: {
  email: string;
  listId: string;
  source: string;
}): Promise<boolean> {
  const isSubscribed = await postKlaviyoClientApi("subscriptions", toListSubscription(input));
  if (isSubscribed) identifyKlaviyoProfile({ email: input.email });
  return isSubscribed;
}

export async function subscribeKlaviyoBackInStock(input: {
  email: string;
  variantId: string;
}): Promise<boolean> {
  const isSubscribed = await postKlaviyoClientApi(
    "back-in-stock-subscriptions",
    toBackInStockSubscription(input),
  );
  if (isSubscribed) identifyKlaviyoProfile({ email: input.email });
  return isSubscribed;
}
