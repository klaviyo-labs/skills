#!/usr/bin/env bash
#
# Prove that events actually landed and that identity resolved to one profile.
#
# HTTP 202 means "accepted for async processing" — not stored, not queryable,
# not necessarily kept. This is the only way to know.
#
# Usage:
#   ./verify-delivery.sh --session <session_id>
#   ./verify-delivery.sh --email user@your-domain.com --minutes 30
#   ./verify-delivery.sh --session <id> --wait 60
#
# Exit codes: 0 events found, 1 nothing found, 2 bad usage.

set -euo pipefail

REVISION="${KLAVIYO_REVISION:-2026-10-15}"
SESSION_ID=""
EMAIL=""
MINUTES=60
WAIT_SECONDS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session) SESSION_ID="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --minutes) MINUTES="${2:-}"; shift 2 ;;
    --wait) WAIT_SECONDS="${2:-}"; shift 2 ;;
    --revision) REVISION="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$SESSION_ID" && -z "$EMAIL" ]]; then
  echo "Provide --session or --email." >&2
  exit 2
fi

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

resolve_key() {
  if [[ -n "${KLAVIYO_API_KEY:-}" ]]; then printf '%s' "$KLAVIYO_API_KEY"; return; fi
  if [[ -n "${KLAVIYO_PRIVATE_API_KEY:-}" ]]; then printf '%s' "$KLAVIYO_PRIVATE_API_KEY"; return; fi
  if command -v security >/dev/null 2>&1; then
    security find-generic-password -a "$USER" \
      -s "${KLAVIYO_KEYCHAIN_SERVICE:-klaviyo-friction-demo}" -w 2>/dev/null && return
  fi
  echo "No API key found. Set KLAVIYO_API_KEY or store one in Keychain." >&2
  exit 1
}

iso_minutes_ago() {
  if date -u -v-1M >/dev/null 2>&1; then
    date -u -v-"$1"M +%Y-%m-%dT%H:%M:%SZ      # BSD / macOS
  else
    date -u -d "$1 minutes ago" +%Y-%m-%dT%H:%M:%SZ   # GNU
  fi
}

API_KEY="$(resolve_key)"

fetch_events() {
  local since="$1"
  curl -sS --fail-with-body \
    -H "Authorization: Klaviyo-API-Key ${API_KEY}" \
    -H "Accept: application/vnd.api+json" \
    -H "revision: ${REVISION}" \
    --get "https://a.klaviyo.com/api/events/" \
    --data-urlencode "filter=greater-or-equal(datetime,${since})" \
    --data-urlencode "page[size]=1000" \
    --data-urlencode "sort=-datetime"
}

filter_events() {
  if [[ -n "$SESSION_ID" ]]; then
    jq --arg s "$SESSION_ID" '[.data[] | select(.attributes.event_properties.session_id == $s)]'
  else
    jq --arg e "$EMAIL" '[.data[] | select(
      (.attributes.event_properties.email // "") == $e
      or (.attributes.profile.data.attributes.email // "") == $e
    )]'
  fi
}

since="$(iso_minutes_ago "$MINUTES")"
deadline=$(( $(date +%s) + WAIT_SECONDS ))
matched="[]"

while true; do
  response="$(fetch_events "$since")" || { echo "Events request failed: $response" >&2; exit 1; }
  matched="$(printf '%s' "$response" | filter_events)"
  [[ "$(jq 'length' <<<"$matched")" -gt 0 ]] && break
  [[ "$(date +%s)" -ge "$deadline" ]] && break
  sleep 5
done

count="$(jq 'length' <<<"$matched")"

if [[ "$count" -eq 0 ]]; then
  cat >&2 <<'MSG'
No matching events found.

Check, in this order:
  1. Reserved test domain? Events for example.com and test.com return 202 and
     are silently discarded. Use a domain you control.
  2. Widen the window with --minutes, or retry with --wait 60 — ingestion is
     asynchronous.
  3. Confirm the ingest proxy returned 202 rather than swallowing an error.
MSG
  exit 1
fi

echo "Found ${count} event(s)."
echo

printf '%-22s  %-12s  %-14s  %s\n' "DATETIME" "METRIC ID" "PROFILE ID" "PROPERTIES"
printf '%-22s  %-12s  %-14s  %s\n' "----------------------" "------------" "--------------" "----------"
jq -r 'sort_by(.attributes.datetime)[] | [
  (.attributes.datetime | .[0:19]),
  .relationships.metric.data.id,
  .relationships.profile.data.id,
  ([
    (if .attributes.event_properties.step then "step=" + (.attributes.event_properties.step|tostring) else empty end),
    (if .attributes.event_properties.reason then "reason=" + (.attributes.event_properties.reason|tostring) else empty end),
    (if .attributes.event_properties.latency_ms then "latency_ms=" + (.attributes.event_properties.latency_ms|tostring) else empty end)
  ] | join(" "))
] | @tsv' <<<"$matched" |
  while IFS=$'\t' read -r dt metric profile props; do
    printf '%-22s  %-12s  %-14s  %s\n' "$dt" "$metric" "$profile" "$props"
  done

echo
profiles="$(jq -r '[.[].relationships.profile.data.id] | unique' <<<"$matched")"
sessions="$(jq -r '[.[].attributes.event_properties.session_id] | unique' <<<"$matched")"
profile_count="$(jq 'length' <<<"$profiles")"
session_count="$(jq 'length' <<<"$sessions")"

echo "Distinct profiles: ${profile_count}"
echo "Distinct sessions: ${session_count}"
echo

if [[ "$profile_count" -eq 1 ]]; then
  echo "PASS — the journey resolved to a single profile. Identity stitching works."
else
  echo "FAIL — the journey split across ${profile_count} profiles:"
  jq -r '.[] | "  " + .' <<<"$profiles"
  echo
  echo "Send external_id on every event, and send external_id together with the"
  echo "email on the identifying event. Fix this before trusting any dashboard."
  exit 1
fi
