# ERP 도트풍 타이포그래피 리밸런싱 플랜

## 목표

ERP 전체의 군사 단말기 톤은 유지하되, 상점/인벤토리/증권/알림처럼 게임 UI 성격이 강한 화면부터 `PokemonDPPT` 도트폰트를 확장 적용한다. 긴 본문, 관리자 테이블, 입력 중심 화면은 가독성과 작업 효율을 우선해 전면 적용 대상에서 제외한다.

## 원칙

- 전역 `--font-body`는 바꾸지 않는다.
- 도트폰트는 `--font-pixel` 토큰으로만 참조한다.
- 페이지 opt-in 스코프에서 `--font-mono`를 `--font-pixel`로 재바인딩한다.
- `data-pixel-font="ui"`는 라벨, 숫자, 배지, 탭, 버튼처럼 이미 `var(--font-mono)`를 쓰는 UI 요소만 바꾼다.
- `data-pixel-font="full"`은 상점처럼 화면 전체가 게임 UI일 때만 사용한다.
- 위키 본문, 보고서 본문, 긴 설명문, 입력값, textarea는 기본 본문 폰트를 유지한다.
- ERP 14px floor 정책을 유지한다.

## 적용 단계

### 0단계: 토큰/스코프 기반 구축

- `app/globals.css`에 `--font-pixel`을 추가한다.
- `[data-pixel-font="ui"]`와 `[data-pixel-font="full"]` opt-in 스코프를 추가한다.
- 기존 편의점의 직접 폰트 선언은 공통 토큰 참조로 정리한다.

### 1단계: 게임 UI 강한 화면 적용

대상:

- `/erp/shop`
- `/erp/equipment-shop`
- `/erp/inventory`
- `/erp/inventory/[characterId]`
- `/erp/stock`
- `/erp/stock/[ticker]`
- `/erp/stock/portfolio`
- `/erp/notifications`
- `/erp/admin/dialogue-beep`

적용 기준:

- 상점은 `data-pixel-font="full"`로 전체 UI를 도트화한다.
- 나머지는 `data-pixel-font="ui"`로 메타/숫자/탭/버튼 중심만 도트화한다.

### 2단계: 테마/허브 화면 적용

대상:

- `/erp`
- `/erp/missions`
- `/erp/chronicle`
- `/erp/gallery`
- `/erp/hall-of-fame`

적용 기준:

- 대시보드는 수치, D-Day, 액션 큐, 신호 스트립 중심으로 도트 톤을 강화한다.
- 준비중 테마 페이지는 제목/힌트/태그만 도트 톤을 강화한다.

### 3단계: 하이브리드 검토 대상

대상:

- `/erp/sessions`
- `/erp/sessions/report`
- `/erp/sessions/report/[id]`
- `/erp/factions`
- `/erp/factions/[code]`
- `/erp/personnel`
- `/erp/personnel/[id]`
- `/erp/characters`
- `/erp/characters/[id]`
- `/erp/credits`

적용 기준:

- 표/스탯/등급/메타는 도트화한다.
- 보고서 문장, 인물 설명, 긴 세계관 텍스트, 편집 폼은 본문 폰트를 유지한다.
- 페이지별 스크린샷 확인 후 적용한다.

### 4단계: 기본 제외 대상

대상:

- `/erp/wiki`
- `/erp/wiki/[id]`
- `/erp/wiki/[id]/edit`
- `/erp/wiki/new`
- `/erp/wiki/catalog`
- `/erp/wiki/catalog/[category]`
- `/erp/wiki/catalog/item/[key]`
- `/erp/admin/users`
- `/erp/admin/credits`
- `/erp/admin/stocks`
- `/erp/admin/inventory`
- `/erp/admin/characters/import`
- `/erp/account`
- `/erp/characters/new`
- 공개 사이트 `/apply`, `/contact`, `/rules`, `/gameplay`, `/world/**`

적용 기준:

- 긴 읽기/작성/운영 작업은 일반 본문 폰트를 우선한다.
- 필요하면 개별 제목, 배지, 코드값에만 별도 검토한다.

## 검증 절차

1. `pnpm lint`
2. `pnpm typecheck`
3. 데스크톱/모바일에서 1단계 주요 화면 시각 확인
4. 텍스트 overflow, 버튼 높이 변화, 입력창 가독성 확인
5. 위키/관리자/폼 제외 페이지에 의도치 않은 전면 도트화가 없는지 확인

## 현재 진행 상태

- [x] 0단계: 토큰/스코프 기반 구축
- [x] 1단계: 게임 UI 강한 화면 적용
- [x] 2단계: 테마/허브 화면 적용
- [x] 3단계: 하이브리드 검토 대상
- [x] 4단계: 제외 대상 유지 확인
