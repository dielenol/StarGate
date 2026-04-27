# 캐릭터 시트 lore/play 분리 — 작업 인계 문서

**작성일**: 2026-04-27
**상태**: Phase 1~6 구현 완료, Dual Review 완료, **Review-Fix 라운드 1 진행 직전**에서 중단
**다음 도구**: Codex (또는 다른 어시스턴트) 에서 이어 작업

---

## 1. 작업 목표

`/erp/characters` 페이지(캐릭터 — 게임 시트)와 `/erp/personnel` 페이지(신원조회 — 세계관 인물 dossier)의 **데이터 책임 분리**.

채택된 옵션: **옵션 B — 단일 컬렉션 유지, sheet 안의 sub-document만 분리**

```ts
// Before
{ sheet: { name, hp, san, equipment, abilities, ... } }

// After
{
  lore: { name, gender, age, height, weight, appearance, personality, background, quote, mainImage, posterImage?, loreTags?, appearsInEvents?, nameNative?, nickname?, nameEn?, roleDetail?, notes? },
  play?: { className, hp, hpDelta, san, sanDelta, def, defDelta, atk, atkDelta, abilityType?, weaponTraining: string[], skillTraining: string[], credit, equipment, abilities }  // AGENT 전용
}
```

- **AGENT** = `CharacterBase + lore + play`
- **NPC** = `CharacterBase + lore` (play 부재)
- `factionCode` / `institutionCode` 가 root(`CharacterBase`)로 승격
- `loreTags` / `appearsInEvents` 가 `lore` 영역으로 이동

---

## 2. 사용자 확정 변경점 (시트 예시 분석 결과)

플레이어 시트 예시(쿠즈하 캐릭터)에서 도출된 6가지:

1. **체중(weight) 재분류** — `play` → `lore` (인물 신상)
2. **이름 4-tier**: `name` (한국어) + `nameNative` (한자/원어) + `nickname` (별칭) + `nameEn` (NPC 호환)
3. **HP/SAN/DEF/ATK delta 분리** — 옵션 C 채택: `hp` (실제 게임값) + `hpDelta` (보정 메모, default 0). 시트 표기 `"20 (-30)"` 형태
4. **Equipment 추가 필드**: `ammo` (탄환), `grip` (파지) — optional
5. **Ability 7-슬롯 정형화** — `slot: "C1"|"C2"|"C3"|"P"|"A1"|"A2"|"A3"` 필수. 빈 슬롯도 배열 포함. `code` 와 `slot` 의미 분리
6. **`weaponTraining` / `skillTraining` 배열화** — `string` → `string[]`

---

## 3. 완료된 Phase

### Phase 1 — shared-db 시트 구조 정의 ✅

**변경 파일**:
- [packages/shared-db/src/types/character.ts](../../packages/shared-db/src/types/character.ts) — `LoreSheet`/`PlaySheet`/`AbilitySlot` 신설, `SheetBase`/`AgentSheet`/`NpcSheet` 폐기. `Equipment` ammo/grip, `Ability` slot 필수
- [packages/shared-db/src/schemas/npc.schema.ts](../../packages/shared-db/src/schemas/npc.schema.ts) — `loreSheetSchema` 신설
- [packages/shared-db/src/schemas/frontmatter.ts](../../packages/shared-db/src/schemas/frontmatter.ts) — `toDbNpc` 출력 `sheet:{}` → `lore:{}`
- [packages/shared-db/src/crud/characters.ts](../../packages/shared-db/src/crud/characters.ts) — 화이트리스트 4셋 분리: `ALLOWED_LORE_FIELDS_ADMIN/PLAYER`, `ALLOWED_PLAY_FIELDS_ADMIN/PLAYER`
- [packages/shared-db/src/types/index.ts](../../packages/shared-db/src/types/index.ts), [packages/shared-db/src/index.ts](../../packages/shared-db/src/index.ts) — export 갱신
- 테스트 파일 갱신: `packages/shared-db/src/schemas/__tests__/*.mjs`, `crud/__tests__/*.mjs`

**검증**: `pnpm build` PASS, `node --test ...` 82 pass / 1 skipped / 0 fail

### Phase 2 — 마이그레이션 스크립트 ✅

**신규 파일**: [StarGateV2/scripts/migrate-character-sheet-to-lore-play.ts](../scripts/migrate-character-sheet-to-lore-play.ts)

특징:
- dry-run 기본 + `--execute --yes` opt-in 2단계
- idempotent (3-way 상태 분기: lore-only-skip / partial-cleanup-sheet / full-migrate)
- abilities 7-슬롯 자동 할당 (인덱스 기반: 0→C1, 1→C2, ..., 6→A3)
- weaponTraining/skillTraining string → string[] (쉼표 split + trim)
- delta 4종 default 0
- 검증 invariant: lore 보유, sheet 부재, AGENT 는 play 보유, weight 가 string, weaponTraining/skillTraining 배열, abilities[i].slot 정의

**package.json 추가**:
```json
"migrate:character-sheet": "node --experimental-strip-types scripts/migrate-character-sheet-to-lore-play.ts",
"premigrate:character-sheet": "pnpm --filter @stargate/shared-db build"
```

**상태**: 스크립트 작성됨, **실제 DB write 미실행**. 사용자 승인 후 실행 예정.

### Phase 3·4·5·6 — 라우트/훅/권한/create-lore ✅

**핵심 변경**:

**3-A 라우트** (`/erp/characters` AGENT 전용 강제):
- [page.tsx](../app/(erp)/erp/characters/[id]/page.tsx) — NPC 진입 시 `redirect('/erp/personnel/${id}')`
- [CharacterDetailClient.tsx](../app/(erp)/erp/characters/[id]/CharacterDetailClient.tsx) — `Character` → `AgentCharacter` 좁힘, ABILITIES 7-슬롯 그리드, EQUIPMENT 에 ammo/grip 표기
- [CharacterEditForm.tsx](../app/(erp)/erp/characters/[id]/CharacterEditForm.tsx) — AGENT 전용. lore/play 분리 폼, 7-슬롯 ability 고정, weapon/skillTraining 태그 입력
- [PosterHero.tsx](../app/(erp)/erp/characters/[id]/PosterHero.tsx) — props `agentSheet?: AgentSheet` → `playSheet?: PlaySheet`. delta 표기 `"20 (-30)"`

**3-B `/erp/personnel`** (lore-only readonly):
- [DossierClient.tsx](../app/(erp)/erp/personnel/[id]/DossierClient.tsx) — **play 섹션 완전 제거** (HP/SAN/DEF/ATK/equipment/abilities 카드 통째 삭제). lore 강화

**3-C lib/**:
- [lib/personnel.ts](../lib/personnel.ts) — `redactSheetBase` 폐기, `redactLore` + `redactPlay` 분리. clearance 마스킹 단위가 lore/play
- [lib/db/characters.ts](../lib/db/characters.ts) — projection sheet → lore
- [lib/character/diff.ts](../lib/character/diff.ts) — `AUDIT_EXCLUDED_DOT_PATHS` 비움
- [lib/parsers/character-text.ts](../lib/parsers/character-text.ts) — Discord 파서 결과 lore/play 분배

**3-D API**:
- [app/api/erp/characters/[id]/route.ts](../app/api/erp/characters/[id]/route.ts) PATCH — sub-document 별 화이트리스트 합성, admin/player 분기
- [revert/route.ts](../app/api/erp/characters/[id]/change-logs/[logId]/revert/route.ts) — 동일 합성

**4 훅**:
- [hooks/queries/useCharactersQuery.ts](../hooks/queries/useCharactersQuery.ts) — `characterKeys.agent.{all,byTier,byId}` / `personnelKeys.{all,byId}` 분리
- [hooks/mutations/useCharacterMutation.ts](../hooks/mutations/useCharacterMutation.ts) — `useUpdatePlayMutation` + `useUpdateLoreMutation` (양쪽 invalidate)

**5 RBAC**:
- [lib/auth/rbac.ts](../lib/auth/rbac.ts) — `canEditPlay` (admin AGENT만), `canEditLore` (admin / owner-7필드)

**6 create-lore**:
- `~/.claude/skills/create-lore/SKILL.md` — frontmatter 표 갱신, body 매핑 sheet → lore
- [docs/spec/templates/npc.template.md](spec/templates/npc.template.md) — 신규 키 (nameNative, nickname, weight)
- [docs/spec/README.md](spec/README.md) — NPC frontmatter 표 신규 행

**검증**: `pnpm build` ✓ (46 페이지), `pnpm lint` ✓ (0 errors), `npx tsc --noEmit` ✓ (0 errors)

---

## 4. Dual Review 완료 — 합의된 BLOCKING 6개 (다음 작업)

reviewer-strict + reviewer-pragmatic 합의. **본 PR 머지 전 반드시 fix**.

### #1 [P1] clearance 마스킹 캐시 누설

**파일**:
- [hooks/queries/useCharactersQuery.ts:43-48, 72-79, 121-128](../hooks/queries/useCharactersQuery.ts)
- [app/api/erp/characters/route.ts:15-49](../app/api/erp/characters/route.ts)

**문제**:
- `useCharacters` (deprecated) 와 `usePersonnelQuery` 가 같은 `personnelKeys.all` 키 + 같은 `/api/erp/characters` 엔드포인트 사용
- SSR 단계는 `filterCharacterForList(c, clearance)` 로 마스킹 처리 ([app/(erp)/erp/personnel/page.tsx:21-25](../app/(erp)/erp/personnel/page.tsx))
- `staleTime: 2분` 후 background refetch → `/api/erp/characters` 가 raw 데이터 반환 → 캐시 교체 → clearance 미달 사용자에게 `lore.name` / `appearance` / `background` 등 노출

**Fix 방향**: `/api/erp/personnel` 같은 마스킹 전용 엔드포인트 신설 + `usePersonnelQuery` fetcher 변경. `useCharacters` deprecated alias 는 본 PR 에서 제거 (ASK C default 채택).

### #2 [P1] audit 라벨 sheet.X 잔존

**파일**:
- [app/(erp)/erp/characters/[id]/ChangeLogsPanel.tsx:38-71](../app/(erp)/erp/characters/[id]/ChangeLogsPanel.tsx)
- [app/(erp)/erp/characters/[id]/DiffPreviewModal.tsx:45-78, 81-85](../app/(erp)/erp/characters/[id]/DiffPreviewModal.tsx)

**문제**:
- 두 파일의 `FIELD_LABELS` 매핑이 모두 `sheet.X` 키만 보유. 본 PR 이후 새 audit/diff entry 의 dot path 는 `lore.X` / `play.X` → 매핑 미적중 → 영문 dot path 그대로 노출
- `DiffPreviewModal` 의 `IMAGE_FIELDS` (`previewImage`, `sheet.mainImage`, `sheet.posterImage`) 도 동일 — admin 이 `lore.mainImage` 변경 시 IMAGE 분류 미적용
- 과거 sheet.X audit 로그 잔존 → 둘 다 유지 필요

**Fix**: `lore.X` / `play.X` 키 추가 + `sheet.X` 호환 보존. 라벨 매핑은 두 파일에 거의 동일 복제 → **공용 모듈 추출 권장** (예: `app/(erp)/erp/characters/[id]/_field-labels.ts` 또는 `lib/character/field-labels.ts`).

```ts
const FIELD_LABELS: Record<string, string> = {
  // root
  codename: "코드네임", tier: "분류", role: "역할",
  isPublic: "공개 여부", ownerId: "소유자 ID",
  previewImage: "프리뷰 이미지",
  factionCode: "세력", institutionCode: "기관",
  // lore (신)
  "lore.name": "이름",
  "lore.nameNative": "원어 표기",
  "lore.nickname": "별칭",
  "lore.nameEn": "이름(EN)",
  "lore.gender": "성별", "lore.age": "나이",
  "lore.height": "신장", "lore.weight": "체중",
  "lore.mainImage": "메인 이미지",
  "lore.posterImage": "포스터 이미지",
  "lore.quote": "인용문",
  "lore.appearance": "외모",
  "lore.personality": "성격",
  "lore.background": "배경",
  "lore.roleDetail": "역할 상세",
  "lore.notes": "비고",
  "lore.loreTags": "태그",
  "lore.appearsInEvents": "등장 이벤트",
  // play (신)
  "play.className": "직군",
  "play.hp": "HP", "play.hpDelta": "HP Δ",
  "play.san": "SAN", "play.sanDelta": "SAN Δ",
  "play.def": "DEF", "play.defDelta": "DEF Δ",
  "play.atk": "ATK", "play.atkDelta": "ATK Δ",
  "play.abilityType": "능력 타입",
  "play.credit": "크레딧",
  "play.weaponTraining": "무기 훈련",
  "play.skillTraining": "기술 훈련",
  "play.equipment": "장비",
  "play.abilities": "어빌리티",
  // sheet.* 호환 (과거 audit 로그)
  "sheet.name": "이름 (구)",
  "sheet.appearance": "외모 (구)",
  // ... 기존 키 보존
};

const IMAGE_FIELDS = new Set<string>([
  "previewImage",
  "lore.mainImage",
  "lore.posterImage",
  "sheet.mainImage",  // 호환
  "sheet.posterImage",
]);
```

### #4 [P2] factionCode / institutionCode 폼 입력 누락

**파일**:
- [app/(erp)/erp/characters/new/CharacterCreateForm.tsx:67-188, 248-279](../app/(erp)/erp/characters/new/CharacterCreateForm.tsx)
- [app/(erp)/erp/characters/[id]/CharacterEditForm.tsx:125-162, 294-349](../app/(erp)/erp/characters/[id]/CharacterEditForm.tsx)

**문제**: root 로 승격된 `factionCode`/`institutionCode` 가 두 폼에서 입력 항목으로 노출되지 않음. CreateForm 의 `department` Select 가 FACTIONS 코드도 노출하지만 채워지는 필드는 `department` 1개만. EditForm 의 `ADMIN_DIFF_FIELDS` 에도 누락.

**Fix**:
- 두 폼에 `factionCode` / `institutionCode` 입력 필드 추가 (FACTIONS / INSTITUTIONS const 에서 옵션 도출)
- EditForm 의 `ADMIN_DIFF_FIELDS` / `buildBody()` / `computeFormDiff()` 에 두 키 포함
- department Select 와 분리 처리 (자동 매핑보다 명시적 3개 필드)

### #5 [P2] 마이그레이션 스크립트 case 1 cleanup 누락

**파일**: [scripts/migrate-character-sheet-to-lore-play.ts:475-499](../scripts/migrate-character-sheet-to-lore-play.ts)

**문제**:
- `planForDoc` case 1 (lore O / sheet X) 에서 `action: "skip"` — 그러나 root 의 `loreTags` / `appearsInEvents` 잔존 가능
- case 2 (lore O / sheet O) 에서 `unsetKeys` 가 sheet 만 정리, lore 누락 string 필수 필드 (weight 등) 보강 부재
- invariant 검증에서 실패 가능

**Fix**:
```ts
// case 1 보강
if (hasLore && !hasSheet) {
  const unsetKeys: string[] = [];
  for (const key of ROOT_TO_LORE_META_KEYS) {
    if (doc[key] !== undefined) unsetKeys.push(key);
  }
  if (unsetKeys.length === 0) {
    return { codename: doc.codename, type: doc.type,
      action: DRY_RUN ? "예상 skip" : "skip",
      reason: "이미 마이그레이션됨" };
  }
  return {
    codename: doc.codename, type: doc.type,
    action: DRY_RUN ? "예상 cleanup-sheet" : "cleanup-sheet",
    reason: "lore 보유 + root 메타 잔존",
    unsetKeys,
  };
}
```

case 2 에서도 lore 필수 필드(weight 등) 누락 시 `setPayload` 로 빈 문자열 채움 보강.

### #7 [P2] PATCH buildBody 빈 string 정규화 누락

**파일**: [CharacterEditForm.tsx:307-348](../app/(erp)/erp/characters/[id]/CharacterEditForm.tsx)

**문제**: admin 모드에서 `nameNative=""`, `nickname=""`, `posterImage=""`, `abilityType=""` 등 빈 string 그대로 PATCH 송신 → DB 에 빈 문자열 영속화. shared-db 어댑터 (`toDbNpc`) 의 `emptyToUndefined` 가 PATCH 라우트에는 미적용.

**Fix**: `buildBody()` 에서 admin 패스 빈 string optional 필드는 제외 또는 null 명시.

```ts
function emptyToUndefined(s: string): string | undefined {
  return s.trim() === "" ? undefined : s;
}
// admin lore
lore: {
  name,
  nameNative: emptyToUndefined(nameNative),
  nickname: emptyToUndefined(nickname),
  posterImage: emptyToUndefined(posterImage),
  // ...
},
```

### #10 [P2] PATCH 라우트 — NPC self-edit 권한 boundary

**파일**: [app/api/erp/characters/[id]/route.ts:120-163](../app/api/erp/characters/[id]/route.ts), [lib/auth/rbac.ts:111-129](../lib/auth/rbac.ts)

**문제**: `canEditPlay` 는 `before.type !== "AGENT"` 면 false. 그러나 `canEditLore` 는 type 체크 없음 → player 가 owner 인 NPC 에 lore 7필드 패치 가능 (의도되지 않은 부수효과).

**Fix**: `canEditLore` 에 type 체크 추가하거나 PATCH 라우트에 `before.type === "NPC" && isPlayer ? 403` 가드.

---

## 5. 사용자 결정 ASK — default 채택 (이대로 본 PR 에 반영)

| | 항목 | 결정 |
|---|-----|------|
| A | Player `weight` 편집 권한 | **추가** — `ALLOWED_LORE_FIELDS_PLAYER` 에 weight 포함. `CharacterEditForm` player 모드에서도 활성. 7필드 → 8필드 |
| B | `loreMd`/`rawText`/`source` PATCH 화이트리스트 | **누락 유지** — `/create-lore` 흐름 전용. PATCH 로 직접 수정 불가 |
| C | `useCharacters` deprecated alias 제거 | **본 PR 에서 제거** — #1 fix 와 결합 (호출처 확인 후 정리) |
| D | POST API lore/play 누락 검증 | **본 PR 에서 추가** — admin 이 두 sub-document require. zod 스키마 적용 |

---

## 6. 별도 PR 권고 (P3 downgrade — 본 PR 에 포함 X)

다음은 strict 가 짚었으나 pragmatic 이 downgrade 했거나 별도 cleanup PR 권고:

- **#3** `ROOT_ALLOWED_FIELDS_ADMIN` shared-db 추출 (현재 두 라우트에 inline 중복)
- **#6** `redactLore` optional 필드를 REDACTED 로 강제 채움 (검색 부작용)
- **#8** `world/player` view 매핑 — 빈 객체 truthy 통과 + 신규 lore 필드 view 누락
- **#9** `useCharacters` deprecated alias 캐시 키 공유 (#1 fix 의 부수 처리로 자연 해소)
- **#11** `CharacterDetailClient.AgentSections` 동일 slot 중복 silent 손실
- **#12** `CharacterDetailPage` Type assertion (narrowing 부족)
- **#13** `ImportClient` Discord 인입 시 `agentLevel` 누락
- **#14** `ProfileClient` NPC 카드 클릭 redirect (NPC 가 owner 화면에 노출)
- **#15** `CharacterCreateForm` department Select 의 faction/institution 코드 혼재
- **#16** 마이그레이션 스크립트 production DB 가드 부족

---

## 7. 다음 단계 (Codex / 다른 어시스턴트가 이어받을 작업)

### A. Review-Fix 라운드 1 (BLOCKING 6개 + ASK A/C/D)

순서:
1. **#2 audit 라벨 fix** — `FIELD_LABELS` / `IMAGE_FIELDS` 에 `lore.X` / `play.X` 추가, `sheet.X` 호환 보존. 두 파일에 동일 매핑 → 공용 모듈 추출 권장
2. **#1 캐시 누설 fix** — `/api/erp/personnel/route.ts` 신설 (마스킹 적용), `usePersonnelQuery` fetcher 변경, `useCharacters` deprecated alias 제거 + 모든 호출처 정리
3. **#4 factionCode/institutionCode 폼 입력** — 두 폼 + `ADMIN_DIFF_FIELDS`
4. **#5 마이그레이션 스크립트 case 1/2 보강**
5. **#7 buildBody emptyToUndefined**
6. **#10 NPC self-edit 가드**
7. **ASK A** — `weight` 를 `ALLOWED_LORE_FIELDS_PLAYER` 에 추가 ([packages/shared-db/src/crud/characters.ts:213-221](../../packages/shared-db/src/crud/characters.ts:213))
8. **ASK D** — POST `/api/erp/characters` 에 lore/play require 검증 추가

### B. 검증

```bash
cd /Users/flitto/Code/StarGate/StarGateV2
npx tsc --noEmit                               # 0 errors
pnpm lint                                      # 0 errors, 0 warnings
pnpm build                                     # 46 페이지 성공

cd /Users/flitto/Code/StarGate/packages/shared-db
pnpm build && node --test src/schemas/__tests__/*.test.mjs src/crud/__tests__/*.test.mjs
# 82 pass / 1 skipped / 0 fail (현재 baseline)
```

### C. validator 호출 (CLAUDE.md overseer 패턴)

state-consistency / 마이그레이션 idempotency 변경이라 **validator agent 필수**. fix 적용 후:
- 마이그레이션 스크립트 idempotency (재실행 시 변경 0)
- 캐시 race condition (lore mutation 시 두 캐시 invalidation 순서)
- 권한 boundary (admin/player/owner 3-way 매트릭스)

### D. 마이그레이션 실행 (사용자 confirm 후)

```bash
cd /Users/flitto/Code/StarGate/StarGateV2

# 1. dry-run
pnpm run migrate:character-sheet

# 2. 결과 확인 후 실제 실행
pnpm run migrate:character-sheet -- --execute --yes
```

호스트: `cluster0.gmmez89.mongodb.net` (production). idempotent 라 재실행 안전.

### E. 후속 작업 (별도 PR)

1. 사무총장 NPC 작성 — **사용자가 직접 처리 예정** (codename 미정, 본문 정보 필요)
2. P3 cleanup (#3, #6, #8, #11~#16) — 별도 cleanup PR

---

## 8. 주요 변경 파일 목록 (검증용)

```
packages/shared-db/src/
├── types/character.ts                     [Phase 1] LoreSheet/PlaySheet/AbilitySlot
├── types/change-log.ts                    [Phase 1] dot path 주석
├── types/index.ts                         [Phase 1] export 갱신
├── index.ts                               [Phase 1] re-export
├── schemas/npc.schema.ts                  [Phase 1] loreSheetSchema
├── schemas/frontmatter.ts                 [Phase 1] toDbNpc lore 출력
├── crud/characters.ts                     [Phase 1] 화이트리스트 4셋
├── crud/change-logs.ts                    [Phase 1] dot path 갱신
├── crud/sessions.ts                       [Phase 1] 호환 정리
├── schemas/__tests__/*.mjs                [Phase 1] 테스트 갱신
└── crud/__tests__/*.mjs                   [Phase 1] 테스트 갱신

StarGateV2/
├── scripts/migrate-character-sheet-to-lore-play.ts  [Phase 2] 신규
├── package.json                           [Phase 2] migrate scripts 추가
├── types/character.ts                     [Phase 3] re-export
├── lib/db/characters.ts                   [Phase 3] projection
├── lib/personnel.ts                       [Phase 3] redactLore/redactPlay
├── lib/character/diff.ts                  [Phase 3] AUDIT_EXCLUDED 비움
├── lib/parsers/character-text.ts          [Phase 3] LABEL_TO_FIELD 라우팅
├── lib/auth/rbac.ts                       [Phase 5] canEditPlay/canEditLore
├── hooks/queries/useCharactersQuery.ts    [Phase 4] characterKeys.agent / personnelKeys
├── hooks/mutations/useCharacterMutation.ts [Phase 4] useUpdatePlayMutation/useUpdateLoreMutation
├── app/(erp)/erp/page.tsx                 [Phase 3] 대시보드
├── app/(erp)/erp/profile/page.tsx         [Phase 3] 프로필
├── app/(erp)/erp/profile/ProfileClient.tsx [Phase 3]
├── app/(erp)/erp/characters/page.tsx      [Phase 3]
├── app/(erp)/erp/characters/CharactersClient.tsx [Phase 3]
├── app/(erp)/erp/characters/[id]/page.tsx [Phase 3] NPC redirect
├── app/(erp)/erp/characters/[id]/CharacterDetailClient.tsx [Phase 3] AGENT 좁힘, 7-슬롯
├── app/(erp)/erp/characters/[id]/CharacterEditForm.tsx [Phase 3] 폼 분리
├── app/(erp)/erp/characters/[id]/PosterHero.tsx [Phase 3] playSheet props
├── app/(erp)/erp/characters/[id]/ChangeLogsPanel.tsx [⚠ #2 fix 필요]
├── app/(erp)/erp/characters/[id]/DiffPreviewModal.tsx [⚠ #2 fix 필요]
├── app/(erp)/erp/characters/new/CharacterCreateForm.tsx [⚠ #4 fix 필요]
├── app/(erp)/erp/admin/characters/import/ImportClient.tsx [Phase 3]
├── app/(erp)/erp/personnel/PersonnelClient.tsx [Phase 3]
├── app/(erp)/erp/personnel/[id]/DossierClient.tsx [Phase 3] play 섹션 제거
├── app/(erp)/erp/personnel/_components/PersonnelCard.tsx [Phase 3]
├── app/(public)/world/player/page.tsx     [Phase 3, ⚠ #8 별도 PR]
├── app/api/erp/characters/[id]/route.ts   [Phase 3, ⚠ #7 #10 fix 필요]
├── app/api/erp/characters/[id]/change-logs/[logId]/revert/route.ts [Phase 3]
├── docs/spec/README.md                    [Phase 6] frontmatter 표
├── docs/spec/templates/npc.template.md    [Phase 6] 신규 키
└── docs/spec/npc/registrar.md             [별도] HQ subUnit 적용

~/.claude/skills/create-lore/SKILL.md      [Phase 6] frontmatter 표

[관련 별도 작업 — 본 인계와 무관하지만 같은 working tree]
- INSTITUTIONS const 에 SECRETARIAT.subUnits 의 HQ 추가 (이미 적용 + DB seed 완료)
- registra-bot/ 변경사항 (이번 작업 무관, 별도 commit 권장)
- registra-bot 2.zip 등 untracked artifact (정리 필요)
```

---

## 9. 메모리 / 컨텍스트

- **사용자 환경**: macOS Darwin 24.5.0, zsh, pnpm
- **DB**: MongoDB Atlas — `cluster0.gmmez89.mongodb.net`, DB name `stargate`
- **모노레포**: `packages/shared-db` (workspace) + `StarGateV2` (Next.js 16 앱)
- **현재 브랜치**: `main` (작업 브랜치 분리되어 있지 않음 — Codex 에서 작업 시 새 브랜치 권장: `feature/character-sheet-split`)
- **커밋 컨벤션**: `<type>(<scope>): <한국어 제목>` + 불릿 본문. scope: `novusweb` (StarGateV2) / `shared-db` (packages/shared-db) / `all` (양쪽). 자동 서명 금지
- **Phase 1 의 implementer 보고서 95 tests pass** — 이후 사용자 직접 수정으로 character.ts 가 약간 갱신됨 (의도된 변경, 그대로 유지)
- **Phase 3 implementer 보고서**: `pnpm build` ✓ (46 페이지), `pnpm lint` ✓ (0 errors), `npx tsc --noEmit` ✓ (0 errors)

---

## 10. 인계 시점의 작업 흐름 (어디까지 진행됐는지)

```
[ 완료 ]
└─ Phase 1 (shared-db) ✓
└─ Phase 2 (마이그레이션 스크립트 작성) ✓
└─ Phase 3·4·5·6 (라우트/훅/권한/create-lore) ✓
└─ Quick gate (typecheck + lint + tests) ✓
└─ Sequential dual review ✓
   ├─ reviewer-strict — P1 2건, P2 8건, P3 6건, ASK 4건
   └─ reviewer-pragmatic — BLOCKING 6개 합의, P3 downgrade, ASK default 제안

[ 다음 단계 — Codex 에서 이어서 ]
└─ Review-Fix 라운드 1
   ├─ BLOCKING #1, #2, #4, #5, #7, #10 fix
   ├─ ASK A (weight player 권한), C (useCharacters 제거), D (POST 검증) 반영
   └─ 검증 (typecheck + lint + build + shared-db tests)
└─ validator 호출 (state-consistency / idempotency / 권한 boundary)
└─ 사용자 confirm 후 마이그레이션 실행 (dry-run → write)
└─ 커밋 + PR (또는 직접 main 머지)

[ 별도 PR ]
└─ P3 cleanup (#3, #6, #8, #11~#16)
└─ 사무총장 NPC 작성 (사용자 직접)
```

---

이 문서를 읽고 Codex 에서 그대로 이어 작업하면 됩니다. 의문점이 있으면 위 파일/라인을 직접 Read 해서 확인하세요. 모든 변경은 이미 working tree 에 있어 `git diff` 로도 볼 수 있습니다.
