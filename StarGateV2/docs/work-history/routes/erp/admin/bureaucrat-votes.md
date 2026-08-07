# `/erp/admin/bureaucrat-votes` 작업 이력

## 2026-08-07 · 기능 추가

- GM이 확정된 CENSOR-3 배치 제작 승인 안건을 미리 확인하고, 확인 절차를 거쳐 REGISTRAR 게시 원장에 멱등 등재할 수 있게 했다.
- 진행 중인 같은 고정 안건의 중복 등재를 막고 Discord 게시 상태·찬반 집계·자동 마감 시각·최종 판정을 최근 원장에서 확인할 수 있게 했다.
- 가결은 제작 권한만 기록하며 재료 차감·제작 착수·완성품 지급은 공방 운영 절차와 분리했다.
- 검증: 웹 typecheck·lint·production build, 관련 계약 테스트 58개, 공유 seed 스키마 테스트 13개, Registra 테스트 23개·build, 인증된 `localhost:3000` 데스크톱 및 390×844 화면 확인
- 관련 커밋: `3fd54ce2`
- 후속 작업: 라이브 활성화 전 `bureaucrat_votes` 인덱스 적용과 웹·REGISTRAR 배포가 필요하다.
