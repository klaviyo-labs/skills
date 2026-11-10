#!/usr/bin/env bash
#
# Resolve Klaviyo metric names to IDs and flag duplicates.
#
# The same display name can exist multiple times from different integrations
# ("Placed Order from API" vs "from Shopify"). Dashboards must query by ID.
#
# Usage:
#   ./list-metrics.sh
#   ./list-metrics.sh --name "Checkout Error"
#
# Key resolution order: KLAVIYO_API_KEY, KLAVIYO_PRIVATE_API_KEY, macOS Keychain
# (service name from KLAVIYO_KEYCHAIN_SERVICE, default klaviyo-friction-demo).

set -euo pipefail

REVISION="${KLAVIYO_REVISION:-2026-10-15}"
NAME_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME_FILTER="${2:-}"; shift 2 ;;
    --revision) REVISION="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

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

API_KEY="$(resolve_key)"
url="https://a.klaviyo.com/api/metrics/"
all_metrics="[]"

while [[ -n "$url" && "$url" != "null" ]]; do
  response="$(curl -sS --fail-with-body \
    -H "Authorization: Klaviyo-API-Key ${API_KEY}" \
    -H "Accept: application/vnd.api+json" \
    -H "revision: ${REVISION}" \
    "$url")" || { echo "Metrics request failed: $response" >&2; exit 1; }

  page="$(jq '[.data[] | {
    id: .id,
    name: .attributes.name,
    integration: (.attributes.integration.name // "API")
  }]' <<<"$response")"

  all_metrics="$(jq -s 'add' <(printf '%s' "$all_metrics") <(printf '%s' "$page"))"
  url="$(jq -r '.links.next // ""' <<<"$response")"
done

if [[ -n "$NAME_FILTER" ]]; then
  all_metrics="$(jq --arg n "$NAME_FILTER" '[.[] | select(.name == $n)]' <<<"$all_metrics")"
fi

count="$(jq 'length' <<<"$all_metrics")"
if [[ "$count" -eq 0 ]]; then
  echo "No metrics matched."
  echo "A metric does not exist until its first event fires — send one journey first."
  exit 1
fi

printf '%-12s  %-40s  %s\n' "ID" "NAME" "INTEGRATION"
printf '%-12s  %-40s  %s\n' "------------" "----------------------------------------" "-----------"
jq -r '.[] | [.id, .name, .integration] | @tsv' <<<"$all_metrics" |
  while IFS=$'\t' read -r id name integration; do
    printf '%-12s  %-40s  %s\n' "$id" "$name" "$integration"
  done

dupes="$(jq -r 'group_by(.name) | map(select(length > 1)) | .[] | .[0].name' <<<"$all_metrics")"
if [[ -n "$dupes" ]]; then
  echo
  echo "Duplicate names — pin the ID for the integration you actually want:"
  printf '  %s\n' $dupes
fi
