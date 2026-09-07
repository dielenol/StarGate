# 2026-09-07 NOVEX 시장 종료

사용자 요청: 한국시간 2026-09-07 18:00에 `파리 사태로 인한 쇼크`를 한 번 반영하고 정기 시세 갱신을 종료한다. 계획 등록 시점부터 매수와 주식 이전을 막고, 보유 주식 매도만 유지한다.

## 확정 계획

| 종목 | 하락률 |
|---|---:|
| TWS | 45% |
| STM | 50% |
| SSR | 65% |
| MSF | 40% |
| VFP | 47% |
| BPE | 58% |
| ART | 55% |
| GN3 | 70% |
| SPZ | 62% |

시각은 `2026-09-07T09:00:00.000Z`이며 현재 운영 서버의 Europe/Berlin 시간으로는 11:00이다. 가격은 실행 당시 시세에 위 하락률을 적용하고 0.01 CR 단위로 반올림한다. 보유량과 크레딧은 폭락 작업이 직접 변경하지 않는다.

가격 9개·이력 9개·공시 1개·시장 종료·시즌 최종 집계·완료 표식을 같은 transaction으로 저장한다. Discord/outbox/시즌 순위 알림은 생성하지 않는다. 실패하면 전체 rollback하며, 같은 계획 재시도는 가격을 다시 떨어뜨리지 않는다. 정각 이후 최종 시세가 미확정이면 매도를 잠시 막고 확정 후 허용한다. 종목별 기존 거래정지는 보존한다.

## 배포와 등록 순서

1. 운영 Git 기준 `ca9207cc9b071d385dd02d80f5c4b07fd7e2e49e`에 이번 구현 변경만 적용한 Web과 worker를 배포한다. 다른 작업의 미배포 변경을 함께 발행하지 않는다. worker readiness 및 source revision과 Web 배포의 READY를 확인한다.
2. 아래 명령의 읽기 전용 미리보기를 확인한 뒤, 18시 전에 동일 계획을 등록한다. 신규 과거 시각 예약은 거부된다. 이미 같은 계획이 있으면 멱등 재조회로 끝난다.

```bash
cd /Users/flitto/Code/StarGate/StarGateV2
node --env-file=.env.local --experimental-strip-types scripts/schedule-stock-market-shutdown.ts --dry-run
node --env-file=.env.local --experimental-strip-types scripts/schedule-stock-market-shutdown.ts --execute --yes --target-db stargate
```

3. 기존 Dokploy `stocks.tick` 일정(ID `m_yv99efUFWKdEqyQnppw`, app `VHAqmZsC7kCggM_V82yHY`, `Asia/Seoul`, `0 9,13,18,23 * * *`)을 정상 schedule API/UI로 비활성화하고 오늘 18시 단일 실행을 등록한다. 명령은 해당 worker의 `pnpm job stocks.tick`이다. 종료 후에는 새 일일 회차를 등록하지 않는다.
4. 정상 API 인증을 사용할 수 없을 때에는 임의로 API 키를 만들거나 인증을 우회하지 않는다. DB의 `enabled=false`만 변경해도 Dokploy 메모리 cron이 취소되지는 않는다. 제어 서비스 재시작 대안에는 별도 운영 점검이 필요하다. 따라서 스케줄 중단 확인 없이 완료로 보고하지 않는다.

운영 서버에서 일회 작업을 등록할 때에는 기존 서비스 매니저를 사용하고, SSH 종료 뒤 유지됨을 확인한다. 현 서버의 사용자 systemd는 `Linger=no`이므로 단독 user timer를 완료 증거로 삼지 않는다. 사용자 crontab을 쓰면 서버 시각 9월 7일 11:00, 연도/날짜 검사, 성공 후 자기 항목 제거가 필요하다. 실패 재시도는 저장된 plan의 멱등 처리에 맡긴다.

## 재조회 기준

- 등록 직후 `stock_market_shutdown._id=novex`: `SCHEDULED`, 정확한 executeAt/reason/declines/buysBlockedAt.
- Web에서 `market.tradingMode=SELL_ONLY`, 매수 탭 잠금, 보유가 있는 계정의 매도 탭·전량 수량 입력 유지.
- 18시 이후 plan `COMPLETED`; 9종목 `lastUpdate=2026-09-07 18:00`, 정확한 최종 가격과 사유.
- `stock_price_history.operationKey=stock-market-shutdown:novex:<ticker>` 각 1개, `stock_disclosures._id=stock-market-shutdown:novex` 1개.
- 시장 `CLOSED`/`SELL_ONLY`, `nextSlotAt` 없음, 활성 시즌은 최종 시세 기준 `FINALIZED`.
- 기존 주식 정기 일정 비활성화와 일회 작업 완료/제거. 다른 서비스 일정은 유지.

인증 브라우저에서는 실제 매수·매도 mutation을 실행하지 않는다. 거래 정산, 중복 요청과 rollback은 테스트 DB에서 검증한다.

## 구현 검증

- MongoDB 7 replica set: 동시 적용 1회, rollback, 종료 경계 매수·매도·이전, 완료 후 일반 회차/legacy 복구 차단, 최종 시즌·알림 0.
- core/worker 및 주식 회귀 테스트, Web `pnpm typecheck`, `pnpm lint`, production build.
- 로컬 인증 종목 상세 렌더링과 콘솔 오류 확인. 종료 계획이 실제로 등록되기 전의 브라우저 관찰은 매도 전용 운영 상태 확인을 대신하지 않는다.

이 문서와 코드의 존재는 라이브 배포·계획 등록·스케줄 변경 완료 증거가 아니다. 실행 결과는 실제 배포와 DB/스케줄 재조회로 별도 확인한다.

## 현재 실행 상태

- 구현 커밋: `015f404a`. 웹 주식 75건, core 47건, worker 133건과 replica-set 통합 테스트 통과. 타입 검사·린트·프로덕션 빌드 통과.
- 운영 계획 스크립트의 기본 미리보기와 명시적 `--dry-run` 실행은 자동 승인 검토에서 `approval required by policy, but AskForApproval is set to Never`로 거부되었다. 라이브 계획 등록은 실행하지 않았다.
- Web·worker 배포, Dokploy 일정 비활성화, 일회 예약, 라이브 매수 차단과 폭락 모두 아직 미실행이다. 현재 코드나 이 문서만으로 18시 작업이 예약되지는 않는다.
- Dokploy 정상 관리 UI는 `https://dokploy.ordonet.co.kr/dashboard/schedules`이며 기존 브라우저 세션은 로그인 만료 상태다.
- 실행 환경의 승인 제한 해소와 정상 Dokploy 인증 후 위 순서를 수행하고 DB·스케줄 상태를 재조회해야 한다. 18시를 넘겼으면 새 과거 시각 예약을 강제로 넣지 말고 실제 실행 시각을 다시 정한다.

- 운영 기준에 이번 변경만 적용한 배포 준비 브랜치: `codex/stock-market-shutdown-20260907`, 커밋 `c32815fa`. 해당 소스로 production build를 검증했다. 로컬 커밋이며 원격 push·배포는 수행하지 않았다.
