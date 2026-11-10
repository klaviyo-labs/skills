// Product workflow telemetry for Klaviyo.
//
// Adapt WORKFLOW and FrictionReason to your domain. Everything else is the
// reusable part: session anchoring, identity stitching, idempotency keys, and
// the shared property contract.

const isBrowser = typeof window !== 'undefined'

const SESSION_ID_KEY = 'pa_session_id'
const TELEMETRY_MODE_KEY = 'pa_telemetry_mode'
const INGEST_ENDPOINT = '/api/klaviyo-events'
const KLAVIYO_REVISION = '2026-10-15'

// Rename these three to match your workflow.
const WORKFLOW = {
  started: 'Started Checkout',
  error: 'Checkout Error',
  completed: 'Placed Order',
} as const

// Closed set. Free-text reasons make the distribution panel useless.
export type FrictionReason =
  | 'size_unavailable'
  | 'form_validation'
  | 'payment_declined'

const STEP_BY_REASON: Record<FrictionReason, string> = {
  size_unavailable: 'size_selection',
  form_validation: 'contact',
  payment_declined: 'payment',
}

/**
 * Stable per-session anchor. Doubles as external_id so events emitted before
 * the user identifies themselves still resolve to the eventual profile.
 *
 * sessionStorage clears on tab close. Use localStorage if you want the anchor
 * to survive across visits, accepting that shared devices merge distinct people.
 */
export function getSessionId(): string {
  if (!isBrowser) return 'server'

  const existing = window.sessionStorage.getItem(SESSION_ID_KEY)
  if (existing) return existing

  const id = window.crypto.randomUUID()
  window.sessionStorage.setItem(SESSION_ID_KEY, id)
  return id
}

/**
 * Direct API mode bypasses the onsite snippet, which detects headless browsers
 * as robots and silently disables tracking. Enable it for anything you intend
 * to exercise with Playwright or verify in CI.
 */
export function useDirectApi(): boolean {
  if (!isBrowser) return false

  const params = new URLSearchParams(window.location.search)
  const flag = params.get('telemetry_mode')

  if (flag === 'api') window.sessionStorage.setItem(TELEMETRY_MODE_KEY, 'api')
  if (flag === 'onsite') window.sessionStorage.removeItem(TELEMETRY_MODE_KEY)

  return window.sessionStorage.getItem(TELEMETRY_MODE_KEY) === 'api'
}

/** Properties every event in the workflow carries. */
function eventContext() {
  return {
    source: 'website',
    session_id: getSessionId(),
  }
}

interface EventProfile {
  email?: string
  first_name?: string
  last_name?: string
}

async function sendViaApi(
  metricName: string,
  properties: Record<string, unknown>,
  profile: EventProfile = {}
): Promise<void> {
  const value = properties['$value']

  const response = await window.fetch(INGEST_ENDPOINT, {
    method: 'POST',
    keepalive: true,
    headers: {
      accept: 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json',
      revision: KLAVIYO_REVISION,
    },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          properties,
          value: typeof value === 'number' ? value : undefined,
          // Idempotency key. Without it, retries and React Strict Mode
          // double-fires create duplicate events.
          unique_id: window.crypto.randomUUID(),
          metric: {
            data: { type: 'metric', attributes: { name: metricName } },
          },
          profile: {
            data: {
              type: 'profile',
              attributes: {
                // Identity anchor. Sent on every event, including after the
                // email is known — that pairing is what merges the profiles.
                external_id: getSessionId(),
                ...profile,
              },
            },
          },
        },
      },
    }),
  })

  // 202 means accepted for async processing, not stored. Verify with
  // scripts/verify-delivery.sh before trusting any dashboard built on this.
  if (!response.ok) {
    throw new Error(`Klaviyo event failed with HTTP ${response.status}`)
  }
}

async function waitForOnsite(request: Promise<unknown>): Promise<void> {
  await Promise.race([
    request,
    new Promise((resolve) => window.setTimeout(resolve, 750)),
  ])
}

async function track(
  metricName: string,
  properties: Record<string, unknown>,
  profile?: EventProfile
): Promise<void> {
  if (useDirectApi()) {
    await sendViaApi(metricName, properties, profile)
    return
  }

  await waitForOnsite(
    (window as unknown as { klaviyo: { track: (n: string, p: unknown) => Promise<unknown> } })
      .klaviyo.track(metricName, properties)
  )
}

/** Fire-and-forget wrapper for call sites that must not await telemetry. */
function queue(metricName: string, properties: Record<string, unknown>): void {
  void track(metricName, properties).catch((error) => {
    console.error(`Failed to track ${metricName}`, error)
  })
}

export function trackWorkflowStarted(properties: Record<string, unknown> = {}): void {
  if (!isBrowser) return
  queue(WORKFLOW.started, { ...eventContext(), step: 'start', ...properties })
}

export async function trackWorkflowError(
  reason: FrictionReason,
  latencyMs: number,
  properties: Record<string, unknown> = {},
  profile?: EventProfile
): Promise<void> {
  if (!isBrowser) return

  await track(
    WORKFLOW.error,
    {
      ...eventContext(),
      reason,
      step: STEP_BY_REASON[reason],
      latency_ms: latencyMs,
      ...properties,
    },
    profile
  )
}

export async function trackWorkflowCompleted(
  properties: Record<string, unknown> = {},
  profile?: EventProfile
): Promise<void> {
  if (!isBrowser) return

  await track(
    WORKFLOW.completed,
    { ...eventContext(), step: 'complete', ...properties },
    profile
  )
}
