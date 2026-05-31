# 세계관 문서 규격 (docs/spec)

StarGate 세계관 자산은 **핵심 도메인**(NPC / Faction / Institution / Equipment / Consumable)과 **범용 카탈로그 항목**으로 정규화된다. 각 문서는 MD 파일(frontmatter + body 섹션)로 작성되며, Zod 스키마 검증을 거쳐 MongoDB에 적재된다.

## Quickstart — 3가지 방식

새 세계관 자산(NPC/세력/기관/장비/소모품/카탈로그 항목)을 추가하는 3가지 루트:

1. **대화형 작성 (권장)** — Claude에 `/create-lore npc` (또는 `faction`/`institution`/`equipment`/`consumable`/`catalog`) 호출. 질문 답하며 채우면 Zod 검증까지 자동. 산출물: MD 파일 + payload JSON.
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

## 템플릿

신규 문서 작성 시 아래 템플릿을 복사해 `{slug}.md` 파일명으로 저장한다.

- NPC: `docs/spec/templates/npc.template.md`
- Faction: `docs/spec/templates/faction.template.md`
- Institution: `docs/spec/templates/institution.template.md`
- Equipment: `docs/spec/templates/equipment.template.md`
- Consumable: `docs/spec/templates/consumable.template.md`
- Catalog: `docs/spec/templates/catalog.template.md`
- 예시: `docs/spec/templates/examples/npc-registrar.example.md`

## 자동 생성 — /create-lore

대화형으로 템플릿을 채우고 검증까지 한 번에 수행:

```
/create-lore npc
/create-lore faction
/create-lore institution
/create-lore equipment
/create-lore consumable
/create-lore catalog
```

도메인 생략 시 선택 UI가 뜬다. 산출물은 **MD 파일 + 검증 리포트 + DB payload JSON** 3종.

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
| `source` | enum | | `create-lore` / `discord` / `legacy-json` / `manual` |
| `previewImage` | url | | |
| `pixelCharacterImage` | string | | 도트/픽셀 스타일 대표 이미지 URL (자유 문자열, URL 권장) |
| `posterImage` | string | | 캐릭터 상세 히어로 와이드 이미지. lore sub-document 하위(`lore.posterImage`) 로 적재 |
| `warningVideo` | string | | 경고/틀징 영상 URL (자유 문자열, URL 권장) |

**body 섹션**: `## 대사` / `## 외형` / `## 성격` / `## 배경` / `## 역할 상세` / `## 이름 설명`

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

### Equipment (`packages/shared-db/src/schemas/equipment.schema.ts`)

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| `code` | UPPER_SNAKE | ✓ | 유일 식별자 |
| `slug` | kebab-case | ✓ | |
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
| `source` | enum | | `create-lore` / `discord` / `legacy-json` / `manual` |

**body 섹션**: `## 설명` (→ description 폴백) / `## 배경` (→ `lore.background`) / `## 획득 경로` (→ `lore.acquisition`) / `## 비고` (→ `lore.notes`). 본문 전체는 `loreMd`에 원문 보존.

### Consumable (`packages/shared-db/src/schemas/consumable.schema.ts`)

Equipment와 동일 구조. 단:

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| `category` | enum | ✓ | `"CONSUMABLE"` 고정 |
| `effect` | string ≤120 | | 효과 한 줄 (`"HP +30 / 즉시"` 등). `damage` 대신 사용 |

나머지 필드(`code`/`slug`/`name`/`nameEn`/`price`/`description`/`previewImage`/`isAvailable`/`isPublic`/`tags`/`source`) 및 body 섹션은 Equipment와 동일.

### Catalog (`packages/shared-db/src/schemas/catalog.schema.ts`)

Equipment/Consumable과 동일한 `master_items` 구조를 쓰되, `category`는 `ITEM_CATEGORIES` 전체를 허용한다. 장비/소모품으로 좁힐 수 있는 항목은 전용 도메인을 우선 사용하고, 샘플(`MATERIAL`)·특수 격리 장비/작전 물증(`SPECIAL`)처럼 전용 도메인으로 환원하면 의미가 흐려지는 항목은 `docs/spec/catalog/{slug}.md`에 저장한다.

| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| `category` | enum | ✓ | `"WEAPON"` \| `"ARMOR"` \| `"CONSUMABLE"` \| `"MATERIAL"` \| `"SPECIAL"` |
| `effect` | string ≤120 | | 샘플 성격, 보관 효과, 운용상 의미 등 |
| `damage` | string ≤80 | | 전투 장비일 때만 사용 |

나머지 필드와 body 섹션은 Equipment/Consumable과 동일하다.

## 필드 일관성 메모

- `previewImage`는 NPC/Equipment/Consumable에서 지원. faction/institution은 MVP에서 미지원 (향후 확장 대상).
- NPC는 `previewImage`/`mainImage`를 `""` 빈 문자열로 정규화하는 정책. **Equipment/Consumable은 미지정 시 `undefined` 보존** (어댑터 `toDbEquipment`/`toDbConsumable`의 의도된 정책 차이).
- NPC의 `factionCode`/`institutionCode`, institution의 `parentFactionCode`/`leaderCodename`는 frontmatter에서 **빈 문자열**을 허용 (템플릿 프리필 수용). DB 어댑터(`toDb*`)가 빈 문자열을 `undefined`로 정규화해 적재한다.
- Equipment/Consumable의 `description`은 frontmatter에서 optional. 미지정 시 body `## 설명` 섹션으로 폴백되며, 둘 다 비어 있으면 어댑터가 명시적 throw.

## 이미지 자산 컨벤션

### peoples/ (AGENT — 플레이어블 캐릭터)

`StarGateV2/public/assets/peoples/<Slug>-<type>.<ext>` 4종:

- `<Slug>-main-image.png` — 신원조회 portrait, `lore.mainImage` 매핑
- `<Slug>-pixel-character.png` — 도트 풀샷, `pixelCharacterImage` 매핑
- `<Slug>-pixel-profile.png` — 도트 프로필, `previewImage` 매핑
- `<Slug>-poster.webp` — 캐릭터 상세 PosterHero 와이드 히어로, `lore.posterImage` 매핑

### npcs/ (NPC — 비플레이어블)

`StarGateV2/public/assets/npcs/<Slug>-profile.png` 1종. `previewImage` 매핑.

### 슬러그 규칙

- **PascalCase 영문 강제** (예: `BigBoy`, `InDexer`, `Margaret`, `Unyeon`, `Yuhoe`).
- 한글 슬러그 금지 (URL 인코딩 + macOS/Windows/Linux 간 NFC/NFD 차이로 인한 OS 호환성 문제).
- codename ↔ slug 매핑은 `StarGateV2/lib/format/character-asset.ts` 의 `EXPLICIT_CODENAME_TO_SLUG` + `KNOWN_SLUGS` 가 SSOT. 신규 캐릭터/NPC 추가 시 매핑을 **동시에** 갱신해야 한다 (매핑 없이 파일만 추가하면 폴백 경로가 mismatch).

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

- `docs/civil-society/` — **이주 완료 + 구 파일 제거** (2026-05-13). `docs/spec/npc/{registrar,dominique-lee,towaski}.md` 로 이전됨. round-trip 검증은 `packages/shared-db/src/schemas/__tests__/migration.test.mjs` 참조.
- `docs/military/`, `docs/wolrd-council/` — 남은 잔존 경로. Phase 4에서 본 규격으로 이관 예정.
- 구 `docs/spec/npc/npc-registrar-spec.md` — **제거 완료** (2026-05-13). 신 규격 예시는 `docs/spec/templates/examples/npc-registrar.example.md`.

그 외 `docs/spec/personnel-spec.md`는 인물 명세 원본으로 별도 유지.

> 자산 마이그레이션 audit 규약: 이미지/asset 파일명·경로 변경 시 **forward(DB)** 와 **backward(소스 코드 하드코딩)** 양쪽을 모두 검사해야 한다. backward audit 게이트:
> ```bash
> grep -rn 'assets/(peoples|npcs)/' StarGateV2/{app,components,lib}
> ```
> 결과를 `lib/format/character-asset.ts` 의 `KNOWN_SLUGS` + 마이그 스크립트의 `REPLACEMENTS` 와 교차 검증.

## 작업 흐름

```
  [작성]                  [검증]              [적재]                [소비]
  template / create-lore → Zod 스키마 → seed 또는 수동 insert → 웹/봇/ERP
  docs/spec/{domain}/     schemas/*      factions/institutions    (후속)
                                         /characters/master_items
```

- **작성**: MD 파일은 `docs/spec/{domain}/{slug}.md`에 보존. source of truth.
- **검증**: `parseFrontmatter` + `{domain}FrontmatterSchema` + `toDb{Domain}` 어댑터. `/create-lore`는 자동, 수동 작성도 seed 실행 시 검증.
- **적재**:
  - factions/institutions: `scripts/seed-*.ts` (dry-run + `--execute --yes` opt-in)
  - characters (NPC): `/create-lore` payload JSON을 개발자가 수동 insert
  - master_items (equipment/consumable/catalog): `/create-lore` payload JSON → ERP `/erp/inventory/items/new` 폼 또는 직접 insert. catalog 전용 seed 스크립트는 Phase 5-g 대상.
- **소비**: factions/institutions/characters/master_items 컬렉션을 읽는 공개 사이트 페이지·디스코드 봇·ERP 페이지(`/erp/inventory`, `/erp/wiki/catalog/{all|equipment|consumable|material|special}`)에서 활용.

## 현재 DB 상태 (2026-05-14 기준)

| 컬렉션 | 건수 | 내용 |
|--------|------|------|
| `factions` | 4 | 외부 3대 (`MILITARY` / `COUNCIL` / `CIVIL` — `scope=external`) + `NOVUS_ORDO` (`scope=internal`, 본부). 외부 3대는 V(VIP) 명목 부여만 일반적, A~U 정규 부여는 원칙적으로 NOVUS_ORDO 내부(사무국·MANUS) 인사에만 적용 (운영 규약, [personnel-spec.md §4 등급 부여 정책](personnel-spec.md) 참조). lore MD: [`faction/novus-ordo.md`](faction/novus-ordo.md) / [`faction/military.md`](faction/military.md) / [`faction/council.md`](faction/council.md) / [`faction/civil.md`](faction/civil.md) |
| `institutions` | 2 | `SECRETARIAT` (사무국, subUnits 6: HQ/RESEARCH/ADMIN_BUREAU/INTL/CONTROL/FINANCE) / `MANUS` (현장요원, subUnits 5: SECTOR_A~E = NATO phonetic 알파/브라보/찰리/델타/에코) — **노부스 오르도 내부 기관**. `parentFactionCode` 는 모두 `NOVUS_ORDO` (Phase 5-h 에서 COUNCIL → NOVUS_ORDO 로 이전). 권한 8단(GM~U) 모두 정규 부여 대상. lore MD: [`institution/manus.md`](institution/manus.md) / [`institution/secretariat.md`](institution/secretariat.md) |
| `characters` (NPC) | 기존 N | NPC 이주본 3건(REGISTRAR/STAR_MART/TOWASKI) + ARBITER(제레마이어 폴, 재무위 의장) MD 작성 — DB 적재는 후속. Phase 5-h: SECRETARIAT/MANUS 소속 NPC(ARBITER/REGISTRAR)의 factionCode 가 NOVUS_ORDO 로 백필됨 |
| `master_items` | 운영 N건 | equipment + consumable + catalog 도메인 mirror. ERP 인벤토리(`/erp/inventory`) + 카탈로그(`/erp/wiki/catalog/{all\|equipment\|consumable\|material\|special}`)에서 활용 |

팩션/기관 seed는 `packages/shared-db/src/types/character.ts`의 `FACTIONS`/`INSTITUTIONS` const 기반. 신규 세력 추가 시 const와 DB 양쪽 동기화 필요 (현재 const가 TS 타입 소스). FACTIONS 의 `scope` 필드(`external`/`internal`)는 외부 권력 블록과 본부를 구분하는 핵심 메타.

`master_items`의 `ItemCategory`는 `packages/shared-db/src/types/inventory.ts`의 `ITEM_CATEGORIES` const tuple이 SSOT. equipment/consumable Zod 스키마는 엄격한 부분집합이고, catalog Zod 스키마는 전체 카테고리를 허용한다.

## seed 스크립트

`pnpm --filter @stargate/shared-db build`가 자동 선행된다 (preseed 훅).

```bash
# dry-run (기본 — DB 쓰기 없음, 계획만 출력)
pnpm run seed:factions
pnpm run seed:institutions

# 실제 실행 (opt-in 2단계 필수)
pnpm run seed:factions -- --execute --yes
pnpm run seed:institutions -- --execute --yes
```

- `--execute` 단독은 exit 1 — 명시적 `--yes` 없이 쓰기 방지
- 실행 직전 stdout에 연결 대상 호스트 echo
- `upsertByCode` idempotent — 재실행 안전
- `ensureAllIndexes()` 자동 호출 (unique index 부재 시 race 방지)

**equipment/consumable** 전용 seed 스크립트는 아직 없다. 현재는:

1. `/create-lore equipment` (또는 `consumable`) → spec MD + payload JSON 생성
2. payload JSON을 ERP `/erp/inventory/items/new` 폼에 옮기거나 `master_items.insertOne()` 수동 실행

자동화는 Phase 5-g(seed:equipment / seed:consumable upsert) 예정.

## 후속 작업 로드맵

현재 완료된 토대 위에 점진적으로:

- [ ] **Phase 5-a — ERP 어드민 업로드 UI**: MD 파일 → 검증 → DB insert 버튼. `/create-lore` 결과를 복붙 없이 바로 적재.
- [ ] **Phase 5-b — 공개 사이트 소비**: `app/(public)/world/` 하위에 세력/기관/NPC 페이지 (factions/institutions/characters 컬렉션 읽기).
- [ ] **Phase 5-c — 디스코드 봇 명령어**: `/faction info MILITARY`, `/npc lookup REGISTRAR` 등.
- [ ] **Phase 5-d — 기존 `docs/civil-society/`, `docs/military/`, `docs/wolrd-council/` 이관 완료** 후 구 경로 제거.
- [ ] **Phase 5-e — `upsertByCode` atomic 전환**: check-then-act 경로를 `findOneAndUpdate({ upsert: true })` 단일 연산으로.
- [ ] **Phase 5-f — update API Zod 검증**: `updateFaction`/`updateInstitution`에 partial 스키마 검증 추가 (호출부 생길 때).
- [ ] **Phase 5-g — catalog seed 스크립트**: `master_items` upsertBySlug idempotent + dry-run/`--execute --yes` opt-in (factions seed 패턴 거울).
- [ ] **Phase 5-h — NOVUS_ORDO 상위 코드 등록**: `FACTIONS` const + `docs/lore/faction/novus-ordo.md` + 노부스 오르도 직속 독립기구(SECRETARIAT/MANUS) NPC들의 `factionCode` 일관 적용.

## 커밋

템플릿/예시 생성 자체는 `docs(novusweb):` 스코프, 신규 세계관 문서는 `feat(novusweb):` 또는 `docs(novusweb):` 재량. 커밋 자동 서명 금지.
