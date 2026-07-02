---
name: create-lore
description: StarGate 세계관 자산을 대화형으로 작성·검증. npc/faction/institution은 Zod 스키마 검증 후 MD + DB payload 산출, lore는 검증 없는 산문 MD로 `docs/lore/` 카테고리 폴더에 저장. 프로젝트 StarGate (@stargate/shared-db 필수, lore 도메인은 shared-db 불필요). `/create-lore [npc|faction|institution|lore]` 형태로 호출.
user_invocable: true
---

# /create-lore — 세계관 문서 작성 도우미

StarGate 세계관 자산(NPC / Faction / Institution)을 대화형으로 작성·검증하고 3종 산출물을 만드는 스킬. Phase 1에서 정의된 Zod 스키마(`packages/shared-db/src/schemas/`)와 어댑터(`toDbFaction/toDbInstitution/toDbNpc`)를 그대로 활용한다.

## 산출물 3종

1. **MD 파일** — `StarGateV2/docs/spec/{domain}/{slug}.md` 경로로 Write
2. **검증 리포트** — 대화에 JSON 블록으로 통과 필드, warning, FK 매칭 상태 출력
3. **DB payload JSON** — 어댑터 결과. 사용자 요청 시 `StarGateV2/scripts/seed-payloads/{domain}-{slug}.json`으로도 저장

## 1. 적격성 검사 (Precondition Gate)

StarGate 모노레포 전용 스킬. 아래 검사 실패 시 즉시 중단하고 안내:

```
Glob "packages/shared-db/package.json"
```

결과가 0개이거나 StarGate 레포가 아니면 중단: **"이 skill은 StarGate 모노레포 전용입니다. 프로젝트 루트에서 실행해주세요."**

추가 확인 (optional): `packages/shared-db/src/schemas/index.ts` 존재 여부. 없으면 Phase 1 미완료로 판단하고 경고.

## 2. 도메인 선택

인수로 `npc | faction | institution | equipment | consumable | lore` 전달 시 그대로 사용. 없거나 잘못된 값이면 `AskUserQuestion`으로 질의:

```
question: "어떤 도메인의 문서를 작성하시겠습니까?"
options: ["npc", "faction", "institution", "equipment", "consumable", "lore"]
```

> **lore 도메인**은 경량 분기다 (Zod 스키마·어댑터·payload JSON 없음). 세부는 §14 참조.

> **equipment / consumable 도메인**은 운영 DB로 기존 `master_items` 컬렉션을 재활용한다. 산출물은 spec MD + payload JSON. category 필드로 구분되며, `equipment`는 `WEAPON|ARMOR`, `consumable`은 `CONSUMABLE` 고정.

## 3. 템플릿 및 스키마 로드

도메인 결정 직후 아래 파일들을 Read (순서 무관, 병렬):

- `StarGateV2/docs/spec/templates/{domain}.template.md` — 필드 리스트와 body 섹션 제목 추출
- `packages/shared-db/src/schemas/{domain}.schema.ts` — Zod 스키마에서 required/optional 판별
- `packages/shared-db/src/schemas/common.ts` — `codeSchema`, `slugSchema` 등 공통 제약 참고
- `packages/shared-db/src/schemas/frontmatter.ts` — `parseFrontmatter`, `parseMdBody`, `toDb*` 어댑터 확인

> equipment / consumable 도메인은 위 `{domain}` 변수형 경로로 자동 매칭된다 (`equipment.template.md`, `equipment.schema.ts`, `consumable.template.md`, `consumable.schema.ts`). 두 도메인 모두 `frontmatter.ts`의 `toDbEquipment` / `toDbConsumable` 어댑터를 사용한다.

## 3.5. 로어북 컨텍스트 로드

도메인이 `npc | faction | institution | equipment | consumable` 인 경우, 본격 필드 수집 전에 레포 루트의 로어북을 **전체 Read**해서 인메모리 컨텍스트로 확보한다.

1. Glob 으로 `docs/lore/**/*.md` 매칭 (루트 기준 `/Users/flitto/Code/StarGate/docs/lore/**/*.md`)
2. 매칭된 파일들을 병렬 Read 로 적재 — README, history, ideology, concept, faction, place 전체
3. 로어북 내용은 아래 용도로 활용:
   - body 섹션(`background` / `appearance` / `personality` 등) 초안 제안 시 배경 근거로 반영
   - `factionCode` / `institutionCode` 결정 시 로어북의 세력·기관 설명과 대조
   - `loreTags` 제안 시 로어북에 이미 등장한 태그를 우선 재사용
4. `docs/lore/` 부재 시 경고만 표시하고 계속 진행 (하드 실패 아님)
5. 개별 파일 Read 실패는 해당 파일만 스킵, 전체 중단하지 않음

**lore 도메인일 때는 본 섹션 스킵 가능** — 작성 대상이 로어북 자체라 자기참조가 불필요하다. 다만 인덱스·제목 중복 방지 차원에서 README 및 동일 카테고리 파일 목록 Read는 권장한다.

## 4. FK 옵션 로딩

NPC의 `factionCode`/`institutionCode` 자동완성을 위해 아래 순서로 시도:

1. **1순위 (optional, MVP 생략 가능)**: MongoDB 연결 가능 시 `factions`/`institutions` 컬렉션에서 `{ code, label }` 목록 조회
2. **2순위 (MVP 기본)**: `packages/shared-db/src/types/character.ts`의 `FACTIONS` / `INSTITUTIONS` const Read해서 fallback

MVP 범위에서는 **const fallback만 요구**. 실제 DB 연결은 본 skill에서 생략 가능하며, 사용자가 새 code를 입력하면 경고만 표시하고 통과.

## 5. 필드 수집 (대화형)

필수 필드 먼저 → 권장 → 선택 순. 관련 필드는 묶어서 질의:

### 공통 질의 전략

- `codename`(NPC) / `code`(Faction·Institution) 수집 직후 → `slug` 자동 생성 제안 (소문자+언더바→하이픈)
  - 예: `REGISTRAR` → `registrar`, `NOSB_CONTROL` → `nosb-control`
- 사용자가 slug를 수정 원하면 재입력 받음
- boolean(`isPublic`)은 기본 `false` 제안
- `source` 미지정 시 `create-lore` 기본값
- `createdAt`/`updatedAt` 미지정 시 현재 ISO 문자열 자동 주입

### 도메인별 수집 순서

**npc**:
1. 식별자: `codename` → `slug`
2. 기본 정보: `type` (고정 NPC), `role`, `nameKo`, `nameEn`
3. 외형 수치: `gender`, `age`, `height`
4. 소속: `factionCode` (FACTIONS 옵션 제시), `institutionCode` (INSTITUTIONS 옵션 제시), `department`
5. 노출·태그: `isPublic`, `loreTags` (쉼표 구분), `appearsInEvents`
6. 이미지: `previewImage` (NPC 는 `/assets/npcs/<Slug>-profile.png` 컨벤션 1종. AGENT 는 별도 — AGENT 인입 시 `/assets/peoples/<Slug>-main-image.png` / `pixel-character.png` / `pixel-profile.png` / `poster.webp` 4종 분리. 슬러그는 PascalCase 영문 강제, 한글 슬러그 금지.)
7. body 섹션: `quote`(대사), `appearance`, `personality`, `background`, `roleDetail`, `notes`(이름 설명) — 각 섹션을 **한 번에 한 개씩** 긴 텍스트로 수집

**faction**:
1. 식별자: `code` → `slug`
2. 라벨: `label`, `labelEn`
3. `summary` (1~2문장)
4. `tags`, `notableMembers` (NPC codename 배열)
5. `isPublic`, `source`
6. body 섹션: `ideology`(이념/가치관), `history`(역사), `notableMembersDetail`(주요 인물), `relationships`(타 세력/기관 관계), `currentStatus`(현재 동향)
7. **relationships 수집**: 반복 질문 — 종료할 때까지 `{ targetCode, type, note }` 추가. type은 `ally | rival | neutral | subordinate | parent` 선택지 제시.

**institution**:
1. 식별자: `code` → `slug`
2. 라벨: `label`, `labelEn`
3. 상위 구조: `parentFactionCode`
4. 리더 / 본부: `leaderCodename`, `headquartersLocation`
5. `summary`, `tags`, `isPublic`, `source`
6. body 섹션: `mission`(임무), `subUnits`(조직 구조), `operations`(운영 현황), `notableMembersDetail`(주요 인물), `relationships`(타 조직 관계)
7. **subUnits 수집**: 반복 — `{ code, label, labelEn?, summary? }`
8. **relationships 수집**: faction과 동일

**equipment**:
1. 식별자: `code` → `slug`
2. 기본 정보: `category` (WEAPON | ARMOR 선택), `name`, `nameEn`
3. 카탈로그 데이터: `price` (숫자, KRW), `damage` (예: "9mm / 단발", "방어력 +30"), `description` (한 줄 카탈로그 설명, 1~500자)
4. 노출·태그: `isAvailable` (재고/판매 가능), `isPublic` (공개 위키 노출), `tags`
5. 이미지: `previewImage`
6. body 섹션 (옵션): `description` (한 줄, frontmatter와 동일하나 본문에 풀이 가능), `background` (장비 유래·서사), `acquisition` (획득 경로), `notes` (비고)

**consumable**:
1. 식별자: `code` → `slug`
2. 기본 정보: `category` 고정 `CONSUMABLE`, `name`, `nameEn`
3. 카탈로그 데이터: `price`, `effect` (효과 한 줄, 예: "HP +30 / 즉시"), `description`
4. 노출·태그: `isAvailable`, `isPublic`, `tags`
5. 이미지: `previewImage`
6. body 섹션: equipment와 동일

## 6. 검증

### 6-1. frontmatter 검증

수집된 필드를 도메인별 `{domain}FrontmatterSchema`로 parse:

```
npcFrontmatterSchema.safeParse(frontmatter)
factionFrontmatterSchema.safeParse(frontmatter)
institutionFrontmatterSchema.safeParse(frontmatter)
```

실패 시 `.error.issues`를 순회하며 해당 필드만 재질의.

### 6-2. body + frontmatter 통합 변환

`toDbNpc / toDbFaction / toDbInstitution` 호출해 DB 문서 후보 생성.

- **NPC**: `toDbNpc(frontmatter, bodySections)` — `bodySections`는 `{ appearance, personality, background, roleDetail, notes, quote }` 객체
- **Faction**: `toDbFaction(frontmatter, bodyText)` — body 전체 문자열. 내부에서 `parseMdBody`로 섹션 추출
- **Institution**: `toDbInstitution(frontmatter, bodyText)` — 동일
- **Equipment**: `toDbEquipment(frontmatter, bodyText)` — body 전체. 내부에서 `parseMdBody`로 `## 설명/배경/획득/비고` 추출. `description`은 frontmatter 우선, 없으면 body `## 설명` 폴백.
- **Consumable**: `toDbConsumable(frontmatter, bodyText)` — 동일 패턴.

변환 실패 시 오류 메시지를 사용자에게 표시하고 해당 필드 재질의.

### 6-3. FK 매칭 검사

- `factionCode`가 FACTIONS const에 있는지 → `✓` / 없으면 `⚠ 신규 code (DB에 존재 여부 미확인)`
- `institutionCode`도 동일
- `notableMembers` / `leaderCodename`의 NPC codename은 현재 파일시스템 `docs/spec/npc/*.md` 존재 여부로 체크 (`Glob`)

### 6-4. 중복 체크

`StarGateV2/docs/spec/{domain}/{slug}.md` 파일 존재 확인. 있으면 overwrite 전에 사용자 확인.

## 7. 산출물 생성

### MD 파일 작성

1. 디렉토리 없으면 `Bash("mkdir -p StarGateV2/docs/spec/{domain}")`로 생성
2. frontmatter 블록 + body 섹션을 조립해 `{slug}.md` Write
3. frontmatter 순서는 템플릿 순서 유지 (일관성)
4. body 섹션은 템플릿 순서 + 비어있는 섹션도 헤더는 남기되 placeholder 안내 문구

### 검증 리포트 출력

대화에 JSON 블록으로 출력:

```json
{
  "domain": "npc",
  "slug": "registrar",
  "passed": { "fields": 18, "sections": 6 },
  "warnings": [
    "factionCode: COUNCIL → FACTIONS const에 존재 ✓",
    "notableMembers[0]: INDEXER → docs/spec/npc/indexer.md 없음 ⚠"
  ],
  "fkMatches": {
    "factionCode": { "value": "COUNCIL", "status": "known" },
    "institutionCode": { "value": "SECRETARIAT", "status": "known" }
  },
  "filePath": "/absolute/path/to/StarGateV2/docs/spec/npc/registrar.md"
}
```

### DB payload JSON 출력

대화에 JSON 블록:

```json
{
  "collection": "characters",
  "type": "NPC",
  "payload": { /* toDbNpc 결과 그대로 */ }
}
```

사용자가 "파일로도 저장" 요청하면 `StarGateV2/scripts/seed-payloads/{domain}-{slug}.json`으로 Write (디렉토리 없으면 생성).

## 8. 사용자 승인 게이트

MD 파일 작성 **직전** 미리보기 출력 후 확인:

```
AskUserQuestion
question: "아래 내용으로 파일을 작성할까요?"
options: ["작성", "수정", "취소"]
```

- "수정" 선택 시 어떤 필드를 바꿀지 질의 → 해당 필드만 재수집 → 검증 루프
- "취소" 선택 시 산출물 없이 종료, 수집한 값만 대화에 남김

## 9. 제약 / 주의

- 기존 MD 이주 모드 없음. **신규 작성만**
- 커밋 하지 않음. 사용자가 `/auto-commit` 등으로 별도 수행
- frontmatter 평탄 제약 준수. 중첩 객체 생성 금지. relationships/subUnits는 body에 서술
- 동일 codename/code 중복 시 경고. overwrite는 사용자 명시 확인 후
- `StarGateV2/docs/spec/npc/npc-registrar-spec.md` 같은 구 체계 파일은 **건드리지 않음**
- `docs/civil-society/` 경로도 건드리지 않음 (Phase 4 이관 대상)
- `docs/lore/` 는 **모든 도메인 작성 시 Read 컨텍스트**로 사용. `lore` 도메인 외에는 Write 하지 않는다.
- **DB 적재는 본 skill 범위 아님.** 산출물은 MD 파일 + payload JSON까지. 실제 insert는 후속 CRUD 등록(Phase 1.5) 이후 별도 스크립트/ERP 페이지에서 수행한다.
- `parseFrontmatter` 호출 시 `{ allowMissing: false, fileName }` 옵션을 명시해 구분자 부재 시 명시적 에러 + 파일명 컨텍스트를 얻도록 한다.

## 10. 도메인별 필드 세부 명세

### 10-1. NPC frontmatter

| 필드 | 타입 | 필수 | 제약 |
|------|------|------|------|
| `codename` | string | ✓ | UPPER_SNAKE_CASE, 2~32자 |
| `slug` | string | | kebab-case, 1~80자 |
| `type` | `"NPC"` | ✓ | 고정값 |
| `role` | string | ✓ | 1~100자 |
| `factionCode` | string | | UPPER_SNAKE |
| `institutionCode` | string | | UPPER_SNAKE |
| `department` | string | | |
| `nameKo` | string | ✓ | |
| `nameNative` | string | | 원어 표기 (한자/일본어 등) |
| `nickname` | string | | 짧은 별칭/통칭 |
| `nameEn` | string | | |
| `gender` | string | | 자유 문자열 |
| `age` | string | | 자유 문자열 ("32세" 허용) |
| `height` | string | | 자유 문자열 |
| `weight` | string | | 자유 문자열. lore 영역(신상)으로 분류 |
| `isPublic` | boolean | ✓ | |
| `loreTags` | string[] | | 각 40자 이내 |
| `appearsInEvents` | string[] | | 각 80자 이내 |
| `source` | enum | | discord \| legacy-json \| manual \| create-lore |
| `previewImage` | url 또는 "" | | |
| `pixelCharacterImage` | string | | 도트/픽셀 대표 이미지 (자유 문자열, URL 권장) |
| `posterImage` | string | | 캐릭터 상세 히어로 와이드. `lore.posterImage` 로 적재 |
| `createdAt` | ISO datetime | | 생략 시 now |
| `updatedAt` | ISO datetime | | 생략 시 now |

> **Phase 1 sheet 분리 후**: NPC frontmatter 의 신원/서사 필드는 모두 DB 의 `lore` sub-document
> 로 적재된다 (예: `lore.gender`, `lore.weight`, `lore.appearance`). NPC 는 게임 시트(`play`)
> 가 없다. 검증 리포트의 매핑 표기는 `lore.X` 로 출력.

### 10-2. NPC body 섹션

| 섹션 제목 (heading) | DB 매핑 | 필수 |
|---------------------|---------|------|
| `## 대사` 또는 `## quote` | `lore.quote` | |
| `## 외형` 또는 `## appearance` | `lore.appearance` | |
| `## 성격` | `lore.personality` | |
| `## 배경` | `lore.background` | |
| `## 역할 상세` | `lore.roleDetail` | |
| `## 이름 설명` / `## 이름/코드네임 설명` | `lore.notes` | |

### 10-3. Faction frontmatter

| 필드 | 타입 | 필수 | 제약 |
|------|------|------|------|
| `code` | string | ✓ | UPPER_SNAKE |
| `slug` | string | ✓ | kebab-case |
| `label` | string | ✓ | 1~40자 |
| `labelEn` | string | | ≤60자 |
| `summary` | string | ✓ | 1~500자 |
| `tags` | string[] | | |
| `notableMembers` | string[] | | 각 UPPER_SNAKE |
| `isPublic` | boolean | ✓ | |
| `source` | enum | | |

### 10-4. Faction body 섹션

| 섹션 | DB 매핑 |
|------|---------|
| `## 이념/가치관` | `ideology` (어댑터 자동) |
| 본문 전체 | `loreMd` (어댑터 자동) |
| `## 타 세력/기관 관계` | `relationships` — skill이 `- CODE — type — note` 라인 파싱해서 주입 |

### 10-5. Institution frontmatter

| 필드 | 타입 | 필수 | 제약 |
|------|------|------|------|
| `code` | string | ✓ | UPPER_SNAKE |
| `slug` | string | ✓ | kebab-case |
| `label` | string | ✓ | 1~40자 |
| `labelEn` | string | | ≤60자 |
| `parentFactionCode` | string | | UPPER_SNAKE |
| `leaderCodename` | string | | UPPER_SNAKE |
| `headquartersLocation` | string | | ≤120자 |
| `summary` | string | ✓ | 1~500자 |
| `tags` | string[] | | |
| `isPublic` | boolean | ✓ | |
| `source` | enum | | |

### 10-6. Institution body 섹션

| 섹션 | DB 매핑 |
|------|---------|
| `## 임무` | `mission` (어댑터 자동) |
| 본문 전체 | `loreMd` (어댑터 자동) |
| `## 조직 구조` | `subUnits` — skill이 `- CODE — label — summary?` 파싱 |
| `## 타 조직 관계` | `relationships` — faction과 동일 형식 |

### 10-7. Equipment frontmatter

| 필드 | 타입 | 필수 | 제약 |
|------|------|------|------|
| `code` | string | ✓ | UPPER_SNAKE_CASE |
| `slug` | string | ✓ | kebab-case |
| `name` | string | ✓ | 1~80자 |
| `nameEn` | string | | ≤80자 |
| `category` | enum | ✓ | "WEAPON" \| "ARMOR" |
| `price` | number | ✓ | ≥0 |
| `damage` | string | | ≤80자 |
| `description` | string | ✓ | 1~500자 |
| `previewImage` | url \| "" | | |
| `isAvailable` | boolean | ✓ | 판매/지급 가능 여부 |
| `isPublic` | boolean | ✓ | 공개 위키 카탈로그 노출 |
| `tags` | string[] | | 각 40자 이내 |
| `source` | enum | | discord \| legacy-json \| manual \| create-lore |
| `createdAt` | ISO datetime | | 생략 시 now |
| `updatedAt` | ISO datetime | | 생략 시 now |

### 10-8. Equipment body 섹션

| 섹션 제목 | DB 매핑 |
|----------|---------|
| `## 설명` | `description` (frontmatter 미입력 시 폴백) |
| `## 배경` | `lore.background` |
| `## 획득 경로` 또는 `## 획득` | `lore.acquisition` |
| `## 비고` | `lore.notes` |
| 본문 전체 | `loreMd` |

### 10-9. Consumable frontmatter

Equipment와 동일. 단 `category`는 `"CONSUMABLE"` 고정, `damage` 대신 `effect` (≤120자, optional).

### 10-10. Consumable body 섹션

Equipment와 동일.

## 11. Relationships / SubUnits 파싱 규칙

body 섹션에서 리스트 항목을 파싱해 frontmatter에 주입하는 규칙:

### relationships

```
- `COUNCIL` — ally — 창설 이래 공식 동맹
- `MILITARY` — neutral — 사안별 대응
```

- 정규식: `^-\s+[`']?([A-Z_][A-Z0-9_]*)[`']?\s+[-—]\s+(ally|rival|neutral|subordinate|parent)(?:\s+[-—]\s+(.*))?$`
- 구분자는 하이픈(`-`) / em-dash(`—`) 모두 허용 (사용자가 ASCII 하이픈을 타이핑하는 경우 수용).
- 매칭 실패한 라인은 무시 (경고 리포트에 기록)

### subUnits (institution 전용)

```
- `SUB_UNIT_1` — 하위 부서 1 — 설명
```

- 정규식: `^-\s+[`']?([A-Z_][A-Z0-9_]*)[`']?\s+[-—]\s+([^-—]+?)(?:\s+[-—]\s+(.*))?$`
- 구분자는 하이픈 / em-dash 양쪽 허용.
- `code`, `label`, `summary` 추출

## 12. 실패 처리

- **Zod 검증 실패**: `issues[].path` + `issues[].message`를 사용자에게 한 줄씩 제시. "field X: expected Y, got Z" 형태로 재질의.
- **파일 쓰기 실패**: 권한/디스크 오류 메시지 그대로 표시하고 대체 경로 제안.
- **어댑터 변환 실패**: frontmatter는 통과했지만 body 섹션이 부족한 경우 — 누락 섹션 나열 후 재수집.
- **FK 매칭 실패**: 경고만 표시하고 계속 진행 (하드 실패 아님).

## 13. 인수 예시

```
/create-lore                         # 도메인 질의
/create-lore npc                     # NPC 즉시 시작
/create-lore faction                 # Faction 즉시 시작
/create-lore institution             # Institution 즉시 시작
/create-lore lore                    # 로어북 문서 작성 — 카테고리 질의
/create-lore lore history            # 카테고리 지정해 바로 시작
/create-lore equipment              # 장비 즉시 시작
/create-lore consumable              # 소모품 즉시 시작
```

잘못된 도메인(`/create-lore abc`)은 질의 fallback.

## 14. lore 도메인 (경량)

`lore` 는 로어북(`/Users/flitto/Code/StarGate/docs/lore/`) 확장을 위한 경량 분기다. Zod 스키마·어댑터·FK 매칭·DB payload 가 **모두 없다**. 대화형으로 카테고리와 본문을 수집해 frontmatter 포함 MD 파일을 해당 카테고리 폴더에 쓴다.

### 14-1. 수집 순서

1. **카테고리 선택**
   ```
   AskUserQuestion
   question: "어떤 카테고리에 작성하시겠습니까?"
   options: ["history", "ideology", "concept", "faction", "place", "기타"]
   ```
   - "기타" 선택 시 자유 입력 받고 kebab-case 검증 (`^[a-z][a-z0-9-]*$`). 통과 못하면 재질의.
2. **제목** — 한국어 제목 + 필요 시 괄호 안 영문 병기 (예: `이상 현상 (Anomaly)`)
3. **slug 자동 생성** — 제목을 kebab-case 로 변환해 제안 (예: `이상 현상 (Anomaly)` → `anomaly`). 사용자 수정 허용.
4. **tags (optional)** — 쉼표 구분 문자열 → 배열. 빈값이면 `tags` 필드 생략.
5. **본문** — 긴 산문 텍스트 한 번에 수집. 섹션 구성(`## 요약`, `## 본문`, `## 관련 항목`)은 사용자가 본문에 직접 포함하거나, 수집 후 skill 이 최소 뼈대만 감싸 저장한다 (사용자 선호 확인).

### 14-2. 저장 경로

- `/Users/flitto/Code/StarGate/docs/lore/{category}/{slug}.md`
- 폴더 없으면 `Bash("mkdir -p /Users/flitto/Code/StarGate/docs/lore/{category}")` 로 생성
- 동일 slug 파일이 이미 존재하면 overwrite 확인 질문 (취소 시 종료)

### 14-3. frontmatter

```yaml
---
title: <사용자 입력 한국어 제목>
category: <category>
tags: [tag1, tag2]         # 있을 때만
updated: <ISO YYYY-MM-DD>  # 현재 날짜
source: create-lore
---
```

- `tags` 는 비어있으면 필드 전체 생략
- `updated` 는 ISO 날짜 (시간 생략 허용)

### 14-4. 승인 게이트

MD 파일 쓰기 **직전** 미리보기 (frontmatter + 본문 전체)를 대화에 출력한 뒤:

```
AskUserQuestion
question: "아래 내용으로 파일을 작성할까요?"
options: ["작성", "수정", "취소"]
```

- "수정" → 어느 부분(제목/slug/tags/본문/카테고리)을 고칠지 질의 → 해당 필드 재수집 → 다시 미리보기
- "취소" → 산출물 없이 종료

섹션 8 의 게이트 절차와 동일. Zod 재검증만 생략된다.

### 14-5. 검증 리포트

Zod 검증이 없으므로 최소 정보만 출력:

```json
{
  "domain": "lore",
  "category": "history",
  "slug": "battle-of-dawn",
  "filePath": "/absolute/path/to/docs/lore/history/battle-of-dawn.md",
  "wordCount": 842
}
```

- `wordCount` 는 본문(frontmatter 제외) 공백 기준 토큰 수

### 14-6. 제약

- **FK 매칭 없음** — `notableMembers` / `factionCode` 등 검증 없음
- **DB payload 없음** — `scripts/seed-payloads/` 에도 쓰지 않음
- **파일 쓰기만** — 커밋 금지 (사용자가 별도 `/auto-commit`)
- **README.md 인덱스는 자동 갱신하지 않음** — 새 문서 링크는 사용자가 수동 추가하거나, 후속 개선에서 별도 기능으로 다룬다
- **이 분기에서는 §3.5 로어북 컨텍스트 전체 Read 생략 가능** — README 와 동일 카테고리 파일 목록 Read 로 중복 slug 회피 목적에만 활용
- **lore 이외 도메인 작성 중에는 `docs/lore/` 를 Write 하지 않는다** (섹션 9 제약 참조)

## Behavioral Rules

1. **템플릿/스키마가 단일 진실** — 필드 이름/제약은 Phase 1 파일에서 직접 Read. 추측 금지.
2. **평탄 YAML 준수** — frontmatter에 중첩 객체 생성 금지. 복합 구조는 body 섹션에 서술.
3. **승인 전 Write 금지** — 사용자 승인 게이트 통과 후에만 파일 작성.
4. **구 체계 파일 보호** — `docs/spec/npc/npc-registrar-spec.md`, `docs/civil-society/`, `docs/military/`, `docs/wolrd-council/`는 절대 수정/삭제 금지.
5. **커밋 금지** — 파일 생성만. 커밋은 사용자 몫.
