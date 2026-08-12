# /erp/stock

## 2026-07-06 · 기능 개발 · 시장 분석과 NOVEX

- 시장 요약, 보유 신호와 조건 알림 브리핑을 목록·포트폴리오에 추가했다.
- 시총 가중 NOVEX 종합지수와 주가 이력 기반 변동 그래프를 상단 시장 요약에 연결했다.
- 하락 이벤트 사유와 종목명이 포함된 브리핑으로 정보 식별성을 높였다.
- 검증: 지수 계산·시계열 API, 시장 요약과 이벤트 렌더링 변경을 대조했다.
- 관련 커밋: `a5961a3`, `10a6462`, `ab504c0`, `993608c`, `66f7141`

## 2026-07-09 · 정기 공시 표현·전송 개선

- 정기 공시를 개요·상승·하락·보합 장부로 분리하고 방향 라벨과 거래소 링크를 정리했다.
- 각 embed를 별도 webhook 메시지로 전송해 Discord에서 네 개 카드로 보이도록 수정했다.
- 검증: 상승·하락 장부 상시 생성, 전송 개수와 공시 문구 테스트를 확인했다.
- 관련 커밋: `b378018`, `fc9f65d`, `d437357`, `4e1891d`, `d663346`, `cfb7b7c`, `5f66530`, `a72a0ad`, `c117837`

## 2026-07-13 · 조건 감시 범위 안내

- 조건 감시가 현재 브라우저에만 저장된다는 안내를 목록과 종목 상세에 동일하게 표시했다.
- 검증: 두 화면의 안내 문구가 일치하는지 커밋 diff로 확인했다.
- 관련 커밋: `d102fb1`

## 2026-07-23 · 운영 안정화 · 정기 공시 동기화

- 정기 공시를 당일 최신 묶음으로 단일화하고 revision·lease 기반 재시도와 장부 복구를 추가했다.
- 공시 갱신을 기존 일일 배치 안에서만 실행하고 과거 자동 공지와 중단된 메시지를 웹훅 기준으로 정리하도록 안정화했다.
- 검증: 공시 동기화, webhook 실패, route 실행 경계와 scheduled tick 복구 테스트가 함께 보강됐다.
- 관련 커밋: `97ecd98`, `7ad99a3`, `2641861`, `a0acccf`

## 2026-07-27 · 반응형·렌더링 안정화

- 실제 콘텐츠 폭에 따라 시장 브리핑을 3열, 2열, 1열로 전환하고 넓은 화면의 한 줄 배치를 유지했다.
- `/erp/stock/[ticker]`의 Recharts 초기 크기를 지정해 첫 렌더의 음수 크기 경고를 제거했다.
- 모바일 첫 렌더에서 주가 차트와 매출 구성 차트의 크기를 안정화했다.
- 검증: 1482px, 1280px, 768px, 390px viewport, 문서 가로 넘침과 브라우저 warning/error를 확인했다.
- 관련 커밋: `5ebf8f6`

## 2026-07-30 · 기능 변경 · 시세 실시간 갱신

- 시세·지수·공시의 60초 polling을 연결 장애 중에만 사용하는 fallback으로 전환했다.
- 주식 가격·보유량 변경은 주식 화면과 거래 복합 응답을 함께 무효화한다.
- 검증: realtime Query 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-07-31 · 성능 최적화 · 시세 히스토리 벌크 조회

- 공시 wire·지수 히스토리가 티커별로 반복하던 18회 히스토리 쿼리를 `$in` 벌크 1회로 교체했다. 페이지 경로는 두 빌더가 한 번의 조회를 공유한다.
- 진입 시 initialData가 있는데도 refetchOnMount "always"로 즉시 중복 페치하던 holdings 훅을 정리했다.
- 검증: 응답 형식 등가 보존 확인, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- 관련 커밋: `e1bd14f`, `bce9d0a`

## 2026-08-01 · 기능 추가 · 소다 판매량 STM 자동 반영

- 활성 이벤트의 미적용 소다 판매량을 다음 자동 STM 정기 시세에 1개당 `+0.10%p`, 1회 최대 `+5.00%p`로 가산하고 공시 문구에 판매 수량과 영향을 표시한다.
- 판매량 소비·STM 가격·append-only history를 같은 transaction으로 묶어 동시 tick과 replay에서도 한 번만 반영한다. GM force tick은 판매량을 소비하지 않는다.
- 자동 소비는 기본 비활성 gate로 두고, checkout dual-write 배포와 기존 판매량 backfill 검증이 끝난 뒤 Web·worker에서 함께 활성화하도록 했다. 지연된 미적용 판매량은 만료시키지 않는다.
- 검증: core 테스트 10개, focused stock/shop 테스트 10개, worker 테스트 47개, shared-db build, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`, critical risk review
- 관련 커밋: `eff30f76`
- 후속 작업: 격리 replica-set용 `TEST_MONGODB_URI`가 없어 Mongo rollback/replay 통합 테스트 1개는 skip됐다. 라이브 활성화 후 첫 자동 tick에서 STM history와 demand 원장을 재조회해야 한다.

## 2026-08-10 · 안정성 개선 · 정기 공시 단일 메시지 교체

- 네 장으로 나뉘던 정기 시세 공시를 한 Discord 메시지의 네 embed로 묶어 같은 회차가 채널에 흩어지지 않게 했다.
- 웹은 공시 desired-state만 기록하고 worker가 새 메시지를 활성화한 뒤 이전 메시지를 정리해 교체 중 공백을 방지한다.
- Discord의 embed·field·전체 6,000자 제한을 발송 직전에 적용하고, 줄어든 내용의 수를 메시지에 표시한다.
- 검증: 주식 공시 집중 테스트 포함 웹 41건, worker 71건, 웹 `typecheck`·전체 `lint`, 엄격 코드 리뷰
- 관련 커밋: `62c0b969`
- 운영 경계: 라이브 시세 tick·주가·공시 메시지는 변경하지 않았다.

## 2026-08-11 · 회귀 수정 · 정기 시세 공시 네 장 복원

- 정기 시세 공시를 요약·상승·하락·보합/특이사항의 독립된 Discord 메시지 네 장으로 분리해 모든 장부가 항상 노출되도록 복원했다.
- 공시 포맷 revision을 desired-state에 기록해 기존 `1 message × 4 embeds` 상태만 한 번 교체하고, 이미 최신인 `4 messages × 1 embed` 상태의 동일 재요청은 무시한다.
- 네 장 생성 중 부분 실패와 활성화 후 이전 메시지 삭제 실패가 발생해도 기존 또는 새 네 장을 보존하고 재시도에서 수렴하도록 실행 테스트로 검증했다.
- 검증: 웹 주식 테스트 20개, core 테스트 20개, worker 테스트 88개, 웹 `typecheck`·전체 `lint`, `git diff --check`, critical risk review
- 관련 커밋: `9a1e2cd8`
- 운영 경계: 라이브 시세 tick·주가·desired-state·Discord 메시지는 변경하지 않았다.

## 2026-08-12 · 배포 회귀 방지 · worker 반영 검증

- 정기 공시 네 장 복구 뒤에도 Dokploy의 stargate-worker branch가 분리 배포 브랜치에 남아 `main` webhook을 `Branch Not Match`로 거절했고, 기존 GitHub Actions는 redirect된 응답을 성공으로 오인한 원인을 확인했다.
- worker 배포는 Dokploy의 HTTP 200과 정확한 접수 메시지를 모두 요구하고, 배포 이미지의 source revision이 `/readyz`에 실제로 나타날 때까지 확인해야 성공하도록 강화했다.
- 301 branch 불일치, 잘못된 200 응답, 비 JSON 응답, 정상 배포와 구버전 timeout을 실행형 테스트로 검증하고 전체 worker 94개·core 20개 테스트, Docker 전체 빌드와 runtime revision 일치, YAML parse·`bash -n`·`git diff --check`, critical risk review를 통과했다.
- 관련 커밋: `9fc8c3b1`
- 운영 경계: Dokploy branch 설정 변경·worker 재배포·오늘 공시 재요청·Discord 메시지 교체는 실행하지 않았다.
