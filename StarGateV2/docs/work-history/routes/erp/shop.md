# `/erp/shop` 작업 이력

## 2026-07-30 · 버그 수정 · 띠아 대사 HUD 상시 표시

- 편의점 영업 종료 상태에서도 간략 폐점 안내 대신 띠아의 전체 대사 HUD와 표정을 유지하도록 통일했다.
- 데스크톱·모바일의 운영 잠금 컨트롤을 HUD 위로 이동해 대사창과 겹치지 않도록 했다.
- 검증: `pnpm lint`, focused ESLint, `git diff --check`, 인증 브라우저 1280×720·390×844 확인(가로 넘침·고정 UI 충돌·콘솔 오류 없음)
- 관련 커밋: `7ea4903`
- 후속 작업: 전체 `pnpm typecheck`는 별도 작업 중인 `equipment-shop/simulator/EquipmentSimulatorClient.tsx`의 null 가능성 오류로 차단됨
