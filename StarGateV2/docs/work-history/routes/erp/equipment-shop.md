# `/erp/equipment-shop` 작업 이력

## 2026-07-30 · 버그 수정 · NPC 대사 HUD 상시 표시

- 병기부 허브와 연구소·토와스키·아케론·전략 보급소·공방에서 대사 완료 후 HUD가 자동 축소되던 동작을 제거했다.
- 데스크톱·모바일의 운영 잠금 컨트롤을 HUD 위로 이동하고, 기존 하단 안전 여백으로 가려진 조작 UI를 끝까지 스크롤해 접근할 수 있음을 확인했다.
- 검증: `pnpm lint`, focused ESLint, `git diff --check`, 인증 브라우저 1280×720·390×844 전 구역 확인(가로 넘침·고정 UI 충돌·콘솔 오류 없음)
- 관련 커밋: `7ea4903`
- 후속 작업: 전체 `pnpm typecheck`는 별도 작업 중인 `equipment-shop/simulator/EquipmentSimulatorClient.tsx`의 null 가능성 오류로 차단됨
