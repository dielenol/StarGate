# 세계관 문서 규격 (docs/spec)

StarGate 세계관 자산은 **3개 도메인**으로 정규화된다. 각 문서는 MD 파일(frontmatter + body 섹션)로 작성되며, Zod 스키마 검증을 거쳐 MongoDB에 적재된다.

## 도메인

| 도메인 | 대상 | 저장 경로 | 컬렉션 |
|--------|------|-----------|--------|
| **npc** | 세계관 등장인물 (플레이어블 아닌 NPC) | `docs/spec/npc/{slug}.md` | `characters` (type=NPC) |
| **faction** | 세력 (정치·이념 단위. 군부/이사회/시민사회 등) | `docs/spec/faction/{slug}.md` | `factions` |
| **institution** | 기관 (세력 하위 조직. 사무국/재무국 등) | `docs/spec/institution/{slug}.md` | `institutions` |

## 템플릿

신규 문서 작성 시 아래 템플릿을 복사해 `{slug}.md` 파일명으로 저장한다.

- NPC: `docs/spec/templates/npc.template.md`
- Faction: `docs/spec/templates/faction.template.md`
- Institution: `docs/spec/templates/institution.template.md`
- 예시: `docs/spec/templates/examples/npc-registrar.example.md`

## 자동 생성 — /create-lore

대화형으로 템플릿을 채우고 검증까지 한 번에 수행:

```
/create-lore npc
/create-lore faction
/create-lore institution
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
| `nameEn` | string | | 영문 이름 |
| `gender` / `age` / `height` | string | | 자유 문자열 |
| `factionCode` | UPPER_SNAKE | | 소속 세력 |
| `institutionCode` | UPPER_SNAKE | | 소속 기관 |
| `department` | string | | 부서 |
| `isPublic` | boolean | ✓ | 공개 노출 여부 |
| `loreTags` | string[] | | 자유 태그 |
| `appearsInEvents` | string[] | | 등장 이벤트 |
| `source` | enum | | `create-lore` / `discord` / `legacy-json` / `manual` |
| `previewImage` | url | | |

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

## 필드 일관성 메모

- `previewImage`는 **NPC 전용 필드**. faction/institution은 MVP에서 지원하지 않음 (향후 확장 대상).
- NPC의 `factionCode`/`institutionCode`, institution의 `parentFactionCode`/`leaderCodename`는 frontmatter에서 **빈 문자열**을 허용 (템플릿 프리필 수용). DB 어댑터(`toDb*`)가 빈 문자열을 `undefined`로 정규화해 적재한다.

## 제약 — frontmatter 평탄 YAML

`parseFrontmatter`(packages/shared-db/src/schemas/frontmatter.ts)는 경량 파서다. 다음만 지원:

- 키-값 (`key: value`)
- 인라인 배열 (`tags: [a, b, c]`) 또는 빈 배열 (`tags: []`)
- 블록 배열 (`- 항목` — 2칸 이상 indent)
- boolean / null / 숫자 / 문자열
- `#` 주석

**금지**: 중첩 객체, 멀티라인 스트링, 복잡 YAML. 복합 구조(relationships, subUnits 등)는 body 섹션에 서술하고 skill/파서가 파싱.

## 구 체계 (마이그레이션 예정)

다음 경로는 구 체계 잔존 문서다. Phase 4에서 본 규격으로 이관 예정.

- `docs/civil-society/`
- `docs/military/`
- `docs/wolrd-council/`
- `docs/spec/npc/npc-registrar-spec.md` (신 규격 예시는 `docs/spec/templates/examples/npc-registrar.example.md`)

그 외 `docs/spec/personnel-spec.md`는 인물 명세 원본으로 별도 유지.

## 커밋

템플릿/예시 생성 자체는 `docs(novusweb):` 스코프, 신규 세계관 문서는 `feat(novusweb):` 또는 `docs(novusweb):` 재량. 커밋 자동 서명 금지.
