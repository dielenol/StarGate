# 세계관 문서 규격 (docs/spec)

StarGate 세계관 자산은 **핵심 도메인**(NPC / Faction / Institution / Equipment / Consumable)과 **범용 카탈로그 항목**으로 정규화된다. 각 문서는 MD 파일(frontmatter + body 섹션)로 작성되며, Zod 스키마 검증을 거쳐 MongoDB에 적재된다.

## Quickstart — 3가지 방식

새 세계관 자산(NPC/세력/기관/장비/소모품/카탈로그 항목)을 추가하는 3가지 루트:

1. **대화형 작성 (권장)** — Codex에서 `$stargate-lore`를 지정하거나 원하는 도메인을 자연어로 요청한다. 질문에 답하며 근거와 필드를 채우고 Zod schema + adapter 검증을 거친다. 산출물: MD 파일 + 검증 리포트 + 필요 시 payload JSON. `/create-lore ...`는 과거 호출 형식을 위한 legacy alias다.
2. **템플릿 직접 편집** — `docs/spec/templates/{domain}.template.md` 복사해서 `docs/spec/{domain}/{slug}.md` 로 저장. 필드 규칙은 아래 "frontmatter 필드 요약" 참조.
3. **Discord 텍스트 파싱 (AGENT 전용)** — 관리자 "AGENT 인입" 페이지. NPC/Faction/Institution/Equipment/Consumable은 대상 아님 (플레이어블 AGENT만).

## 도메인

| 도메인 | 대상 | 저장 경로 | 컬렉션 |
|--------|------|-----------|--------|
| **npc** | 세계관 등장인물 (플레이어블 아닌 NPC) | `docs/spec/npc/{slug}.md` | `characters` (type=NPC) |
| **faction** | 권력 블록 (외부 3대: 군부/이사회/시민사회 + 본부: 노부스 오르도) | `docs/spec/faction/{slug}.md` | `factions` |
| **institution** | 기관 (노부스 오르도 본부 직속 내부 기관. 사무국/현장 등) | `docs/spec/institution/{slug}.md` | `institutions` |
| **equipment** | 장비 (무기/방어구) | `docs/spec/equipment/{slug}.md` | `master_items` (category=`WEAPON`\|`ARMOR`) |
| **consumable** | 소모품 (포션·아이템 등) | `docs/spec/consumable/{slug}.md` | `master_items` (category=`CONSUMABLE`) |
| **catalog** | 범용 카탈로그 항목 (샘플·특수·비표준 물증) | `docs/spec/catalog/{slug}.md` | `master_items` (category=`MATERIAL`\|`SPECIAL` 등) |

> equipment / consumable / catalog는 **별도 컬렉션이 아니라** 기존 `master_items`를 재활용한다. `ItemCategory` enum(`WEAPON`/`ARMOR`/`CONSUMABLE`/`MATERIAL`/`SPECIAL`)으로 구분하며, SSOT는 `packages/shared-db/src/types/inventory.ts`의 `ITEM_CATEGORIES` const tuple.

## ERP 위키 category 분류

`docs/spec/*` 도메인은 DB 적재와 Zod 검증을 위한 작성 단위이고, `wiki_pages.category`는 ERP 위키의 탐색 탭/정렬/태그 톤을 위한 표시 분류다. 신규 위키 문서는 아래 현행 분류 중 하나를 사용한다.

| category | 사용 기준 |
|----------|-----------|
| `작전 보고서` | 정규·미니 세션 보고서 위키 미러 |
| `개체` | ZULU 외 일반 변칙 개체 또는 개체성 문서 |
| `줄루` | ZULU 번호가 부여된 격리 개체와 ZULU 계열 개체 문서 |
| `개념` | 세계관 개념, 프로젝트, 비물질적 현상 |
| `세력` | 권력 블록과 주요 외부 세력 |
| `기관` | 노부스 오르도 산하 기관 또는 독립 기관 |
| `장소` | 도시, 시설, 현장 위치 |
| `규정` | 사내 규정, 절차성 정책, 프로토콜 |
| `인물` | 인물 중심 위키 문서 |
| `장비` | 장비 또는 장비성 카탈로그 항목 |
| `물품` | 연구 샘플, 비표준 물증, 문헌성 물체처럼 별도 위키 탭이 필요한 물품 |
| `소모품` | 소비성 카탈로그 항목 |
| `문헌` | 문서, 기록물, 텍스트 자체가 주제인 항목 |

현재 분류·정렬 SSOT는 `docs/spec/wiki-categories.json`이다. `lib/wiki-categories.ts`가 이를 타입스크립트 소비자로 노출하고, 위키 표시·관련 문서 정렬·static lore 감사가 같은 순서를 사용한다. `줄루`와 `물품`은 기존 seed와 ERP UI에서 이미 쓰는 현행 분류이므로, 감사 기준에서도 예외가 아니라 정식 category로 취급한다.

2026-08-05 read-only DB 확인에서 52개 `wiki_pages`의 distinct category는 `개념`, `개체`, `규정`, `기관`, `물품`, `세력`, `작전 보고서`, `장비`, `장소`, `줄루`였으며 현행 controlled set 밖의 값은 없었다. 이는 날짜가 명시된 snapshot이며 이후 변경 시 static payload audit와 live distinct 조회를 함께 다시 수행한다.

## 템플릿

신규 문서 작성 시 아래 템플릿을 복사해 `{slug}.md` 파일명으로 저장한다.

- NPC: `docs/spec/templates/npc.template.md`
- Faction: `docs/spec/templates/faction.template.md`
- Institution: `docs/spec/templates/institution.template.md`
- Equipment: `docs/spec/templates/equipment.template.md`
- Consumable: `docs/spec/templates/consumable.template.md`
- Catalog: `docs/spec/templates/catalog.template.md`
- 예시: `docs/spec/templates/examples/npc-registrar.example.md`

## 대화형 생성 — stargate-lore

대화형으로 템플릿을 채우고 검증까지 한 번에 수행한다.

```
$stargate-lore NPC 문서를 작성해 줘
$stargate-lore faction 문서를 작성해 줘
$stargate-lore institution 문서를 작성해 줘
$stargate-lore equipment/consumable/catalog 문서를 작성해 줘
```

도메인이 불명확하면 결과 구조가 달라지는 지점만 한 번 확인한다. 산출물은 **MD 파일 + 검증 리포트**, 그리고 실제 적재 또는 handoff가 필요한 경우에만 **DB payload JSON**을 포함한다. 작성 요청은 파일·dry-run까지의 권한이며 live DB 쓰기 권한은 아니다.

## frontmatter 필드 요약

### NPC (`packages/shared-db/src/schemas/npc.schema.ts`)

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| `codename` | UPPER_SNAKE | ✓ | 유일 식별자 |
| `slug` | kebab-case | | 생략 시 codename 변환 |
| `type` | `"NPC"` | ✓ | 고정값 |
| `role` | string ≤100 | ✓ | 한 줄 역할 요약 |
| `nameKo` | string | ✓ | 한국어 이름 |
| `nameNative` | string | | 원어 표기 (한자/일본어 등) |
| `nickname` | string | | 짧은 별칭/통칭 |
| `nameEn` | string | | 영문 이름 |
| `gender` / `age` / `height` / `weight` | string | | 자유 문자열. weight 는 lore 영역(신상) 분류 |
| `factionCode` | UPPER_SNAKE | | 소속 세력 |
| `institutionCode` | UPPER_SNAKE | | 소속 기관 |
| `department` | string | | 부서 |
| `agentLevel` | enum | | `"V" \| "A" \| "M" \| "H" \| "G" \| "J" \| "U"` 중 하나 (CharacterBase와 공유되는 AGENT 레벨) |
| `isPublic` | boolean | ✓ | 공개 노출 여부 |
| `loreTags` | string[] | | 자유 태그 |
| `appearsInEvents` | string[] | | 등장 이벤트 |
| `source` | enum | | `manual` / `discord` / `legacy-json` / `session-log` / `session-reward` / `containment-archive`; `create-lore`는 기존 문서 호환 값 |
| `previewImage` | url | | |
| `pixelCharacterImage` | string | | 도트/픽셀 스타일 대표 이미지 URL (자유 문자열, URL 권장) |
| `posterImage` | string | | 캐릭터 상세 히어로 와이드 이미지. lore sub-document 하위(`lore.posterImage`) 로 적재 |
| `warningVideo` | string | | 경고/틀징 영상 URL (자유 문자열, URL 권장) |

**body 섹션**: `## 대사` / `## 외형` / `## 성격` / `## 배경` / `## 역할 상세` / `## 이름 설명`

세션 동기화에서 확인된 성격 근거는 단일 `## 성격` 문단에 덮어쓰지 않는다. `lore.personalityObservations[]`에 불변 관찰 ID, `sessionId`, 성향 라벨, 편집 요약, `dialogue | description | action` 근거, 출처, 신뢰도를 누적한다. 이 구조 배열은 평탄 frontmatter나 일반 캐릭터 PATCH가 아니라 세션별 durable seed payload에서 관리한다. 기존 Dossier에는 관찰 하나당 별도 envelope의 단일 `$addToSet`만 허용되며, 사건·관계·메타 갱신은 다른 envelope로 분리한다. ID는 대소문자를 구분하지 않는 불변 키다. 동일 ID·동일 내용 재실행은 no-op, 동일 ID·다른 내용은 충돌로 중단한다. `candidate`는 검토 ledger에만 남기고 live 배열에는 `confirmed | testimony`만 적재한다. 최초 배열을 포함한 full character payload는 신규 문서 생성에만 사용할 수 있다. 관찰 배열이 없는 일반 character payload의 중첩 `lore`는 seed runner가 dot-path `$set`으로 변환해 이미 누적된 관찰을 보존한다.

### Faction (`packages/shared-db/src/schemas/faction.schema.ts`)

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| `code` | UPPER_SNAKE | ✓ | 유일 식별자 |
| `slug` | kebab-case | ✓ | |
| `label` | string ≤40 | ✓ | 한국어 라벨 |
| `labelEn` | string ≤60 | | 영문 라벨 |
| `summary` | string ≤500 | ✓ | 1~2문장 요약 |
| `tags` | string[] | | |
| `notableMembers` | UPPER_SNAKE[] | | NPC codename 배열 |
| `isPublic` | boolean | ✓ | |
| `source` | enum | | |

**body 섹션**: `## 이념/가치관` (→ ideology) / `## 역사` / `## 주요 인물` / `## 타 세력/기관 관계` (→ relationships, skill이 파싱) / `## 현재 동향`

> 참고: `ideology`, `relationships`, `loreMd`는 본문 body 섹션이 파싱되어 주입되는 파생 필드 (frontmatter에 직접 선언하지 않음).

`relationships[].type`은 `ally | rival | neutral | subordinate | parent | sibling` 중 하나다. 형제 기관·동급 조직 관계는 `sibling`으로 기록하며 임의의 유사어를 만들지 않는다.

### Institution (`packages/shared-db/src/schemas/institution.schema.ts`)

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| `code` | UPPER_SNAKE | ✓ | |
| `slug` | kebab-case | ✓ | |
| `label` | string ≤40 | ✓ | |
| `labelEn` | string ≤60 | | |
| `summary` | string ≤500 | ✓ | |
| `parentFactionCode` | UPPER_SNAKE | | 상위 세력 |
| `leaderCodename` | UPPER_SNAKE | | 수장 NPC |
| `headquartersLocation` | string ≤120 | | |
| `tags` | string[] | | |
| `isPublic` | boolean | ✓ | |

**body 섹션**: `## 임무` (→ mission) / `## 조직 구조` (→ subUnits, skill이 파싱) / `## 운영 현황` / `## 주요 인물` / `## 타 조직 관계` (→ relationships)

> 참고: `mission`, `subUnits`, `relationships`, `loreMd`는 본문 body 섹션이 파싱되어 주입되는 파생 필드 (frontmatter에 직접 선언하지 않음).

기관 관계도 faction과 같은 `ally | rival | neutral | subordinate | parent | sibling` vocabulary를 사용한다. `## 조직 구조`의 sub-unit은 `- CODE — 설명` 형식, 관계는 `- TARGET_CODE — type — 설명` 형식으로 작성해야 현행 parser가 구조화한다.

### Equipment (`packages/shared-db/src/schemas/equipment.schema.ts`)

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| `code` | UPPER_SNAKE | ✓ | 유일 식별자 |
| `slug` | catalog slug | ✓ | 소문자·숫자와 하이픈/언더스코어. 일반 장비는 kebab-case 권장 |
| `name` | string ≤80 | ✓ | 카탈로그 표시명 (한국어) |
| `nameEn` | string ≤80 | | 영문명 |
| `category` | enum | ✓ | `"WEAPON"` \| `"ARMOR"` |
| `price` | number ≥0 | ✓ | KRW |
| `damage` | string ≤80 | | 자유 문자열 (`"9mm / 단발"`, `"방어력 +30"` 등) |
| `description` | string ≤500 | | 카탈로그 한 줄 설명. frontmatter 미입력 시 body `## 설명` 폴백 (둘 다 비면 throw) |
| `previewImage` | url \| "/path" | | optional. **NPC와 다른 정책 — 미지정 시 `undefined` 보존** |
| `isAvailable` | boolean | ✓ | 판매/지급 가능 여부 |
| `isPublic` | boolean | ✓ | 공개 카탈로그(`/erp/wiki/catalog/equipment`) 노출 |
| `tags` | string[] | | 각 ≤40자 |
| `source` | enum | | NPC와 동일. `create-lore`는 기존 문서 호환 값 |

**body 섹션**: `## 설명` (→ description 폴백) / `## 배경` (→ `lore.background`) / `## 획득 경로` (→ `lore.acquisition`) / `## 비고` (→ `lore.notes`). 본문 전체는 `loreMd`에 원문 보존.

### Consumable (`packages/shared-db/src/schemas/consumable.schema.ts`)

Equipment와 동일 구조. 단:

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| `category` | enum | ✓ | `"CONSUMABLE"` 고정 |
| `effect` | string ≤120 | | 효과 한 줄 (`"HP +30 / 즉시"` 등). `damage` 대신 사용 |

나머지 필드(`code`/`slug`/`name`/`nameEn`/`price`/`description`/`previewImage`/`isAvailable`/`isPublic`/`tags`/`source`) 및 body 섹션은 Equipment와 동일. 편의점 연동 품목은 `SHOP_CATALOG.slug`와 `master_items.slug`가 같아야 하므로 기존 shop slug의 언더스코어를 보존한다.

### Catalog (`packages/shared-db/src/schemas/catalog.schema.ts`)

Equipment/Consumable과 동일한 `master_items` 구조를 쓰되, `category`는 `ITEM_CATEGORIES` 전체를 허용한다. 장비/소모품으로 좁힐 수 있는 항목은 전용 도메인을 우선 사용하고, 샘플(`MATERIAL`)·특수 격리 장비/작전 물증(`SPECIAL`)처럼 전용 도메인으로 환원하면 의미가 흐려지는 항목은 `docs/spec/catalog/{slug}.md`에 저장한다.

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| `category` | enum | ✓ | `"WEAPON"` \| `"ARMOR"` \| `"CONSUMABLE"` \| `"MATERIAL"` \| `"SPECIAL"` |
| `effect` | string ≤120 | | 샘플 성격, 보관 효과, 운용상 의미 등 |
| `damage` | string ≤80 | | 전투 장비일 때만 사용 |

나머지 필드와 body 섹션은 Equipment/Consumable과 동일하다.

`master_items` 계열 slug는 `catalogSlugSchema`를 사용한다. 공개 위키나 세력/기관/NPC의 일반 slug는 계속 kebab-case지만, 상점/봇에서 이미 쓰는 `cup_ramen`, `first_aid_patch` 같은 ID는 DB 연동 식별자이므로 언더스코어를 유지한다.

## 필드 일관성 메모

- `previewImage`는 NPC/Equipment/Consumable에서 지원. faction/institution은 MVP에서 미지원 (향후 확장 대상).
- NPC는 `previewImage`/`mainImage`를 `""` 빈 문자열로 정규화하는 정책. **Equipment/Consumable은 미지정 시 `undefined` 보존** (어댑터 `toDbEquipment`/`toDbConsumable`의 의도된 정책 차이).
- NPC의 `factionCode`/`institutionCode`, institution의 `parentFactionCode`/`leaderCodename`는 frontmatter에서 **빈 문자열**을 허용 (템플릿 프리필 수용). DB 어댑터(`toDb*`)가 빈 문자열을 `undefined`로 정규화해 적재한다.
- Equipment/Consumable의 `description`은 frontmatter에서 optional. 미지정 시 body `## 설명` 섹션으로 폴백되며, 둘 다 비어 있으면 어댑터가 명시적 throw.

## 이미지 자산 컨벤션

### peoples/ (AGENT — 플레이어블 캐릭터)

`StarGateV2/public/assets/peoples/<Slug>-<type>.<ext>` 규격:

- 핵심 3종은 PNG 원본과 WebP 최적화본을 같은 해상도로 함께 보관한다.
  - `<Slug>-main-image.{png,webp}` — 신원조회 portrait, `lore.mainImage` 매핑
  - `<Slug>-pixel-character.{png,webp}` — 도트 풀샷, `pixelCharacterImage` 매핑
  - `<Slug>-pixel-profile.{png,webp}` — 도트 프로필, `previewImage` 매핑
- `<Slug>-poster.webp` — 캐릭터 상세 PosterHero 와이드 히어로. `lore.posterImage`가 있는 캐릭터만 보관하는 선택 자산이다.
- `preferOptimizedPublicImagePath()`가 DB의 PNG 경로를 WebP로 우선 변환하므로 PNG/WebP 쌍의 파일명과 해상도가 반드시 일치해야 한다.
- `KNOWN_CHARACTER_ASSET_SLUGS`에 등록된 플레이어블 캐릭터는 핵심 3종의 PNG/WebP 쌍이 모두 있어야 한다. 메인 이미지만 있는 미니세션 캐릭터는 픽셀 자산이 준비되기 전까지 등록하지 않는다.

### npcs/ (NPC — 비플레이어블)

`StarGateV2/public/assets/npcs/<Slug>-profile.webp`를 우선 사용하고 legacy `.png`도 허용한다. `previewImage`에 서버 루트 경로(`/assets/npcs/...`)를 저장한다. 증거가 없는 placeholder portrait나 임의 생성 이미지는 추가하지 않는다.

### 슬러그 규칙

- **PascalCase 영문 강제** (예: `BigBoy`, `InDexer`, `Margaret`, `Unyeon`, `Yuhoe`).
- 한글 슬러그 금지 (URL 인코딩 + macOS/Windows/Linux 간 NFC/NFD 차이로 인한 OS 호환성 문제).
- codename ↔ slug 매핑은 `StarGateV2/lib/format/character-asset.ts` 의 `EXPLICIT_CODENAME_TO_SLUG` + `KNOWN_CHARACTER_ASSET_SLUGS` 가 SSOT. 신규 캐릭터/NPC 추가 시 매핑을 **동시에** 갱신해야 한다 (매핑 없이 파일만 추가하면 폴백 경로가 mismatch).

### 원본 파일

레포 외부 보관 (psd/ai/aseprite 등). `StarGateV2/public/` 아래 절대 두지 말 것 — Next.js 가 정적 서빙하므로 원본을 두면 인터넷에서 그대로 다운로드 가능.

### 경로 마이그레이션

이미지 파일명/경로 변경 시 DB 의 4 필드(`previewImage` / `pixelCharacterImage` / `lore.mainImage` / `lore.posterImage`) 도 함께 갱신해야 한다. 패턴은 `StarGateV2/scripts/_oneoff-fix-image-paths.mjs` 같은 일회성 마이그레이션 스크립트로 처리 후 즉시 삭제 (영구 보관 X).

## 제약 — frontmatter 평탄 YAML

`parseFrontmatter`(packages/shared-db/src/schemas/frontmatter.ts)는 경량 파서다. 다음만 지원:

- 키-값 (`key: value`)
- 인라인 배열 (`tags: [a, b, c]`) 또는 빈 배열 (`tags: []`)
- 블록 배열 (`- 항목` — 2칸 이상 indent)
- boolean / null / 숫자 / 문자열
- `#` 주석

**금지**: 중첩 객체, 멀티라인 스트링, 복잡 YAML. 복합 구조(relationships, subUnits, lore sub-document 등)는 body 섹션에 서술하고 skill/파서가 파싱.

## 구 체계 (마이그레이션 상태)

- `docs/civil-society/`, `docs/military/`, `docs/wolrd-council/` legacy 디렉토리는 모두 제거되었다. 현행 구조화 원본은 `docs/spec/{npc,faction,institution}/`, 자유 산문은 repository root `docs/lore/`다.
- `docs/civil-society/`의 이주 NPC는 `docs/spec/npc/{registrar,dominique-lee,towaski}.md`로 이전되었고, round-trip 검증은 `packages/shared-db/src/schemas/__tests__/migration.test.mjs`가 맡는다.
- 구 `docs/spec/npc/npc-registrar-spec.md`도 제거되었다. 신 규격 예시는 `docs/spec/templates/examples/npc-registrar.example.md`다.

그 외 `docs/spec/personnel-spec.md`는 인물 명세 원본으로 별도 유지.

> 자산 마이그레이션 audit 규약: 이미지/asset 파일명·경로 변경 시 **forward(DB)** 와 **backward(소스 코드 하드코딩)** 양쪽을 모두 검사해야 한다. backward audit 게이트:
> ```bash
> grep -rn 'assets/(peoples|npcs)/' StarGateV2/{app,components,lib}
> ```
> 결과를 `lib/format/character-asset.ts` 의 `KNOWN_CHARACTER_ASSET_SLUGS` + 마이그 스크립트의 `REPLACEMENTS` 와 교차 검증.

## 작업 흐름

```
  [근거/작성]                 [검증]                    [durable handoff]            [소비]
  source + stargate-lore  →  schema + adapter + audit  →  spec MD + seed payload  →  웹/봇/ERP
  docs/spec/{domain}/        packages/shared-db           scripts/seed-payloads/
```

- **작성**: `docs/spec/{domain}/{slug}.md`는 사람이 검토할 수 있는 구조화 원본이다. 세션 산문과 coverage ledger는 `../docs/lore/`에 별도로 둔다.
- **검증**: `parseFrontmatter` + `{domain}FrontmatterSchema` + `toDb{Domain}` adapter를 통과해야 한다. seed runner의 patch 검증은 이 round-trip을 대체하지 않는다.
- **repository 전체 감사**: session report coverage, category taxonomy, explicit `[[kind:target]]` link, 보고서↔위키 이미지 순서를 함께 확인한다.
  ```bash
  python3 "$CODEX_HOME/skills/stargate-lore/scripts/check_lore_output.py" \
    --coverage-audit ../docs/lore/session-sync \
    --payload-root scripts/seed-payloads \
    --static-payload-audit \
    --static-baseline ../docs/lore/static-target-baseline.json \
    --asset-root public
  ```
- **적재 handoff**: `scripts/seed-payloads/*.json`을 `seed:payload` dry-run으로 검증한다. live 쓰기는 최신 사용자 요청이 정확한 대상과 mutation을 지정하고 즉시 실행을 승인한 경우에만 `--execute --yes`로 수행한다.
- **소비**: `factions` / `institutions` / `characters` / `master_items` / `wiki_pages` / `session_reports`가 기존 도메인 SSOT다. ERP의 `/erp/factions`, `/erp/personnel`, `/erp/wiki`, `/erp/sessions`, `/erp/wiki/catalog/{all|equipment|consumable|sample|special}`가 이를 소비한다. `/erp/wiki/catalog/material`은 sample 탭으로 이동하는 legacy alias다.

## 저장소 durable inventory (2026-08-05)

아래 건수는 Git에 보존된 `docs/spec/{domain}/*.md` 파일 inventory다. live MongoDB 건수와 같다고 추정하지 않으며, live 상태를 보고할 때는 같은 날짜의 read-only 조회 증거를 별도로 남긴다.

| 도메인 | 문서 수 | 저장 대상 | 비고 |
|--------|--------:|-----------|------|
| faction | 7 | `factions` | `scope=external|internal`과 관계 vocabulary를 함께 유지 |
| institution | 4 | `institutions` | `SECRETARIAT`/`MANUS`는 `NOVUS_ORDO` 산하, `SPACE_ZERO`/`WHITE_ROSE`는 독립·협력 기관 |
| npc | 36 | `characters` (`type=NPC`) | Dossier 소비와 session appearance/personality evidence는 별도 누적 구조 |
| equipment | 21 | `master_items` | `WEAPON|ARMOR` |
| consumable | 22 | `master_items` | `CONSUMABLE` |
| catalog | 33 | `master_items` | `MATERIAL|SPECIAL` 등 전용 도메인으로 환원하기 어려운 항목 |

팩션/기관 운영 코드의 별도 SSOT는 `packages/shared-db/src/types/character.ts`의 `FACTIONS` / `INSTITUTIONS` const다. 신규 코드가 생기면 spec, const, payload/DB와 관계 link를 함께 동기화한다. `master_items.ItemCategory`는 `packages/shared-db/src/types/inventory.ts`의 `ITEM_CATEGORIES` const tuple이 SSOT다.

2026-08-05 read-only DB 확인 결과는 `factions=7` (`AHNENERBE`, `CIVIL`, `COUNCIL`, `GOLDEN_DAWN`, `HOSTILE`, `MILITARY`, `NOVUS_ORDO`), `institutions=4` (`MANUS`, `SECRETARIAT`, `SPACE_ZERO`, `WHITE_ROSE`)다. 이 snapshot은 날짜가 지난 뒤 자동으로 현재 상태를 보장하지 않으므로 이후 감사에서는 다시 조회한다.

같은 read-only 비교에서 NPC spec codename 36개와 live `characters(type=NPC)` codename 36개는 양방향 누락 없이 일치했다.

같은 날짜의 `session_reports` 감사에서는 문서 12건과 유효한 고유 `sessionId` 12개가 일치했고 누락·비문자열·빈 값·중복은 없었다. 이 12개 집합은 durable seed payload와 `docs/lore/session-sync/*-coverage.md` identity 집합에도 양방향 누락 없이 일치했다.

## 로어 지식·검색 보조 계층

기존 도메인 컬렉션을 대체하지 않고, 대규모 검색·추적·연결에 필요한 보조 계약을 분리한다.

| 보조 컬렉션 | 역할 |
|-------------|------|
| `lore_sources` | 근거 출처와 private audit locator |
| `lore_aliases` | 명칭·코드네임·번역·legacy ID를 canonical entity ref에 연결 |
| `lore_edges` | entity 간 방향성 관계와 근거·신뢰도·유효 기간 |
| `lore_claims` | subject/predicate/value 형태의 검증 가능한 주장 |
| `lore_search_documents` | 기존 도메인 문서에서 파생한 denormalized 검색 projection |
| `lore_ingestion_runs` | ingestion 상태·입력 hash·처리 통계·오류 audit |

- canonical entity ref는 `<kind>:<stable-key>` 형식이다. alias나 화면 label을 영속 식별자로 사용하지 않는다.
- alias/edge/claim은 `status`, `confidence`, evidence, lineage(`active|superseded|retconned`), access visibility를 함께 가진다. 출처 없는 단정과 silent retcon을 금지한다.
- `lore_search_documents`는 검색 성능용 projection일 뿐 두 번째 canon 원본이 아니다. 비어 있거나 아직 backfill되지 않은 환경에서는 통합 검색이 기존 컬렉션 fallback을 사용한다.
- `public|authenticated|restricted|gm-only` visibility는 조회 시 필터링한다. private source locator와 제한된 record를 검색 excerpt에 누출하지 않는다.
- schema/index/API 계약이 존재한다는 사실은 live collection backfill 또는 운영 DB 적재가 완료되었다는 뜻이 아니다. 실제 backfill/migration은 별도 dry-run과 명시 승인이 필요하다.

### 보조 계층의 세대·무결성 계약

- alias/edge/claim은 `logicalKey`별 active row를 하나만 허용하고, 교체 시 predecessor 전환과 successor insert를 같은 transaction에서 처리한다. 내용이 같은 rebuild 재실행은 기존 lineage를 유지하는 no-op이다.
- `logicalKey`가 없는 legacy 행은 raw null/missing 값을 같은 duplicate group으로 오판하지 않는다. storage migration이 계산형 logical identity로 실제 중복을 먼저 확인하고 backfill한 뒤 unique index를 적용한다. 기존 검색 인덱스와 key가 달라진 owner-scoped 검색 인덱스는 별도 이름(`lore_search_documents_access_owner_kind_status_updatedAt`)을 사용해 `IndexKeySpecsConflict`를 피한다.
- lore index DDL은 collection 간 원자적이지 않으므로 index 하나씩 순차 적용한다. 각 unique index는 broad preflight와 별개로 `createIndex` 직전에 중복을 다시 검사하며, 이미 생성된 동일 spec은 재사용되므로 중간 실패 뒤 같은 명령을 안전하게 재실행할 수 있다.
- `session_reports`는 고유 `sessionId`뿐 아니라 세 구조화 참조 배열 각각에 multikey index를 두어 wiki/catalog/dossier 역링크와 target lifecycle inbound 검사가 전체 보고서 스캔으로 퇴화하지 않게 한다. `lore:storage` read-only 결과가 이 5개 보고서 index의 missing/invalid 상태도 함께 보고한다.
- 모든 evidence/sourceIds는 실제 `lore_sources.sourceId`를 참조해야 한다. storage preflight는 source schema, 중복 ID, 고아 참조, parent 순환, ingestion source FK를 읽기 전용으로 검사한다.
- edge access는 양 끝 entity의 공개 범위를 교집합으로 계산한다. 공개 문서에서 비공개 인물로 향하는 관계가 공개 edge로 승격되지 않는다.
- `search-rebuild`는 mode당 하나의 running generation만 허용하며 heartbeat/lease를 가진다. 만료 lease 정리는 write 모드에서만 schema-valid `failed` audit으로 전환한다.
- 검색·조직 시그널 소비자는 **가장 최신 non-dry generation이 succeeded이고**, projection owner/행 수가 일치하며 원본이 그 이후 수정되지 않았을 때만 projection을 사용한다. running/partial/failed 또는 coverage 차이는 domain SSOT fallback 사유다.

### read-only 운영 점검

```bash
# index/identity/source FK/visibility/ingestion 무결성 점검 (기본 read-only)
pnpm lore:storage

# domain SSOT → source/alias/edge/claim/search projection 계획 (기본 dry-run)
pnpm lore:rebuild

# historical report source ledger 전용 backfill 계획 (기본 read-only)
pnpm lore:provenance

# payload 없는 live-only renderer target baseline 만료/승격 점검
pnpm lore:baseline
pnpm lore:baseline -- --verify-live
```

`lore:storage`, `lore:rebuild`, `lore:provenance`의 실제 쓰기는 `--execute --yes`와 명시적 `DB_NAME`/`MONGODB_DB_NAME`이 모두 필요하다. 이는 기술적 확인일 뿐 live 승인 자체가 아니며, 정확한 대상·변경 전후·부수 효과에 대한 최신 사용자 승인이 별도로 있어야 한다. dry-run은 stale run 정리, index 생성, backfill, projection write를 수행하지 않는다. `lore:provenance`는 domain/economy payload를 다시 적용하지 않고 repository source와 historical report의 add-only ledger만 한 transaction에서 backfill한다.

세션 보고서는 `relatedWikiSlugs`, `relatedPersonnelCodenames`, `relatedCatalogSlugs`를 명시적 graph link로 저장할 수 있다. 생성·수정 화면의 `STRUCTURED LORE LINKS`에서 한 줄에 하나씩 입력하며, 각 배열은 trim된 고유 문자열 최대 200개·항목당 160자로 검증된다. 모든 로그인 사용자가 보고서를 읽을 수 있으므로 target도 전 사용자에게 공개 가능한 `wiki_pages.isPublic:true`, `characters.isPublic != false`, `master_items.isPublic != false` exact identity만 허용한다. 비공개 target은 미존재와 같은 400으로 처리해 존재 oracle을 만들지 않으며, 중복 identity는 409로 거부한다. 신규 운영 보고서는 등록된 `sessions`/`trpg_sessions` source와 source에서 파생한 제목을 shared create gate가 강제한다. repository seed가 관리하는 historical report는 immutable `sessionId`와 함께 적용된 모든 `lore_sources.sourceId`를 add-only `provenanceSourceIds` ledger로 저장한다. generic runner는 다중 파일 WRITE를 거부하고 파일 1개를 transaction/audit 단위로 처리하므로 중단 뒤 파일별 재개가 가능하며, 같은 파일 재실행은 provenance와 `updatedAt`을 churn하지 않는다. 수정에서는 source identity를 변경할 수 없고, ObjectId 기반 운영 보고서는 신규·기존 모두 등록 source와 제목 SSOT를 다시 확인한다. 요청에 포함되지 않은 배열까지 합친 최종 세 참조 배열도 shared gate가 다시 검증한다. 따라서 API뿐 아니라 shared CRUD와 generic seed runner도 같은 규칙을 우회할 수 없다. 검증 뒤 target document의 내부 lock timestamp를 갱신해 report insert/update와 target 삭제·identity 변경·비공개 전환을 같은 Mongo write-conflict 경계에 두며, 이미 inbound report가 있는 target lifecycle mutation은 409로 차단한다. 등록 세션 삭제도 같은 source document를 transaction에서 잠근 뒤 inbound report를 검사한다. 이 내부 필드와 provenance ledger는 create DTO와 모든 공개 full-document 반환값에서 제거되고 provenance hash 입력에서도 제외된다. 응답 직전에도 공개 target으로 다시 해석되지 않는 legacy 참조를 fail-closed로 제거한다. 저장된 명시 링크는 보고서 상세뿐 아니라 wiki/catalog/dossier의 역링크와 위키의 관련 인물 계산에도 사용한다. 자동 본문 추론은 보조 수단이고, canon상 반드시 유지할 연결은 이 명시 필드를 사용한다. 보고서가 commit된 뒤 알림 전송만 실패한 경우에는 성공한 생성을 500으로 뒤집지 않고 서버 오류 로그로 분리한다.

## seed 스크립트

`seed:payload`는 `pnpm --filter @stargate/shared-db build`가 preseed hook으로 선행된다.

```bash
# 단일 파일 또는 디렉토리 dry-run (기본 — DB 쓰기 없음)
pnpm run seed:payload -- scripts/seed-payloads/example.json
pnpm run seed:payload -- scripts/seed-payloads

# live 실행은 정확한 대상·mutation에 대한 별도 승인을 받은 뒤에만
pnpm run seed:payload -- scripts/seed-payloads/example.json --execute --yes --verbose

# 가격/판매 메타데이터 또는 공방 blueprint가 포함된 승인된 실행
pnpm run seed:payload -- scripts/seed-payloads/example.json \
  --execute --yes --allow-economic-fields --verbose
```

- 지원 컬렉션과 stable filter key: `characters.codename`, `wiki_pages.slug`, `master_items.slug`, `factions.code`, `institutions.code`, `session_reports.sessionId`, `equipment_workshop_blueprints.slug`.
- DB 연결 dry-run은 `session_reports`의 등록 source·canonical title·공개 exact target과 character/wiki/master의 inbound 참조 보호를 읽기 전용으로 점검한다. 실제 write는 같은 검증 뒤 source/target lock을 획득한 transaction 안에서만 진행한다.
- `payload` envelope는 idempotent upsert, `filter` + `update` envelope는 명시적 MongoDB update다. credit ledger, inventory 수량, 상점 재고, 구매/소비, 주식 거래·가격 mutation은 이 runner의 지원 범위가 아니다.
- `master_items.price|isAvailable|shopMeta`와 공방 blueprint의 밸런스 필드는 dry-run에서 `before → after`와 예상 부수 효과를 출력한다. write에는 `--allow-economic-fields`가 추가로 필요하다. classic `$set`/payload의 DB 없는 dry-run은 계획 값을 표시하지만 현재값·실행 가능성을 증명하지 않는다. pipeline 경제 update는 실제 대상 document에 대한 MongoDB 평가 없이는 delta를 추정하지 않고 fail-closed한다.
- envelope와 patch/update operator는 shared schema로 검증하고, 금지 query operator·불완전 identity·깨진 text를 fail-closed 처리한다.
- root `createdAt`/`updatedAt` 같은 Mongo 메타데이터만 BSON Date로 변환하며 nested lore의 ISO 문자열과 dotted update path는 원문 문자열로 보존한다.
- `--execute` 단독은 실패하며 다중 파일 WRITE도 거부한다. 실행 시 명시적 DB명, 파일 1개 단위 transaction, write 후 재조회, postcondition, wiki content revision, `lore_sources` provenance, lease 기반 `lore_ingestion_runs` audit와 필수 unique/backlink index preflight를 적용한다. 전체 historical provenance만 보강할 때는 domain/economy payload를 재실행하지 말고 `lore:provenance`를 사용한다.
- dry-run 성공은 live write 승인이나 실행 성공을 뜻하지 않는다. 이번 문서 감사에서는 live mutation을 수행하지 않는다.

character codename은 다른 문서의 관계·보고서·위키 링크가 참조하는 stable identity이므로 generic seed rename을 금지한다. 변경 검토는 아래 전용 도구를 사용한다.

```bash
# 모든 비-system/non-lore collection의 역참조 inventory와 blocker만 출력
pnpm migrate:character-codename -- --from OLD_CODE --to NEW_CODE

# 실제 실행은 별도 승인 후에만
pnpm migrate:character-codename -- --from OLD_CODE --to NEW_CODE \
  --execute --yes --allow-identity-migration
```

전용 도구는 알려진 canonical 역참조만 자동 변경하고, 미분류 exact/embedded 문자열이 하나라도 있으면 실행을 차단한다. transaction 안에서 plan hash를 다시 비교하며, 완료 후 최신 search generation을 의도적으로 `failed` 처리해 별도 승인된 `lore:rebuild` 전까지 소비자가 domain fallback을 사용하게 한다.

`seed:factions` / `seed:institutions`는 해당 정적 domain seed를 위한 기존 명령으로 유지된다. 신규 lore handoff에는 collection 공통 검증을 제공하는 `seed:payload`를 우선한다.

## 후속 작업 로드맵

현재 완료된 토대 위에 점진적으로:

- [ ] **Phase 5-a — ERP 어드민 업로드 UI**: MD 파일 → 검증 → 승인 가능한 payload 미리보기. live 실행 전 대상·변경 전후·부수 효과를 다시 확인.
- [ ] **Phase 5-b — 공개 사이트 소비**: `app/(public)/world/` 하위에 세력/기관/NPC 페이지 (factions/institutions/characters 컬렉션 읽기).
- [ ] **Phase 5-c — 디스코드 봇 명령어**: `/faction info MILITARY`, `/npc lookup REGISTRAR` 등.
- [x] **Phase 5-d — legacy lore 경로 제거**: `docs/civil-society/`, `docs/military/`, `docs/wolrd-council/` 제거 및 현행 spec/lore 경로로 통합.
- [ ] **Phase 5-e — `upsertByCode` atomic 전환**: check-then-act 경로를 `findOneAndUpdate({ upsert: true })` 단일 연산으로.
- [ ] **Phase 5-f — update API Zod 검증**: `updateFaction`/`updateInstitution`에 partial 스키마 검증 추가 (호출부 생길 때).
- [x] **Phase 5-g — collection 공통 payload runner**: `master_items`를 포함한 지원 컬렉션의 stable-key upsert/update, dry-run, `--execute --yes`, schema guard.
- [x] **Phase 5-h — NOVUS_ORDO 상위 코드 등록**: `FACTIONS` const + `docs/spec/faction/novus-ordo.md` + 직속 기관/NPC의 `factionCode` 일관 적용.
- [x] **Lore backfill 도구·계약**: 기존 SSOT에서 source/alias/edge/claim/search projection을 재현 가능한 manifest로 생성하는 dry-run/rebuild와 storage preflight 구현. **운영 DB 적용은 미실행**이며 별도 승인 대상이다.
- [ ] **Lore quality dashboard**: coverage/static baseline/schema/source FK/lineage/generation gate는 CLI로 구현됨. 미해결 alias·상충 claim·retcon 검토를 운영자가 한 화면에서 처리하는 dashboard는 아직 미구현이다.

## 커밋

템플릿/예시 생성 자체는 `docs(novusweb):` 스코프, 신규 세계관 문서는 `feat(novusweb):` 또는 `docs(novusweb):` 재량. 커밋 자동 서명 금지.
