# /erp/stock

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
