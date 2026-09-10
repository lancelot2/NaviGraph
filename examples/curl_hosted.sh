#!/usr/bin/env bash
# Query a hosted (or self-hosted) NaviGraph deployment's context endpoint.
# Set PROJECT_ID and API_KEY (generate one at /dashboard/api).
set -euo pipefail

BASE_URL="${BASE_URL:-https://navigraph.cloud}"
PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
API_KEY="${API_KEY:?set API_KEY}"

curl -sS -X POST "$BASE_URL/api/context" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"$PROJECT_ID\",
    \"instruction\": \"take me to the supply room\",
    \"current_location\": \"lobby\"
  }"
echo
