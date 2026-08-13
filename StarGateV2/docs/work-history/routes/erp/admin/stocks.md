# /erp/admin/stocks

## 2026-07-06 · 기능 개발 · 주식 운영 도구

- 빠른 가격 조정, 공시 템플릿과 변동폭 미리보기를 운영 화면에 추가했다.
- 전체 주식 보유자 현황과 크레딧 운영 대상에 대한 주식 보상 지급을 연결했다.
- 검증: 운영 화면·조회 API와 보상 mutation의 연결 커밋을 대조했다.
- 관련 커밋: `10a6462`, `993608c`, `3394169`

## 2026-07-11 · 감사 알림

- GM의 가격 조정과 시세 갱신 작업을 멘션 없는 Discord 감사 알림으로 전달하도록 연결했다.
- 검증: GM 전용 라우팅과 mention 차단 계약 테스트 추가를 확인했다.
- 관련 커밋: `10adcf4`

## 2026-08-09 · 기능 변경 · worker 예약 작업 소유권 표시

- 주식·일일 수당 예약 작업의 자동 소유자를 Vercel cron이 아닌 장기 실행 worker로 표시하고, 웹 cron route는 작업을 명시한 인증 수동 복구 진입점으로만 남겼다.
- 낡은 legacy owner 기본 활성화와 관련 테스트를 제거해 worker와 웹이 같은 slot을 동시에 실행하는 오해를 없앴다.
- 검증: 주식 집중 테스트, 웹 `typecheck`·`lint`·production build, worker 62건, `git diff --check`
- 관련 커밋: `45944a0c`
- 운영 경계: Dokploy schedule·주가·수당 mutation은 실행하지 않았다.

## 2026-08-13 · 이벤트 추가 · STM 규제 적발 충격 예약

- 2026-08-14 12:00 KST의 자동 정기 틱에만 STM 직전가 대비 50% 충격과 노부스오르도 감사팀·미국 식약청의 소다 원료 적발 사유를 적용하도록 예약했다.
- 슬롯 전 수동 실행과 강제 재실행은 예약 충격을 적용하지 않고, 특별 공시에 가려진 소다 판매량 영향도 소진하지 않도록 했다.
- 검증: core 21건, scheduled tick 복구 8건, worker 95건, core `typecheck`, `git diff --check`, critical risk review
- 관련 커밋: `b54bf3c3`
- 운영 경계: 라이브 STM 시세·이력·공시와 배포는 아직 변경하지 않았다.

## 2026-08-13 · 기능 추가 · 일회성 정기 공시 예약

- GM이 종목, 정기 공시일, 변동률, 공시 등급과 사유를 지정해 일회성 이벤트를 예약하고 적용 전 취소할 수 있게 했다. 예약가 미리보기와 예약·처리 이력도 같은 운영 화면에 배치했다.
- 예약 생성·취소·감사 기록과 정기 틱의 이벤트 claim을 멱등 transaction으로 연결했다. 12:00 KST 직전 생성과 정기 틱의 경쟁은 같은 시세 문서 write fence로 직렬화하고, 12시 전 non-force 실행은 이력을 만들기 전에 거부한다.
- 검증: 실제 MongoDB 7 replica set 경쟁·rollback 1건, core 21건, 예약·틱 16건, worker 95건, `pnpm typecheck`, 전체 `pnpm lint`, production build, GM 인증 Chrome 화면·배치 확인, critical risk review
- 관련 커밋: `bd751a90`
- 운영 경계: 라이브 예약 생성·취소와 시세 mutation은 실행하지 않았다.

## 2026-08-13 · 기능 추가 · 개별 종목 거래정지

- GM이 운영 시세가 등록된 종목을 개별 거래정지하거나 재개하고 현재 상태를 목록과 조정 패널에서 확인할 수 있게 했다.
- 상태 변경과 GM 감사 outbox를 하나의 멱등 transaction으로 묶고, 매매·자산 교환과 같은 시세 문서 write로 직렬화해 정지 직전 체결 경쟁의 순서를 보장했다.
- 검증: 주식·거래 집중 테스트 64건 통과, replica-set 통합 테스트 1건 환경 부재 skip, `pnpm typecheck`, 전체 `pnpm lint`, production build, critical risk review
- 관련 커밋: `f75fd2ea`
- 운영 경계: 라이브 종목 거래 상태·시세·보유량·거래는 변경하지 않았다.
