# /erp/notifications

## 2026-07-02 · UI·편의 기능 개선

- 알림 요약, 필터와 피드를 command panel 구조로 정리하고 상태별 아이콘을 적용했다.
- 피드 전체 읽음과 빈 결과 필터 초기화 버튼을 추가했다.
- 검증: 알림 Query·mutation 연결과 화면 상태별 액션 렌더링을 대조했다.
- 관련 커밋: `978d05f`, `c9bd8d7`

## 2026-07-30 · 기능 추가 · 대상 사용자 실시간 알림

- 새 알림은 대상 사용자 Query만 무효화하고 다른 사용자의 notification Query는 건드리지 않는다.
- `primary + connected`에서는 기존 60초 polling을 중지하고 장애 중에만 재개한다.
- 최초 로드 과거 알림은 띄우지 않으며 새 알림만 접근 가능한 6초 toast로 표시한다.
- 검증: worker 대상 socket 테스트, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `586cc62`, `bba8924`

## 2026-07-31 · 기능 추가 · 복권 결과 개인 알림

- 미스터비스트 복권 결과 공개와 같은 transaction에서 당첨 또는 꽝 개인 알림을 한 번만 생성한다.
- 캐릭터 소유권이 변경된 진행 중 복권은 현재 소유자에게 감사 이력을 남기며 이관하고, 알림도 현재 소유자에게 전달한다.
- 검증: 복권 집중 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- 관련 커밋: `e733a98`

## 2026-07-31 · 성능 최적화 · 알림 폴링 304 재검증

- 알림 목록/요약 GET에 ETag/304 도입 — 전 ERP 페이지 공통 60초 폴링에서 데이터 불변 시 응답 바디 0B.
- 검증: http-cache 단위 테스트, `pnpm build`
- 관련 커밋: `0390f80`

## 2026-08-14 · 기능 추가 · 주식 개인 알림

- 관심종목의 목표가 하향 돌파·회차 등락·공시와 시즌 순위를 새 `STOCK` ERP 알림으로 표시하고 Discord DM과 분리했다.
- 목표가는 재상승 뒤 재무장하고, 등락은 회차별 한 번, 공시는 공시 ID별 한 번만 생성되도록 dedupe했다.
- 검증: 알림 crossing·재무장·동시 설정 저장 계약, worker 대상 Query invalidation, `pnpm typecheck`, 전체 `pnpm lint`, production build, 인증 로컬 알림 화면 확인
- 관련 커밋: `fb012220`
- 운영 경계: 라이브 개인 알림과 Discord 메시지는 생성하지 않았다.

## 2026-08-26 · 기능 확장 · 작전 공적 HONOR 알림

- 새 작전 공적을 당사자에게 한 번만 전달하는 `HONOR` 알림 유형과 명예의 전당 작전 부문 링크를 추가했다.
- 공적 확정 transaction의 논리키와 알림 dedupe를 함께 묶어 중복 completion에도 한 건만 생성하며, 과거 backfill은 알림을 만들지 않는다.
- 검증: shared 공적 계약 7건·DB 환경 의존 1건 skip, worker 152건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review P0/P1 없음
- 관련 구현 커밋: `684efcd7`
- 운영 경계: writer gate는 기본 비활성이며 라이브 알림·Discord·웹훅은 발송하지 않았다.
