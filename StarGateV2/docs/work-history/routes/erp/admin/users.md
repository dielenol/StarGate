# /erp/admin/users

## 2026-08-09 · 안정성 개선 · 계정 변경 감사 원자성

- 역할·상태·삭제·Discord 해제·비밀번호 초기화가 대상과 현재 GM actor를 transaction 안에서 다시 확인하고, 실제 변경과 Discord 감사 outbox를 함께 확정하도록 보강했다.
- active GM이 동시에 줄어 0명이 되는 write-skew를 공용 invariant lock으로 직렬화하고, 대상이 사라진 0건 update를 성공으로 응답하지 않도록 했다.
- 검증: 웹 `typecheck`·`lint`·production build, shared-db 타입체크, critical risk review
- 관련 커밋: `45944a0c`
- 후속 작업: 응답 유실 시 평문 임시 비밀번호를 안전하게 복구하는 1회용 reset-token 흐름은 별도 설계가 필요하다.
- 운영 경계: 라이브 계정 생성·변경·초기화·삭제는 실행하지 않았다.
