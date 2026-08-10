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
