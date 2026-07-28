# /erp/equipment-shop/lab

## 2026-07-23 · 운영 안정화 · 연구 현황 카드

- 팀 연구 기여와 가속 내역을 연구별 단일 Discord 카드로 집계하도록 변경했다.
- 성공한 mutation의 post-commit 단계에서만 카드를 교체하고, 오래되거나 중단된 카드 ID를 웹훅으로 정리하도록 안정화했다.
- 검증: revision·lease 동시성, 전송 실패 복구, route 실행 경계와 webhook 교체 테스트를 보강했다.
- 관련 커밋: `6bff9f4`, `7ad99a3`, `2641861`, `a0acccf`
