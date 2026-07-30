# `/erp/shop` 작업 이력

## 2026-07-30 · 버그 수정 · 띠아 대사 HUD 상시 표시

- 편의점 영업 종료 상태에서도 간략 폐점 안내 대신 띠아의 전체 대사 HUD와 표정을 유지하도록 통일했다.
- 데스크톱·모바일의 운영 잠금 컨트롤을 HUD 위로 이동해 대사창과 겹치지 않도록 했다.
- 검증: `pnpm lint`, focused ESLint, `git diff --check`, 인증 브라우저 1280×720·390×844 확인(가로 넘침·고정 UI 충돌·콘솔 오류 없음)
- 관련 커밋: `7ea4903`
- 후속 작업: 전체 `pnpm typecheck`는 별도 작업 중인 `equipment-shop/simulator/EquipmentSimulatorClient.tsx`의 null 가능성 오류로 차단됨

## 2026-07-30 · 기능 추가 · 띠아 신제품 웹훅

- 신제품 출시 알림을 편의점 전용 Discord 웹훅으로 전달하고, 띠아가 상품명·분류·가격·효과와 편의점 링크를 안내하도록 추가했다.
- 사용자 입력 문구의 Discord 멘션을 무력화하고, 외부 전송 실패는 상품 출시와 분리된 outbox 재시도 대상으로 처리했다.
- 검증: 집중 테스트 14개, worker 전체 테스트 38개, `pnpm typecheck`, 대상 ESLint, `pnpm build`, `git diff --check`
- 관련 커밋: `068e443`
- 후속 작업: 운영 worker의 `WORKER_OUTBOX_KINDS` opt-in 전환 전에는 알림이 `PENDING`으로만 적재된다.

## 2026-07-30 · 기능 개선 · 띠아 신제품 이미지·대사

- 신제품 공지에 등록된 상품 이미지를 크게 표시하고, 이미지가 없거나 안전하지 않은 경로면 공지를 실패시키지 않고 이미지 없이 발송하도록 했다.
- 띠아가 신제품을 직접 소개하고 권하는 말투로 출시 대사를 보강했다.
- 검증: 웹 계약 테스트 7개, worker 전체 테스트 39개, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`
- 관련 커밋: `54631c1`
