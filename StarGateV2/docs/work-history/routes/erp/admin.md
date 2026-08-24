# /erp/admin

## 2026-08-09 · 기능 추가 · Discord 연동 운영 현황

- 준비 중이던 관리자 홈을 worker heartbeat, outbox 대기·재시도·DEAD, desired-state revision 지연, AMERI 공방 DM과 REGISTRAR 표결 게시 상태를 한 화면에서 보는 GM 전용 운영 현황으로 전환했다.
- payload, dedupe key, 사용자·메시지 ID, webhook·bot secret, 원본 오류를 DTO에서 제외하고 오류는 제한된 분류만 표시한다. 화면은 30초 고정 polling으로 갱신한다.
- 검증: 웹 `typecheck`·`lint`·production build, 관리자 상태 계약 테스트, worker 62건, shared-db 계약 테스트, 인증 브라우저 1280×720·390×844에서 가로 넘침·콘솔 오류 없음, critical risk review
- 관련 커밋: `45944a0c`
- 운영 경계: 이 화면과 검증에서는 outbox 재시도·skip·DB 수정·Discord 발송을 실행하지 않았다.

## 2026-08-10 · 안정성 개선 · 실제 전달 결과와 consumer 누락 감시

- 관리자 현황에서 처리 완료를 실제 Discord 발송, 정책상 생략, 구형 미분류로 나누고 worker 실행 모드와 기대 consumer 대비 누락 목록을 표시한다.
- production active worker는 공방 DM·연구·편의점·주식 consumer가 하나라도 빠지면 기동을 거부하며, 운영 경보의 장애 상태와 cooldown을 MongoDB에 보존한다.
- workflow와 운영 경보는 서로 다른 전용 webhook만 사용하고, 상태 단계는 기본 이모지와 한국어 라벨로 표시한다.
- 검증: 웹 `typecheck`·전체 `lint`, 관리자 계약 포함 집중 테스트 41건, worker 71건, Registra 23건, shared-db build·typecheck, 엄격 코드 리뷰
- 관련 커밋: `62c0b969`
- 잔여 확인: Mongo 통합 테스트 10건은 `MONGODB_TEST_URI` 부재로 skip됐고, 인증 브라우저 확인은 `localhost:3000`의 다른 개발 서버 점유로 실행하지 못했다.
- 운영 경계: 라이브 배포·환경변수 변경·DB 보정·Discord 발송은 실행하지 않았다.

## 2026-08-10 · UI 개선 · 운영 현황 정보 위계 정돈

- 연동 상태 설명과 지표별 의미를 보강하고, 정상·대기·장애·구형 기록을 색과 숫자 위계로 빠르게 구분하도록 요약 카드를 정돈했다.
- worker heartbeat를 압축된 상태 패널로 바꾸고, outbox 표에 숫자 정렬·0값 약화·장애 강조·고정 헤더와 첫 열을 적용해 긴 목록의 탐색성을 높였다.
- 넓은 화면은 균형 잡힌 5+4 카드 배치, 태블릿은 3열, 모바일은 2열과 표 내부 가로 스크롤을 사용하도록 반응형 구성을 다듬었다.
- 검증: `pnpm typecheck`, `pnpm lint`, 인증 브라우저 1600×900·1024×768·390×844에서 문서 가로 넘침 및 콘솔 경고·오류 없음
- 관련 커밋: `7af34fca`
- 운영 경계: 화면 조회만 수행했으며 재전송·상태 변경·DB 수정·Discord 발송은 실행하지 않았다.

## 2026-08-10 · 접근성 개선 · UI 코드 리뷰 보완

- Worker 상태 패널의 배경 강조를 실제 health에 맞추고, 작은 라벨·표 헤더·0값의 명암 대비를 읽을 수 있는 수준으로 높였다.
- 주요 구간을 의미 있는 heading과 region으로 연결하고, outbox 표에 포커스 링과 좌우 방향키 스크롤을 추가해 키보드만으로도 긴 표를 탐색할 수 있게 했다.
- KPI 배치의 특정 카드 순서 의존성을 제거하고, 숫자·날짜 formatter를 재사용하도록 정리했으며 접근성 계약 테스트를 추가했다.
- 검증: 관리자 계약 테스트 3건, `pnpm typecheck`, `pnpm lint`, 인증 브라우저 1600×900·1024×768·390×844에서 반응형 배치·방향키 스크롤·콘솔 오류 없음
- 관련 커밋: `a67c8956`
- 운영 경계: 읽기 전용 화면 검증만 수행했으며 라이브 상태 변경이나 Discord 발송은 실행하지 않았다.

## 2026-08-22 · 기능 확장 · 연구 공로 연동 상태

- 관리자 연동 현황에 `research.daily-ranking` 예약 작업과 `research-ranking` desired-state consumer, 연구 공로 일일 카드 revision 지연 상태를 추가했다.
- 공개 화면과 마찬가지로 webhook URL, Discord message ID, payload와 원본 오류는 관리자 DTO에 노출하지 않는다.
- 검증: 관리자 연동 계약 테스트 포함 웹 집중 테스트 22건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `9b2b7897`
- 운영 경계: worker consumer 활성화, 카드 재전송, DB 보정과 Discord 발송은 실행하지 않았다.

## 2026-08-22 · 안정성 개선 · 연구 공지 불명확 전달 감시

- 연구 공로 카드의 `DELIVERY_UNKNOWN` 격리를 일반 지연과 구분해 즉시 CRITICAL로 표시하고, worker 운영 경보와 관리자 연동 현황이 같은 장애 판정을 사용하도록 맞췄다.
- 관리자 응답에는 격리 revision, Discord message ID, webhook 정보와 오류 원문을 추가하지 않고 제한된 `UNKNOWN` 분류와 집계만 노출한다.
- 검증: 관리자 연동 계약·worker health 집중 테스트, `pnpm test:worker` core 35건·worker 128건, `pnpm typecheck`, `pnpm lint`, critical risk review
- 관련 커밋: `a9037103`
- 운영 경계: 관리자 화면과 테스트에서 reconciliation, DB 수정, Discord 조회·발송을 실행하지 않았다.

## 2026-08-24 · 운영성 개선 · 연구 공로 예약 슬롯 누락 감시

- `research.daily-ranking`의 최신 성공 기록이 오래 남아 있어도 매일 21:15 KST 이후 당일 슬롯이 없으면 `WARNING`으로 표시하도록 cadence 감시를 추가했다.
- 예약 작업 카드에는 기대한 KST 날짜와 슬롯 누락 사유를 함께 표시하며, 기존 webhook·message ID·payload·오류 원문 비노출 계약은 유지한다.
- 검증: 관리자 연동 계약 4건, `pnpm test:worker` core 36건·worker 130건, `pnpm build:worker`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `3123e61d`
- 운영 경계: 화면 조회와 로컬 테스트만 수행했으며 worker 배포·Dokploy 일정·DB 수정·Discord 발송은 실행하지 않았다.
