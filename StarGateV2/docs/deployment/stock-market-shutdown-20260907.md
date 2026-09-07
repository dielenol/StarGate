# 2026-09-07 NOVEX 시장 종료

현재 사용자 요청: 한국시간 2026-09-07 장마감 **23:00**에 `파리 사태로 인한 쇼크`를 한 번 반영하고 정기 시세 갱신을 종료한다. 최종 공시에 기존 뉴스 이미지와 매수 영구 중단·가격 영구 동결·보유 주식 매도만 가능 안내를 함께 전달한다. 계획 등록 시점부터 매수와 주식 이전을 막고, 보유 주식 매도만 유지한다. 앞선 18시 실행 실패와 즉시 전환 시도는 아래 당시 기록으로 보존한다.

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

최종 시각은 `2026-09-07T14:00:00.000Z`이며 운영 서버의 Europe/Berlin 시간으로는 16:00이다. Dokploy는 `Asia/Seoul`을 명시한다. 가격은 실행 당시 시세에 위 하락률을 적용하고 0.01 CR 단위로 반올림한다. 보유량과 크레딧은 폭락 작업이 직접 변경하지 않는다.

가격 9개·이력 9개·공시 1개·시장 종료·시즌 최종 집계·완료 표식을 같은 transaction으로 저장한다. 주식 Discord outbox 1건과 기존 DISCLOSURE 구독자 ERP 알림을 같은 transaction에 생성하며, 관련 없는 시즌 순위 알림은 생성하지 않는다. 실패하면 전체 rollback하며, 같은 계획 재시도는 가격을 다시 떨어뜨리지 않는다. 최종 시세 확정 중에는 옛 가격의 매도를 막고 확정 후 허용한다. 최종 적용은 기존 거래정지·냉각·기업행동 정지 메타데이터를 제거하며, 이후 보유 주식 청산은 해당 제한을 받지 않는다.

## 배포와 등록 순서 · 23시 재예약 기준

1. 운영 Git 기준 `ca9207cc9b071d385dd02d80f5c4b07fd7e2e49e`에 이번 구현 변경만 적용한 Web과 worker를 배포한다. 다른 작업의 미배포 변경을 함께 발행하지 않는다. worker readiness 및 source revision과 Web 배포의 READY를 확인한다.
2. 아래 명령의 읽기 전용 미리보기를 확인한 뒤, 23시 전에 동일 계획을 등록한다. 기본 실행 시각은 23시이며 이 예약에서는 `--now`를 사용하지 않는다. 신규 과거 시각 예약은 거부된다. 이미 같은 시각·사유·하락률·이미지 계획이 있으면 멱등 재조회로 끝난다.

```bash
cd /Users/flitto/Code/StarGate/StarGateV2
node --env-file=.env.local --experimental-strip-types scripts/schedule-stock-market-shutdown.ts --dry-run
node --env-file=.env.local --experimental-strip-types scripts/schedule-stock-market-shutdown.ts --execute --yes --target-db stargate
```

3. 기존 Dokploy `stocks.tick` 일정(ID `m_yv99efUFWKdEqyQnppw`, app `VHAqmZsC7kCggM_V82yHY`, `Asia/Seoul`, `0 9,13,18,23 * * *`)은 비활성화 상태로 유지한다. 기존 단발 일정 `W8avcGuM4H5QVlc0_6coC`를 오늘 23시(`0 23 7 9 *`)로 변경한다. 날짜 검사 뒤 해당 worker의 `node dist/cli/run-market-shutdown.js`를 실행한다. 이 명령은 종료 계획만 적용하며 계획 미등록·미도래 시 exit 1로 끝나고 일반 정기 tick으로 폴백하지 않는다. 종료 후에는 새 일일 회차를 등록하지 않는다.
4. 정상 API 인증을 사용할 수 없을 때에는 임의로 API 키를 만들거나 인증을 우회하지 않는다. DB의 `enabled=false`만 변경해도 Dokploy 메모리 cron이 취소되지는 않는다. 제어 서비스 재시작 대안에는 별도 운영 점검이 필요하다. 따라서 스케줄 중단 확인 없이 완료로 보고하지 않는다.

운영 서버의 일회 작업은 기존 Dokploy 서비스 매니저를 사용하며 SSH 세션 수명에 의존하지 않는다. 별도의 사용자 cron이나 systemd timer는 만들지 않는다. 실패 재시도는 저장된 plan의 멱등 처리에 맡긴다.

## 재조회 기준

- 등록 직후 `stock_market_shutdown._id=novex`: `SCHEDULED`, 정확한 executeAt/reason/declines/buysBlockedAt.
- Web에서 `market.tradingMode=SELL_ONLY`, 매수 탭 잠금, 보유가 있는 계정의 매도 탭·전량 수량 입력 유지.
- 23시 이후 plan `COMPLETED`; 9종목 `lastUpdate=2026-09-07 23:00`, 정확한 최종 가격과 사유.
- `stock_price_history.operationKey=stock-market-shutdown:novex:<ticker>` 각 1개, `stock_disclosures._id=stock-market-shutdown:novex` 1개.
- 시장 `CLOSED`/`SELL_ONLY`, `nextSlotAt` 없음, 활성 시즌은 최종 시세 기준 `FINALIZED`.
- 기존 주식 정기 일정 비활성화와 일회 작업 완료/제거. 다른 서비스 일정은 유지.
- plan `announcementImageUrl`, 공시 `imageUrl`, outbox `announcementImageUrl`, Discord embed image가 동일한 최종 뉴스 URL을 참조한다. 공개 URL은 HTTP 200/image-webp여야 한다.

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

## 18시 실행 결과와 운영 중지 보완

- 단발 실행 `Q8TQfXzF1ZbD8xkcy9QU0`은 18:00:00.197에 시작해 18:00:01.955에 실패했다. worker 결과 `NOT_SCHEDULED`, `planStatus=null`, `appliedTickers=0`이며 Dokploy 상태는 `error`다.
- 18:01:37 KST 운영 DB 재조회: 종료 plan 없음, 시장 OPEN, 마지막 완료 회차 13시. 9종목 가격은 13시 값 그대로이며 종료 history 0건, 종료 공시 없음, 관련 알림·outbox 0건이다. 가격 폭락·매수 차단·동결이 실제 적용됐다고 보고하지 않는다.
- 18시 단발 일정도 정상 UI에서 Disabled로 저장했다. 이후 PostgreSQL에서 `stocks.tick=false`, `stocks.market-shutdown.20260907=false`, 나머지 네 일정=true를 재확인했다. 해당 결과 확인을 끝내 18:02 후속 heartbeat `18`은 PAUSED로 정리했다.
- 사용자가 운영 목적을 재확인했다: 마지막 전 종목 폭락 공시를 한 번 반영하고, 보유 주식 매도 외 주식 운영을 전부 중지한다. 매도는 가격이나 다음 회차 수급에 영향을 주지 않는다. 자동 공시·배당·기업행동·시즌·관리자 시세 조작·정지/재개·회차 복구는 중단한다. 자동 재개 시각은 두지 않으며 추후 재개는 별도 사용자 지시로만 다룬다.
- 기존 실행 도구에 `--now`를 추가했다. 기본 미리보기와 대상 DB 확인은 유지한다. 신규 즉시 전환은 실제 현재 시각 이후 5초로 계획을 등록하고 도래 후 같은 종료 엔진을 한 번 적용한다. 과거 18시로 소급하지 않고 이미 완료된 계획을 재실행해도 가격은 다시 변경하지 않는다.

```bash
cd /Users/flitto/Code/StarGate/StarGateV2
node --env-file=.env.local --experimental-strip-types scripts/schedule-stock-market-shutdown.ts --now --dry-run
node --env-file=.env.local --experimental-strip-types scripts/schedule-stock-market-shutdown.ts --now --execute --yes --target-db stargate
```

- 수정된 뉴스 이미지는 가상 뉴스·TRPG 문구를 모두 제거했다. 노부스 메인 색상 `#0a0a0d`·`#f1ecdc`·`#c9a85a`와 큰 고딕 글씨, `주식 매수 영구 중단 / 가격 영구 동결 / 보유 주식 매도만 가능`을 적용했다. 선택 파일은 `/Users/flitto/Downloads/stargate-market-news/us-national-defense-act-stock-emergency-pixel-newspaper-novus-gold.png`이며 같은 이름의 `.prompt.txt`에 built-in image_gen 편집 프롬프트를 저장했다. 외부 발송은 하지 않았다.

## 최종 배포와 실행 제한 · 2026-09-07 18:26 KST

- 전체 운영 중지 구현 커밋은 `b3ca9364`, 분리 배포 브랜치의 동일 변경 커밋은 `a6c83a33`이다. 다른 작업의 로컬 main 선행 커밋은 배포에 포함하지 않았다.
- Web 배포 `dpl_2FhtzJHWGN4PCrZujKfC4MyMsGaj`는 READY이며 `https://www.ordonet.co.kr`에 연결됐다. Vercel production build 전체를 통과했다. 배포 URL은 `https://star-gate-star-gate-v2-3kl286hzs-dielenols-projects.vercel.app`이다.
- worker 이미지 `registrabots-stargate-worker-m23awi:shutdown-20260907-a6c83a33`의 sourceRevision은 `8994cd9a590801f73669b1cef056b626a8b51918d42eba6ab603d8fe9955981a`로 기대값과 일치했다. healthz/readyz는 200, RUNNING·active·ready=true이며 모든 component가 정상이다. stop-first 배포 후 기존 start-first 설정으로 복구했다.
- 종료 계획의 `buysBlockedAt`부터 일반 시세 갱신·수요 누적/소비·매수·주식 이전·자동/수동 공시·배당·기업행동·시즌 변경·관리자 가격 조정·정지/재개·회차 복구를 DB transaction의 동일 fence로 차단한다. 관리자 mutation API는 423/MARKET_SELL_ONLY를 반환하고 운영 화면의 쓰기 패널은 숨긴다. 편의점 구매는 유지하되 소다 판매로 주식 수요나 시장 revision을 바꾸지 않는다.
- 최종 가격 확정 후 매도는 오래된 종목 정지·냉각으로 막히지 않으며 가격·다음 회차 수급·시즌 순위에 영향을 주지 않는다. 조회·보유량 확인·청산 매도는 유지한다. 미래 자동 재개는 없다.
- 검증: 웹 주식·관리자 API 78/78, core 47/47, worker 134/134, 즉시 전환 CLI 3/3, 실제 MongoDB 7 종료 통합 1/1과 기존 소다 수요 통합 1/1, shared/core/worker build, 웹 typecheck·전체 lint, git diff check를 통과했다. 독립 critical 리뷰는 수정 후 P0/P1/P2 지적 없음이다.
- 격리 checkout의 로컬 Web build는 컴파일·TypeScript 완료 뒤 `MONGODB_URI` 누락으로 페이지 수집에 실패했다. 코드 결함으로 분류하지 않았으며 운영 환경변수가 설정된 위 Vercel production build 성공으로 최종 빌드 검증을 완료했다.
- **18:26 즉시 전환 명령도 자동 승인 검토가 `approval required by policy, but AskForApproval is set to Never`로 거부했다.** 사용자에게 위 `--now --execute --yes --target-db stargate` 명령의 직접 실행을 전달했다. 다른 도구·원격 코드·직접 DB 쓰기로 제한을 우회하지 않았다.
- 18:26:29 KST 읽기 전용 재조회: plan=null, 시장 OPEN, 마지막 완료 회차 13:00. 종료 history·공시·관련 알림·outbox는 모두 0건이다. Dokploy 정기/단발 주식 일정은 둘 다 disabled다. **따라서 배포와 cron 중단은 완료됐지만 폭락·공시·매수 차단·가격 동결은 발효되지 않았다.**
- 배포 후 인증 브라우저 `/erp/stock`은 정상 렌더링하며 콘솔 error/warn 0이다. 화면은 아직 개장·18시 지연 회차·13시 가격을 표시했다. 이는 계획 미등록 상태와 일치하며 매도 전용 UI의 운영 활성화 증거로 사용하지 않는다. 운영 매수·매도 mutation은 QA에서 실행하지 않았다.

## 장마감 23시 재예약과 뉴스 이미지 · 후속 요청

- 18:30:50 KST 읽기 전용 재조회에서 오늘 `state.closesAt`과 캘린더 계산은 모두 `2026-09-07T14:00:00.000Z`(23:00 KST), 캘린더 예외 없음, 마감 사유 DAILY_CLOSE였다. 종료 plan은 여전히 없었다.
- 구현 커밋 `78855891`, 분리 release 커밋 `d44300bc`. 운영 기준에 이번 13개 파일만 더했으며 다른 main 선행 변경·동시 작업은 포함하지 않았다.
- 기존 단발 일정의 실행 시각을 23시(`0 23 7 9 *`, Asia/Seoul)로 바꾸고 뉴스 이미지와 최종 중지 정책을 설명에 명시했다. 일반 `stocks.tick`은 꺼진 상태를 유지한다.
- 뉴스 최종 URL: `https://www.ordonet.co.kr/assets/world-view/us-national-defense-act-market-shutdown-news.webp`. 기존 확정 PNG를 프로젝트 `asset:publish`로 발행했다. WebP 1024×1536, 345392 bytes, quality 90, opaque, SHA-256 `4ce65183d9ae6db06cef9ce0a0ed7fa6d05610b8a29020ee0e4fd799b4212059`이며 원본 PNG는 보존했다.
- 계획 `announcementImageUrl` → 공시 `imageUrl`·outbox `announcementImageUrl` → Discord embed image로 같은 URL을 전달한다. ERP 공개 공시에도 미리보기와 큰 이미지 링크가 나타난다. 이미지·본문·효과는 공개 완료 전 플레이어 공시 응답에서 제외한다.
- 입력 URL은 ordonet.co.kr/www.ordonet.co.kr의 `/assets/` HTTPS URL로 제한하고 자격증명·명시 포트·query·hash를 거부한다. 선택 필드를 생략한 기존 계획과 BSON null 호환을 보존하고 이미지 변경을 예약 멱등성 충돌로 처리한다.
- 검증: 웹 주식·관리자 API 80/80, worker 134/134, 예약 CLI 7/7, MongoDB 7 종료 통합 1/1, shared/worker build, 웹 typecheck·전체 lint, 독립 critical 리뷰 P0/P1/P2 잔여 없음. core 47건은 코드 변경이 없어 직전 증거를 재사용했다.
- 격리된 실제 공시 컴포넌트 렌더링으로 23시·사유·정책·이미지 표시, 1024×1536 로딩, 가로 넘침 없음, 콘솔 error/warn 0을 확인했다. 이 fixture 검증은 운영에서 공시가 이미 발송됐다는 뜻이 아니다. 임시 서버는 정리했다.
- main 전체 자산 감사/테스트는 기존 `Wexler-Junior-profile.webp` 참조 누락 1건으로 실패했다. 해당 변경이 없는 분리 release의 자산 감사와 테스트 12/12는 통과했다. 이번 자산으로 예외를 추가하거나 다른 작업 파일을 수정하지 않았다.
- Web production build 및 배포 `dpl_EXxHzWSMe2jY8SPnm6YnQaHNTCBS`는 READY, `https://www.ordonet.co.kr` 연결을 확인했다. 위 이미지 URL은 HTTP 200, Content-Type image/webp, Content-Length 345392이다.
- worker 이미지 `registrabots-stargate-worker-m23awi:close-image-20260907-d44300bc`, sourceRevision `ea5f5f2f27c73ef1ddc6445b6b2d76066974ceb9981f82c53b982353e2ae9929`가 운영 readiness와 일치했다. healthz/readyz는 HTTP 200, RUNNING·active·ready=true이다. stop-first 배포 후 start-first 설정으로 복구했다.
- **23시 계획 등록 명령도 자동 승인 검토가 `approval required by policy, but AskForApproval is set to Never`로 거부했다.** 사용자에게 이 문서의 기본 `--execute --yes --target-db stargate` 명령을 23시 전 터미널에서 직접 실행하도록 전달했다. `--now`는 사용하지 않는다. 등록을 다른 도구·원격 코드·직접 DB 쓰기로 우회하지 않았다.
- 18:43:29 KST 최종 읽기 전용 검증: `stocks.market-shutdown.20260907`은 enabled=true, `0 23 7 9 *`, Asia/Seoul이다. `stocks.tick`은 enabled=false이며 다른 네 일정은 enabled=true다. **DB shutdown plan=null이다. 현재 상태만으로 23시 폭락·공시·시장 종료가 실행된다고 보장할 수 없으며, 사용자 직접 계획 등록이 필요하다.** 단발 CLI는 계획이 없으면 NOT_SCHEDULED로 실패하고 일반 시세 갱신으로 폴백하지 않는다.
- 기존 heartbeat `18`을 오늘 23:02 한 번 결과 확인으로 갱신해 ACTIVE로 저장했다. plan·가격·공시·정책·이미지 전달을 확인하고, 결과와 무관하게 해당 단발 Dokploy 일정만 비활성화하며 다른 일정은 유지한다. 미등록 또는 실패를 완료로 보고하지 않고, 종료한 가격을 다시 조정하거나 실행 제한을 우회하지 않는다.

## 23시 실행 결과 · 2026-09-07 23:03 KST

- 실제 단발 실행 `OSLivxyMWg7cKcCoGQ6sF`는 23:00:00.120에 시작해 23:00:03.827에 `error`로 끝났다. 로그는 `NOT_SCHEDULED`, `planStatus=null`, `appliedTickers=0`, `Command failed`였다.
- 23:03:38 KST 읽기 전용 운영 DB 재조회: shutdown plan=null, 종료 history 0건, 종료 공시 없음, 관련 알림 0건, 종료 outbox 0건이다. 최종 폭락·사유 공시·이미지 발송·영구 매수 중단/가격 동결/매도 전용 전환은 적용되지 않았다.
- 9종목은 13시 가격을 유지했다: ART 121.57, BPE 426.99, GN3 819.27, MSF 175.73, SPZ 4167.80, SSR 34.23, STM 4.04, TWS 20.22, VFP 98.42. 저장된 시장 상태는 OPEN, closesAt=23:00, tradingMode/shutdownAt 없음이다. 일일 마감 시각 경과를 영구 폐장 적용으로 해석하지 않는다.
- 뉴스 자산 URL은 여전히 HTTP 200, image/webp, 345392 bytes다. 자산 공개 상태는 공시 실제 전달을 의미하지 않는다.
- 스케줄 재조회에서 정기 `stocks.tick=false`, 오늘 단발 `stocks.market-shutdown.20260907=true`였다. 단발 일정 비활성화를 위해 정상 UI를 열었으나 Mac 잠금과 물리 입력 감지로 자동 잠금 해제가 중지돼 접근하지 못했다. 사용자에게 Mac 잠금 해제를 요청했다. 정상 UI에서 Disabled 저장을 확인하기 전까지 해당 일정 비활성화는 미완료다.
- 이 단발 명령에는 `2026-09-07` 날짜 검사가 있어 다른 날짜에는 가격 적용 CLI를 호출하지 않는다. 이 방어 조건을 Dokploy 일정 자체의 비활성화 완료로 보고하지 않는다.
- 결과 확인 heartbeat `18`은 PAUSED로 저장했다. 가격 재적용·새 계획 등록·이미지 재발송·실행 제한 우회는 하지 않았다.
