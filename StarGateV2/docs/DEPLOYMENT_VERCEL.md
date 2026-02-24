# Vercel Deployment Guide

## 개요

이 프로젝트는 Next API Route(`app/api/*`)를 사용하므로, 정적 호스팅인 GitHub Pages 대신 서버 런타임 배포가 필요합니다.  
권장 배포 대상은 Vercel입니다.

## 1) Vercel 프로젝트 연결

1. Vercel 대시보드에서 `Add New... > Project`를 선택합니다.
2. GitHub 저장소 `StarGateV2`를 선택합니다.
3. Framework Preset은 `Next.js`로 자동 인식되는지 확인합니다.
4. Root Directory가 `StarGateV2`인지 확인합니다.

## 2) 환경변수 설정

Vercel 프로젝트의 `Settings > Environment Variables`에서 아래 값을 추가합니다.

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

- `Production`, `Preview`, `Development` 환경에 모두 설정하는 것을 권장합니다.
- 값 수정 후에는 재배포가 필요합니다.

## 3) 배포 동작 방식

- `main` 브랜치 push: Production 배포
- Pull Request: Preview 배포
- Vercel이 GitHub 이벤트를 수신해 자동 빌드/배포를 처리합니다.

## 4) 검증 체크리스트

1. `/apply` 제출 시 Discord 채널에 메시지가 도착하는지 확인
2. `/contact` 제출 시 Discord 채널에 메시지가 도착하는지 확인
3. 필수 입력 누락 시 에러 메시지가 정상 반환되는지 확인
4. Webhook URL이 비어있을 때 서버 오류 응답이 정상 동작하는지 확인

## 5) GitHub Pages 관련 주의사항

- GitHub Pages는 `app/api/*` 라우트를 실행할 수 없습니다.
- 따라서 Pages 배포 워크플로는 제거하거나 비활성화해야 합니다.
