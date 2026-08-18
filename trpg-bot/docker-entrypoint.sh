#!/usr/bin/env bash
#
# trpg-bot 컨테이너 시작 스크립트.
#
# Dokploy Application 은 단일 컨테이너로 배포되어 사이드카를 붙일 수 없다. YouTube 가
# 서버 IP 를 플래그하면 PO token 없이는 googlevideo 가 미디어 URL 을 403 으로 거부하므로,
# bgutil POT provider(HTTP 서버)를 같은 컨테이너에서 함께 띄운다.
#
# POT_PROVIDER_DISABLED=1 로 두면 provider 없이 봇만 실행한다.
set -euo pipefail

POT_PROVIDER_ENTRY="/opt/pot-provider/build/main.js"

if [[ "${POT_PROVIDER_DISABLED:-0}" != "1" && -f "$POT_PROVIDER_ENTRY" ]]; then
  # 봇 로그와 섞여도 구분되게 접두사를 붙이고, provider 가 죽어도 봇은 계속 실행한다
  # (yt-dlp 는 provider 부재를 경고로만 처리하고 PO token 없이 해석한다).
  node "$POT_PROVIDER_ENTRY" 2>&1 | sed -u 's/^/[pot-provider] /' &
  echo "[trpg-bot] POT provider 를 기동했습니다 (127.0.0.1:4416)."
else
  echo "[trpg-bot] POT provider 를 사용하지 않습니다 (POT_PROVIDER_DISABLED=${POT_PROVIDER_DISABLED:-0})."
fi

exec node dist/index.js
