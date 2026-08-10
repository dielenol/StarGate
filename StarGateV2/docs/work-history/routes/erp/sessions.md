# /erp/sessions

## 2026-07-30 · 기능 변경 · 세션·RSVP 실시간 갱신

- 현재 월 목록의 60초 polling을 연결 장애 fallback으로 전환했다.
- 최초값으로 고정되던 우측 예정 세션을 서버/API 공용 조회와 Query에 연결했다.
- Registra/TRPG 세션·RSVP 변경 resource가 월 목록과 예정 목록을 함께 갱신한다.
- 검증: `pnpm test:worker`, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-08-10 · 기능 추가 · 게스트 세션 일정 미리보기

- 게스트는 공개 세션 일정과 기본 설명을 볼 수 있지만 길드·채널·메시지 ID, 참여자 신원, 내 RSVP 상태는 응답에서 제거한다.
- 참가 신청·외부 이동·보고서 작성 같은 행동 링크를 숨기고 참여자 정보가 비공개임을 화면에 안내한다.
- 검증: 게스트 접근 계약 테스트 11/11, 실제 게스트 세션 API 식별자 제거 확인, 데스크톱·390×844 목록 확인(행동 링크·가로 넘침·콘솔 오류 없음), `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `aa3ce2d8`
