---
title: 로어북
updated: 2026-04-22
---

# StarGate 로어북

StarGate 세계관의 **배경 자료집**. Claude(메인 세션)가 NPC / Faction / Institution 문서를 작성할 때 자동 참조하는 독립된 산문 모음이다.

- **Claude가 `/create-lore` 실행 시 이 폴더를 전체 Read해서 배경 컨텍스트로 사용**한다. 사용자는 추가로 명령하지 않아도 된다.
- **Zod 검증 없음 — 자유 산문.** 규격 강제보다 일관성과 가독성이 우선. 규격 문서가 필요하면 `StarGateV2/docs/spec/` 를 사용한다.
- **웹앱/봇은 이 폴더를 참조하지 않는다.** 런타임 의존 없는 독립 자료집이며, 홍보 사이트나 ERP UI에 직접 렌더링되지 않는다.

## 폴더 구조

```
docs/lore/
├── README.md               # 이 문서
├── history/                # 역사적 사건, 시기별 서사
├── ideology/               # 이념, 사조, 세계관 원리
├── concept/                # 개념, 용어, 현상 정의
├── faction/                # 세력 스켈레톤 (세부는 롱폼 추가 예정)
└── place/                  # 장소, 지리 (현재 비어있음)
```

## 현재 문서 인덱스

### history/

- [제2차 세계대전과 오컬트](history/ww2-occult.md)
- [노부스 오르도 창설](history/novus-ordo-founding.md)
- [질서의 균열](history/order-cracks.md)
- [오로라 바이러스 (2021)](history/aurora-virus-2021.md)
- [오늘의 기로](history/crossroads.md)

### ideology/

- [변칙적 현실주의](ideology/anomalous-realism.md)

### concept/

- [이상 현상 (Anomaly)](concept/anomaly.md)
- [광원화 (Light-sourcing)](concept/light-sourcing.md)

### faction/

- [군부 (Military)](faction/military.md) — 스켈레톤
- [세계 이사회 (World Council)](faction/world-council.md) — 스켈레톤
- [시민사회 (Civil Society)](faction/civil.md) — 스켈레톤

### place/

(비어있음)

## 문서 추가 방법

두 가지 경로 중 편한 쪽을 사용한다.

### 1. `/create-lore lore` skill 호출

Claude에게 `/create-lore lore` (또는 `/create-lore lore <category>`) 로 요청한다. 카테고리·제목·slug·본문을 대화형으로 입력하면 skill이 frontmatter 포함 MD 파일을 해당 카테고리 폴더에 저장한다. Zod 검증이나 FK 매칭은 없으며, 파일 쓰기 직전 미리보기·승인 게이트만 작동한다.

### 2. 직접 편집

에디터로 해당 카테고리 폴더에 kebab-case 파일명의 MD 파일을 직접 추가한다. 기존 파일들의 frontmatter / 섹션 구조를 참고해 일관성을 유지한다.

## 파일명 규칙

- **kebab-case.md** (예: `aurora-virus-2021.md`, `anomalous-realism.md`)
- 한국어 제목이라도 파일명은 영문 / 숫자 / 하이픈으로 표기
- 연도가 의미 있으면 파일명에 포함 가능 (`aurora-virus-2021.md`)

## Frontmatter 권장 필드

YAML 블록에 다음 필드를 기본으로 둔다 (일관성용 권장이며 하드 제약은 아님):

| 필드 | 설명 |
|------|------|
| `title` | 한국어 제목 (+필요 시 영문 병기) |
| `category` | `history` / `ideology` / `concept` / `faction` / `place` 중 하나 |
| `tags` | 자유 문자열 배열 (optional) |
| `updated` | 마지막 수정일 (ISO, `YYYY-MM-DD`) |
| `source` | 출처 표기 (예: `world-page-timeline`, `create-lore`, `manual`) |

세력 문서(`faction/`)는 `code` 필드(`MILITARY` / `COUNCIL` / `CIVIL` 등) 를 추가로 둔다.

## 문서 구성 관례

각 MD는 아래 뼈대를 따르되, 내용 특성에 맞게 조정한다:

1. `## 요약` 또는 `## 정의` — 1~3문장
2. `## 본문` — 실제 서술
3. `## 관련 항목` — 이 문서에서 언급한 다른 로어 문서로의 상대경로 링크

## 제약

- 이 폴더는 **lore 도메인 작성 시에만 Write** 된다. NPC / Faction / Institution 작성은 `StarGateV2/docs/spec/` 에 저장된다.
- 커밋은 사용자 몫. skill은 파일 생성만 수행한다.
- README의 인덱스는 **자동 갱신되지 않는다.** 새 문서를 추가한 사람이 직접 링크를 보충한다.
