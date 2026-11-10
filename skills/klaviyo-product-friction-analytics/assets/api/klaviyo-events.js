// Same-origin ingest proxy for Klaviyo events.
//
// Exists because the private key must never reach the client bundle: the
// server-side Create Event endpoint needs a private key, so the browser posts
// here and this route adds the key.
//
// This route is public and holds a key with events:write. It only forwards
// events whose metric name is in ALLOWED_METRICS, caps the body size, and
// never returns Klaviyo's response body to the caller. Before deploying, also
// put it behind your app's own session check and a rate limit: as written,
// anyone who finds the URL can send allowlisted events for any profile.
//
// Vercel-style handler. Portable to any Node runtime that gives you a request
// and a response object.

const KLAVIYO_EVENTS_URL = 'https://a.klaviyo.com/api/events/'
const KLAVIYO_REVISION = '2026-10-15'
const MAX_BODY_BYTES = 16 * 1024

// The metric names from your event contract. Anything else is rejected.
const ALLOWED_METRICS = new Set([
  'Started Checkout',
  'Checkout Error',
  'Placed Order',
])

async function readRequestBody(request) {
  if (typeof request.body === 'string') return request.body

  if (
    request.body &&
    typeof request.body === 'object' &&
    typeof request.body.getReader !== 'function'
  ) {
    return JSON.stringify(request.body)
  }

  if (typeof request.json === 'function') {
    return JSON.stringify(await request.json())
  }

  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY
  if (!apiKey) {
    console.error('KLAVIYO_PRIVATE_API_KEY is not set')
    response.status(500).json({ error: 'Internal error' })
    return
  }

  const payload = await readRequestBody(request)
  if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES) {
    response.status(413).json({ error: 'Payload too large' })
    return
  }

  let metricName
  try {
    metricName =
      JSON.parse(payload)?.data?.attributes?.metric?.data?.attributes?.name
  } catch {
    response.status(400).json({ error: 'Invalid JSON' })
    return
  }
  if (!ALLOWED_METRICS.has(metricName)) {
    response.status(400).json({ error: 'Metric not allowed' })
    return
  }

  const upstream = await fetch(KLAVIYO_EVENTS_URL, {
    method: 'POST',
    headers: {
      authorization: `Klaviyo-API-Key ${apiKey}`,
      accept: 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json',
      revision: KLAVIYO_REVISION,
    },
    body: payload,
  })

  if (!upstream.ok) {
    console.error(
      `Klaviyo rejected the event (${upstream.status}):`,
      await upstream.text(),
    )
    response.status(502).json({ error: 'Event not accepted' })
    return
  }

  response.status(202).end()
}
