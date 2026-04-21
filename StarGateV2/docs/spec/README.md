# 세계관 문서 규격 (docs/spec)

StarGate 세계관 자산은 **3개 도메인**으로 정규화된다. 각 문서는 MD 파일(frontmatter + body 섹션)로 작성되며, Zod 스키마 검증을 거쳐 MongoDB에 적재된다.

## Quickstart — 3가지 방식

새 세계관 자산(NPC/세력/기관)을 추가하는 3가지 루트:

1. **대화형 작성 (권장)** — Claude에 `/create-lore npc` (또는 `faction`/`institution`) 호출. 질문 답하며 채우면 Zod 검증까지 자동. 산출물: MD 파일 + payload JSON.
2. **템플릿 직접 편집** — `docs/spec/templates/{domain}.template.md` 복사해서 `docs/spec/{domain}/{slug}.md` 로 저장. 필드 규칙은 아래 "frontmatter 필드 요약" 참조.
3. **Discord 텍스트 파싱 (AGENT 전용)** — 관리자 "AGENT 인입" 페이지. NPC/Faction/Institution은 대상 아님 (플레이어블 AGENT만).

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
| `agentLevel` | enum | | `"V" \| "A" \| "M" \| "H" \| "G" \| "J" \| "U"` 중 하나 (CharacterBase와 공유되는 AGENT 레벨) |
| `isPublic` | boolean | ✓ | 공개 노출 여부 |
| `loreTags` | string[] | | 자유 태그 |
| `appearsInEvents` | string[] | | 등장 이벤트 |
| `source` | enum | | `create-lore` / `discord` / `legacy-json` / `manual` |
| `previewImage` | url | | |
| `pixelCharacterImage` | string | | 도트/픽셀 스타일 대표 이미지 URL (자유 문자열, URL 권장) |
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

## 구 체계 (마이그레이션 상태)

- `docs/civil-society/` — **이주 완료**. `docs/spec/npc/{registrar,dominique-lee,towaski}.md` 로 이전. round-trip 검증은 `packages/shared-db/src/schemas/__tests__/migration.test.mjs` 참조.
- `docs/military/`, `docs/wolrd-council/` — 남은 잔존 경로. Phase 4에서 본 규격으로 이관 예정.
- `docs/spec/npc/npc-registrar-spec.md` — 구 spec 원본. 신 규격 예시는 `docs/spec/templates/examples/npc-registrar.example.md`.

그 외 `docs/spec/personnel-spec.md`는 인물 명세 원본으로 별도 유지.

## 작업 흐름

```
  [작성]                  [검증]              [적재]                [소비]
  template / create-lore → Zod 스키마 → seed 또는 수동 insert → 웹/봇/ERP
  docs/spec/{domain}/     schemas/*      factions/institutions    (후속)
                                         /characters
```

- **작성**: MD 파일은 `docs/spec/{domain}/{slug}.md`에 보존. source of truth.
- **검증**: `parseFrontmatter` + `{domain}FrontmatterSchema` + `toDb{Domain}` 어댑터. `/create-lore`는 자동, 수동 작성도 seed 실행 시 검증.
- **적재**: 현재는 `scripts/seed-*.ts` 또는 `/create-lore` payload를 개발자가 DB에 수동 insert. ERP 어드민 업로드 UI는 후속 Phase.
- **소비**: factions/institutions/characters 컬렉션을 읽는 공개 사이트 페이지와 디스코드 봇 명령어는 후속 Phase.

## 현재 DB 상태 (2026-04-20 기준)

| 컬렉션 | 건수 | 내용 |
|--------|------|------|
| `factions` | 3 | `MILITARY` / `COUNCIL` / `CIVIL` |
| `institutions` | 2 | `SECRETARIAT` (subUnits 4) / `FINANCE` |
| `characters` (NPC) | 기존 N | NPC 이주본 3건(REGISTRAR/STAR_MART/TOWASKI)은 MD만 작성, DB 적재는 후속 |

팩션/기관 seed는 `packages/shared-db/src/types/character.ts`의 `FACTIONS`/`INSTITUTIONS` const 기반. 신규 세력 추가 시 const와 DB 양쪽 동기화 필요 (현재 const가 TS 타입 소스).

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

## 후속 작업 로드맵

현재 완료된 토대 위에 점진적으로:

- [ ] **Phase 5-a — ERP 어드민 업로드 UI**: MD 파일 → 검증 → DB insert 버튼. `/create-lore` 결과를 복붙 없이 바로 적재.
- [ ] **Phase 5-b — 공개 사이트 소비**: `app/(public)/world/` 하위에 세력/기관/NPC 페이지 (factions/institutions/characters 컬렉션 읽기).
- [ ] **Phase 5-c — 디스코드 봇 명령어**: `/faction info MILITARY`, `/npc lookup REGISTRAR` 등.
- [ ] **Phase 5-d — 기존 `docs/civil-society/`, `docs/military/`, `docs/wolrd-council/` 이관 완료** 후 구 경로 제거.
- [ ] **Phase 5-e — `upsertByCode` atomic 전환**: check-then-act 경로를 `findOneAndUpdate({ upsert: true })` 단일 연산으로.
- [ ] **Phase 5-f — update API Zod 검증**: `updateFaction`/`updateInstitution`에 partial 스키마 검증 추가 (호출부 생길 때).

## 커밋

템플릿/예시 생성 자체는 `docs(novusweb):` 스코프, 신규 세계관 문서는 `feat(novusweb):` 또는 `docs(novusweb):` 재량. 커밋 자동 서명 금지.
