# /erp/account

## 2026-07-27 · 반응형 수정

- 사이드바가 유지되는 중간 콘텐츠 폭에서 계정 요약 카드가 지나치게 좁아지지 않도록 4열을 2열로 전환했다.
- 넓은 화면의 4열과 모바일의 1열 구성은 유지했다.
- 검증: 1482px, 1280px, 768px, 390px viewport와 문서 가로 넘침을 확인했다.
- 관련 커밋: `368042a`

## 2026-07-30 · 기능 변경 · 실시간 계정 요약

- 현재 사용자 조회를 서버와 API가 공유하는 Query로 전환해 역할·상태·Discord 연동 요약이 실시간 신호 또는 장애 시 60초 polling으로 갱신된다.
- role/status 변경은 `session-refresh` 뒤 현재 세션과 route를 다시 검증한다.
- 검증: `pnpm lint`, `pnpm typecheck`, `pnpm build:web`, realtime 계약 테스트
- 관련 커밋: `bba8924`

## 2026-08-07 · 운영 연동 · pitboy Credentials 로그인과 수잔 표시 신원

- 기존 Discord GM 계정에 중복 계정을 만들지 않고 `pitboy` Credentials 로그인을 연결하고, 소유 NPC 수잔 델라웨어를 ERP 표시 신원으로 지정했다.
- 계정 화면은 `pitboy` 사용자명·Discord 연동·`GM`/`ACTIVE` 상태를 그대로 보여 주며, 공용 헤더는 수잔의 H 등급을 표시한다. 실제 RBAC 역할과 관리자 접근 권한은 GM으로 유지된다.
- 검증: 운영 반영 직후 사용자·기존 GM `MAIN`·수잔 소유권/등급/이미지·경제 행 수를 독립 재조회하고, Credentials 로그인 후 `/erp/account`와 `/erp/admin`을 읽기 전용 브라우저로 확인
- 관련 커밋: `2f19fd84`, `2ff49207`

## 2026-08-10 · 기능 추가 · 게스트 계정 안내

- 게스트 계정 화면은 실제 사용자 DB를 조회하지 않고 `ERP Guest`·`U` 등급·읽기 전용 상태만 보여 준다.
- Discord 연동이나 계정별 상태처럼 게스트에게 해당하지 않는 정보는 노출하지 않고, 미리보기 세션임을 별도 안내한다.
- 검증: 게스트 접근 계약 테스트 11/11, 실제 Auth.js 게스트 로그인 후 계정 API와 화면 확인, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- 관련 커밋: `aa3ce2d8`
