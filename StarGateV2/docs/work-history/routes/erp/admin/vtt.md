# /erp/admin/vtt

## 2026-08-22 · 기능 추가 · Nochichim 원격 운영

- GM이 Nochichim 런타임 상태·접속자·소스 revision을 확인하고 앱 프로세스만 시작하거나 종료할 수 있는 전용 운영 화면을 추가했다.
- 서버 Route Handler가 GM 세션과 same-origin을 다시 검사하고, Cloudflare Service Token과 HMAC을 브라우저에 노출하지 않은 채 제어 요청을 전달하도록 했다.
- 접속자 존재 시 일반 종료를 차단하고 명시적 재확인을 요구하며, 성공한 조작은 request ID 기반 durable 감사 outbox에 기록하도록 했다.
- 검증: VTT 런타임 집중 테스트 16건, `pnpm typecheck`, 변경 파일 ESLint, production build
- 관련 커밋: `e62762b0`
- 후속 작업: Contabo VPS·Cloudflare Tunnel/Access·Vercel Production 환경변수 구성과 데이터 컷오버 및 라이브 수용 검증이 남아 있다.
- 운영 경계: 라이브 VPS·Cloudflare·Vercel 설정과 Nochichim 데이터는 변경하지 않았다.

## 2026-08-27 · 기능 확장 · HOME·VPS 하이브리드 전환

- GM이 공개 VTT의 활성 호스트를 `HOME`, `VPS`, `OFFLINE` 중 하나로 선택하고, 전환 단계·세대 번호·양쪽 런타임 상태를 한 화면에서 확인하도록 확장했다.
- 서버가 GM 세션과 same-origin을 재검사하고 Cloudflare Access·HMAC을 붙여 v2 controller를 호출하며, Production 설정이 불완전하면 조작을 닫도록 했다.
- 완료된 전환을 durable 감사 outbox에 한 번만 기록하고, 누락 감사 기록은 일일 Cron이 동일 request ID로 보완하도록 했다.
- 검증: VTT 런타임 집중 테스트 55건, `pnpm typecheck`, 변경 TypeScript 파일 ESLint, production build
- 관련 커밋: `e2a55603`
- 운영 경계: 상용 배포·Cloudflare DNS/Tunnel·Vercel 환경변수·라이브 VTT 데이터는 변경하지 않았다.
