#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "::error::${name} 환경변수가 필요합니다."
    exit 1
  fi
}

for name in \
  WEBHOOK_URL \
  HEALTH_URL \
  EXPECTED_SOURCE_REVISION \
  CHANGED_PATH \
  GITHUB_REF \
  GITHUB_SHA \
  GITHUB_REPOSITORY \
  GITHUB_WORKFLOW; do
  require_env "$name"
done

branch_name="${GITHUB_REF_NAME:-${GITHUB_REF#refs/heads/}}"
verify_timeout_seconds="${DEPLOY_VERIFY_TIMEOUT_SECONDS:-600}"
poll_interval_seconds="${DEPLOY_POLL_INTERVAL_SECONDS:-5}"
response_file="$(mktemp)"
readiness_file="$(mktemp)"
trap 'rm -f "$response_file" "$readiness_file"' EXIT

payload="$(jq -nc \
  --arg ref "$GITHUB_REF" \
  --arg sha "$GITHUB_SHA" \
  --arg repo "$GITHUB_REPOSITORY" \
  --arg message "GitHub Actions deploy: $GITHUB_WORKFLOW" \
  --arg path "$CHANGED_PATH" \
  '{ref: $ref, repository: {full_name: $repo}, head_commit: {id: $sha, message: $message}, commits: [{modified: [$path]}]}'
)"

http_status="$(curl --silent --show-error \
  --connect-timeout 10 \
  --max-time 30 \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  --data "$payload" \
  --output "$response_file" \
  --write-out "%{http_code}" \
  "$WEBHOOK_URL")"
response_message="$(
  jq -er '.message | select(type == "string")' "$response_file" 2>/dev/null || true
)"
if [ "$http_status" != "200" ] || \
   [ "$response_message" != "Application deployed successfully" ]; then
  case "$response_message" in
    "Branch Not Match" | "Watch Paths Not Match") ;;
    "") response_message="unexpected or non-JSON response" ;;
    *) response_message="unexpected response message" ;;
  esac
  echo "::error::Dokploy가 stargate-worker 배포를 거절했습니다 (HTTP $http_status, GitHub branch $branch_name): $response_message"
  exit 1
fi
echo "✅ Dokploy가 stargate-worker 배포 요청을 접수했습니다."

deadline=$((SECONDS + verify_timeout_seconds))
last_health_status="unreachable"
while ((SECONDS < deadline)); do
  if last_health_status="$(curl --silent --show-error \
    --connect-timeout 5 \
    --max-time 10 \
    --output "$readiness_file" \
    --write-out "%{http_code}" \
    "$HEALTH_URL")"; then
    if [ "$last_health_status" = "200" ] && \
       jq -e \
         --arg expected "$EXPECTED_SOURCE_REVISION" \
         '.ready == true and .sourceRevision == $expected' \
         "$readiness_file" >/dev/null 2>&1; then
      echo "✅ stargate-worker가 기대한 source revision으로 준비됐습니다: $EXPECTED_SOURCE_REVISION"
      exit 0
    fi
  else
    last_health_status="unreachable"
  fi
  sleep "$poll_interval_seconds"
done

echo "::error::stargate-worker가 제한 시간 안에 기대한 source revision으로 준비되지 않았습니다 (HTTP $last_health_status, expected $EXPECTED_SOURCE_REVISION)."
exit 1
