# /erp/admin

## 2026-08-09 · 기능 추가 · Discord 연동 운영 현황

- 준비 중이던 관리자 홈을 worker heartbeat, outbox 대기·재시도·DEAD, desired-state revision 지연, AMERI 공방 DM과 REGISTRAR 표결 게시 상태를 한 화면에서 보는 GM 전용 운영 현황으로 전환했다.
- payload, dedupe key, 사용자·메시지 ID, webhook·bot secret, 원본 오류를 DTO에서 제외하고 오류는 제한된 분류만 표시한다. 화면은 30초 고정 polling으로 갱신한다.
- 검증: 웹 `typecheck`·`lint`·production build, 관리자 상태 계약 테스트, worker 62건, shared-db 계약 테스트, 인증 브라우저 1280×720·390×844에서 가로 넘침·콘솔 오류 없음, critical risk review
- 관련 커밋: `45944a0c`
- 운영 경계: 이 화면과 검증에서는 outbox 재시도·skip·DB 수정·Discord 발송을 실행하지 않았다.
