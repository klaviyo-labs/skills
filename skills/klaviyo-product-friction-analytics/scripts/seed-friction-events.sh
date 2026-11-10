#!/usr/bin/env bash
#
# Generate sample workflow journeys so the dashboard has shape before real
# traffic exists. Each session emits Started, optionally Error, then Completed.
#
# Usage:
#   ./seed-friction-events.sh --sessions 12 --failure-rate 0.66
#   ./seed-friction-events.sh --sessions 5 --domain your-store-demo.com \
#       --started "Signup Started" --error "Signup Error" --completed "Signup Completed"
#
# Do not point --domain at example.com or test.com: those return 202 and are
# silently discarded.

set -euo pipefail

REVISION="${KLAVIYO_REVISION:-2026-10-15}"
SESSIONS=12
FAILURE_RATE=0.66
DOMAIN=""
SOURCE="website"
METRIC_STARTED="Started Checkout"
METRIC_ERROR="Checkout Error"
METRIC_COMPLETED="Placed Order"
ORDER_VALUE=175

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sessions) SESSIONS="${2:-}"; shift 2 ;;
    --failure-rate) FAILURE_RATE="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --source) SOURCE="${2:-}"; shift 2 ;;
    --started) METRIC_STARTED="${2:-}"; shift 2 ;;
    --error) METRIC_ERROR="${2:-}"; shift 2 ;;
    --completed) METRIC_COMPLETED="${2:-}"; shift 2 ;;
    --value) ORDER_VALUE="${2:-}"; shift 2 ;;
    --revision) REVISION="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

if [[ -z "$DOMAIN" ]]; then
  echo "Pass --domain with a domain you control; seeded profiles get emails at it." >&2
  exit 2
fi

case "$DOMAIN" in
  example.com|test.com|example.org|example.net)
    echo "Refusing to seed with reserved domain '${DOMAIN}'." >&2
    echo "Klaviyo returns 202 for these and silently drops the events." >&2
    exit 2 ;;
esac

resolve_key() {
  if [[ -n "${KLAVIYO_PRIVATE_API_KEY:-}" ]]; then printf '%s' "$KLAVIYO_PRIVATE_API_KEY"; return; fi
  if [[ -n "${KLAVIYO_API_KEY:-}" ]]; then printf '%s' "$KLAVIYO_API_KEY"; return; fi
  if command -v security >/dev/null 2>&1; then
    security find-generic-password -a "$USER" \
      -s "${KLAVIYO_KEYCHAIN_SERVICE:-klaviyo-friction-demo}" -w 2>/dev/null && return
  fi
  echo "No API key found. Set KLAVIYO_PRIVATE_API_KEY or store one in Keychain." >&2
  exit 1
}

API_KEY="$(resolve_key)"
RUN_ID="$(date +%s)"
REASONS=("size_unavailable" "form_validation" "payment_declined")
STEPS=("size_selection" "contact" "payment")

send_event() {
  local email="$1" metric="$2" properties="$3" value="${4:-}"

  local payload
  payload="$(jq -cn \
    --arg metric "$metric" \
    --arg email "$email" \
    --arg external_id "$5" \
    --arg unique_id "$(uuidgen 2>/dev/null || echo "${RUN_ID}-$RANDOM-$RANDOM")" \
    --argjson properties "$properties" \
    --argjson value "${value:-null}" \
    '{data: {type: "event", attributes: {
        properties: $properties,
        value: $value,
        unique_id: $unique_id,
        metric: {data: {type: "metric", attributes: {name: $metric}}},
        profile: {data: {type: "profile", attributes: {external_id: $external_id, email: $email}}}
      }}}')"

  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "https://a.klaviyo.com/api/events/" \
    -H "Authorization: Klaviyo-API-Key ${API_KEY}" \
    -H "Accept: application/vnd.api+json" \
    -H "Content-Type: application/vnd.api+json" \
    -H "revision: ${REVISION}" \
    -d "$payload")"

  if [[ "$status" != "202" ]]; then
    echo "  ! ${metric} returned HTTP ${status}" >&2
    return 1
  fi
}

echo "Seeding ${SESSIONS} session(s) at failure rate ${FAILURE_RATE} into '${DOMAIN}'."
echo

failures=0
completions=0

for index in $(seq 1 "$SESSIONS"); do
  padded="$(printf '%02d' "$index")"
  session_id="seed-${RUN_ID}-${padded}"
  email="friction.${RUN_ID}.${padded}@${DOMAIN}"

  # Deterministic split so reruns are comparable.
  should_fail="$(awk -v i="$index" -v n="$SESSIONS" -v r="$FAILURE_RATE" \
    'BEGIN { print (i <= int(n * r + 0.5)) ? 1 : 0 }')"

  reason_index=$(( (index - 1) % 3 ))
  reason="${REASONS[$reason_index]}"
  step="${STEPS[$reason_index]}"
  latency=$(( 400 + (index * 137) % 2600 ))

  base="$(jq -cn --arg s "$session_id" --arg src "$SOURCE" \
    '{session_id: $s, source: $src}')"

  send_event "$email" "$METRIC_STARTED" \
    "$(jq -cn --argjson b "$base" '$b + {step: "start"}')" \
    "$ORDER_VALUE" "$session_id"

  if [[ "$should_fail" -eq 1 ]]; then
    send_event "$email" "$METRIC_ERROR" \
      "$(jq -cn --argjson b "$base" --arg r "$reason" --arg st "$step" --argjson l "$latency" \
        '$b + {reason: $r, step: $st, latency_ms: $l}')" \
      "$ORDER_VALUE" "$session_id"
    failures=$((failures + 1))
    echo "  ${session_id}  started, failed (${reason})"

    # Half of failed sessions recover on retry.
    if [[ $((index % 2)) -eq 0 ]]; then
      send_event "$email" "$METRIC_COMPLETED" \
        "$(jq -cn --argjson b "$base" '$b + {step: "complete", recovered: true}')" \
        "$ORDER_VALUE" "$session_id"
      completions=$((completions + 1))
      echo "  ${session_id}  recovered on retry"
    fi
  else
    send_event "$email" "$METRIC_COMPLETED" \
      "$(jq -cn --argjson b "$base" '$b + {step: "complete", recovered: false}')" \
      "$ORDER_VALUE" "$session_id"
    completions=$((completions + 1))
    echo "  ${session_id}  started, completed"
  fi
done

cat <<MSG

Seeded ${SESSIONS} sessions: ${failures} with errors, ${completions} completed.

Every request returned 202, which does not prove the events are queryable.
Verify one before trusting the dashboard:

  ./verify-delivery.sh --session seed-${RUN_ID}-01 --wait 60

Then resolve metric IDs for the dashboard variables:

  ./list-metrics.sh --name "${METRIC_ERROR}"
MSG
