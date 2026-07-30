# `/erp/admin/catalog` 작업 이력

## 2026-07-30 · 기능 추가

- GM이 편의점 또는 병기부 존을 선택해 신규 마스터 품목을 등록하는 운영 화면을 추가했다.
- 편의점 품목은 등록 즉시 카탈로그·구매·소비·재고·발주·일일 입고 공지에 반영하고, 병기부 품목은 존별 분류 태그를 서버에서 부여하도록 했다.
- 운영 품목 생성에 GM 권한, 가격·재고·이미지 경로·태그 검증, 중복 slug 차단과 품목·감사 outbox 원자적 저장을 적용했다.
- 검증: 집중 테스트 29개, core·worker 전체 테스트 44개, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`
- 브라우저 확인: 인증된 데스크톱 화면과 390×844 모바일 viewport에서 폼 전환·전략 장비 카테고리 제한·가로 넘침 없음·콘솔 오류 없음을 확인
- 관련 커밋: `3c62786`
- 후속 작업: 실제 Mongo 트랜잭션과 Discord 다중 메시지 전송은 테스트 환경 통합 검증이 필요

## 2026-07-30 · UI 수정 · 공용 드롭다운 적용

- 판매처·병기부 존·카테고리·페이지 그룹을 네이티브 `Select` 래퍼에서 운영 화면 공용 `DropdownSelect`로 교체했다.
- 공용 드롭다운에 선택적 `id`를 추가해 기존 필드 label과의 접근성 연결을 유지했다.
- 검증: `pnpm typecheck`, `pnpm lint`, `git diff --check`
- 브라우저 확인: 네이티브 `<select>` 0개, 공용 listbox 렌더링, 마우스 선택과 `End`·`Enter` 키보드 선택, 전략 장비 선택 시 특수 카테고리 전환, 콘솔 오류·가로 넘침 없음
- 관련 커밋: `4883481`

## 2026-07-30 · 기능 추가 · 편의점 신제품 출시 알림

- 공개·판매 가능한 편의점 신제품을 등록하면 상품·GM 감사 기록과 띠아 출시 알림 outbox를 같은 트랜잭션으로 저장하도록 연결했다.
- 실제 생성된 상품 ID를 알림 dedupe 기준으로 사용해 요청 재시도는 중복 적재하지 않고, 삭제 후 같은 slug로 재출시하는 상품은 새 알림을 만들 수 있게 했다.
- 검증: 집중 테스트 14개, worker 전체 테스트 38개, `pnpm typecheck`, 대상 ESLint, `pnpm build`, `git diff --check`
- 관련 커밋: `068e443`
- 후속 작업: 운영 worker의 `WORKER_OUTBOX_KINDS`에 `SHOP_PRODUCT_LAUNCH_WEBHOOK`을 추가한 뒤 실제 Mongo 트랜잭션 재시도·Discord 수신을 staging에서 확인해야 한다.

## 2026-07-30 · 기능 개선 · 신제품 웹훅 이미지

- 신제품에 등록된 `previewImage`를 출시 outbox에 포함해 Discord 공지 카드에서도 상품 이미지를 표시하도록 확장했다.
- 검증: 웹 계약 테스트 7개, worker 전체 테스트 39개, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`
- 관련 커밋: `54631c1`
