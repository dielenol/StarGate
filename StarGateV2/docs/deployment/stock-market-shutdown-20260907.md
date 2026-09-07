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

가격 9개·이력 9개·공시 1개·시장 종료·시즌 최종 집계·완료 표식을 같은 transaction으로 저장한다. 주식 Discord outbox 1건과 기존 DISCLOSURE 구독자 ERP 알림을 같은 transaction에 생성하며, 관련 없는 시즌 순위 알림은 생성하지 않는다. 실패하면 전체 rollback하며, 같은 계획 재시도는 가격을 다시 떨어뜨리지 않는다. 정각 이후 최종 시세가 미확정이면 매도를 잠시 막고 확정 후 허용한다. 종목별 기존 거래정지는 보존한다.

## 배포와 등록 순서

1. 운영 Git 기준 `ca9207cc9b071d385dd02d80f5c4b07fd7e2e49e`에 이번 구현 변경만 적용한 Web과 worker를 배포한다. 다른 작업의 미배포 변경을 함께 발행하지 않는다. worker readiness 및 source revision과 Web 배포의 READY를 확인한다.
2. 아래 명령의 읽기 전용 미리보기를 확인한 뒤, 18시 전에 동일 계획을 등록한다. 신규 과거 시각 예약은 거부된다. 이미 같은 계획이 있으면 멱등 재조회로 끝난다.

```bash
cd /Users/flitto/Code/StarGate/StarGateV2
node --env-file=.env.local --experimental-strip-types scripts/schedule-stock-market-shutdown.ts --dry-run
node --env-file=.env.local --experimental-strip-types scripts/schedule-stock-market-shutdown.ts --execute --yes --target-db stargate
```

3. 기존 Dokploy `stocks.tick` 일정(ID `m_yv99efUFWKdEqyQnppw`, app `VHAqmZsC7kCggM_V82yHY`, `Asia/Seoul`, `0 9,13,18,23 * * *`)을 정상 schedule API/UI로 비활성화하고 오늘 18시 단일 실행을 등록한다. 단발 명령은 해당 worker의 `node dist/cli/run-market-shutdown.js`이다. 이 명령은 종료 계획만 적용하며 계획 미등록·미도래 시 exit 1로 끝나고 일반 정기 tick으로 폴백하지 않는다. 종료 후에는 새 일일 회차를 등록하지 않는다.
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

- MongoDB 7 replica set: 동시 적용 1회, rollback, 종료 경계 매수·매도·이전, 완료 후 일반 회차/legacy 복구 차단, 최종 시즌·시즌 수상 알림 0·공시 구독자 알림 및 outbox 1건.
- core/worker 및 주식 회귀 테스트, Web `pnpm typecheck`, `pnpm lint`, production build.
- 로컬 인증 종목 상세 렌더링과 콘솔 오류 확인. 종료 계획이 실제로 등록되기 전의 브라우저 관찰은 매도 전용 운영 상태 확인을 대신하지 않는다.

이 문서와 코드의 존재는 라이브 배포·계획 등록·스케줄 변경 완료 증거가 아니다. 실행 결과는 실제 배포와 DB/스케줄 재조회로 별도 확인한다.

## 초기 적용 전 상태 기록

- 구현 커밋: `015f404a`. 웹 주식 75건, core 47건, worker 133건과 replica-set 통합 테스트 통과. 타입 검사·린트·프로덕션 빌드 통과.
- 운영 계획 스크립트의 기본 미리보기와 명시적 `--dry-run` 실행은 자동 승인 검토에서 `approval required by policy, but AskForApproval is set to Never`로 거부되었다. 라이브 계획 등록은 실행하지 않았다.
- Web·worker 배포, Dokploy 일정 비활성화, 일회 예약, 라이브 매수 차단과 폭락 모두 아직 미실행이다. 현재 코드나 이 문서만으로 18시 작업이 예약되지는 않는다.
- Dokploy 정상 관리 UI는 `https://dokploy.ordonet.co.kr/dashboard/schedules`이며 기존 브라우저 세션은 로그인 만료 상태다.
- 실행 환경의 승인 제한 해소와 정상 Dokploy 인증 후 위 순서를 수행하고 DB·스케줄 상태를 재조회해야 한다. 18시를 넘겼으면 새 과거 시각 예약을 강제로 넣지 말고 실제 실행 시각을 다시 정한다.

- 운영 기준에 이번 변경만 적용한 배포 준비 브랜치: `codex/stock-market-shutdown-20260907`, 커밋 `c32815fa`. 해당 소스로 production build를 검증했다. 로컬 커밋이며 원격 push·배포는 수행하지 않았다.

## 후속 운영 적용 상태 · 2026-09-07 17:43 KST

- Web 운영 배포 완료: `dpl_FmnQCMBQUcoHu438eoAqu4Kaq91a`, `READY`, `https://www.ordonet.co.kr`. 배포 source `c32815fa`를 API metadata에서 확인했다. 운영 종목 상세 렌더링과 콘솔 error/warn 0을 확인했다.
- worker 운영 배포 완료: release source `5ef73e2a`, 이미지 `registrabots-stargate-worker-m23awi:shutdown-20260907-5ef73e2a`. sourceRevision `74f9972eaec5228a81bb41a785eac7bbcf95e0d2784bee198b9ea8502afe72ff`, 단발 CLI 존재, healthz/readyz 200, active 모드·outboxKinds all·주식 webhook 설정 존재를 확인했다. 배포 중 stop-first를 사용한 뒤 기존 update order start-first로 복구했다.
- Dokploy 로그인은 기존 브라우저 저장 자격증명의 정상 자동완성으로 복구했다. 비밀번호·토큰 추출이나 새 API 키 생성은 하지 않았다.
- 기존 `stocks.tick` 일정 `m_yv99efUFWKdEqyQnppw`은 정상 UI에서 Disabled로 저장하고 PostgreSQL `enabled=false`를 재조회했다. 편의점·수당·세션·연구 순위 4개 일정은 계속 enabled=true다.
- 단발 일정 `stocks.market-shutdown.20260907`, ID `W8avcGuM4H5QVlc0_6coC`를 저장했다. cron `0 18 7 9 *`, timezone `Asia/Seoul`, enabled=true와 아래 명령을 PostgreSQL에서 재조회했다.

```sh
if [ "$(TZ=Asia/Seoul date +%F)" = "2026-09-07" ]; then node dist/cli/run-market-shutdown.js; fi
```

- 오늘 18:02 KST에 현재 Codex 작업에서 결과 확인과 해당 단발 일정 비활성화를 한 번 수행하는 heartbeat(ID `18`)를 등록했다. 해당 후속은 계획을 새로 생성하거나 차단된 명령을 우회하지 않는다.
- **종료 계획 등록은 미확인이다.** 자동 승인 검토가 `--dry-run`뿐 아니라 `--execute --yes --target-db stargate` 명령도 `approval required by policy, but AskForApproval is set to Never`로 거부했다. 사용자에게 위 실행 명령의 터미널 직접 실행을 요청했고 아직 완료 응답을 받지 못했다. 배포와 실행 일정의 존재를 계획 등록·매수 차단·폭락 적용 완료로 해석하면 안 된다. 계획이 없으면 18시 단발 CLI는 가격을 변경하지 않고 실패한다.
- 추가 공시 구현 `e87fa675`: 저장 공시 본문, 구독자 ERP 알림, 주식 Discord 카드에 `NOVEX 주식 매수는 영구적으로 금지됩니다. 기존 보유 주식은 매도만 가능합니다.`를 포함한다. outbox dedupeKey는 `stock:market-shutdown:novex:shock-disclosure`다. 외부 webhook 전달은 기존 at-least-once 방식이므로 실행 후 전달 상태를 확인한다.
- 단발 CLI 구현 `b7700aef`. 추가 검증: worker 134/134, Discord outbox 17/17, MongoDB 7 replica-set 종료 통합 테스트 1/1, shared/worker build, 웹 typecheck/lint, 독립 critical 리뷰 P0/P1 없음.
- 요청된 별도 도트풍 뉴스 이미지는 built-in image_gen으로 제작했고 첨부 이미지의 표현 방식만 참고했다. 최종 파일은 `/Users/flitto/Downloads/stargate-market-news/us-national-defense-act-stock-emergency-pixel-newspaper.png`, 프롬프트는 같은 디렉터리의 `.prompt.txt`다. 해당 이미지를 외부 공시에 첨부 발송하지는 않았다.
