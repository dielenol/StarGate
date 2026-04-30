# StarGateV2 전체 코드베이스 리뷰 (2026-04-30)

> Overseer 프로토콜로 수행한 5-Wave Sequential Dual Review (reviewer-strict + reviewer-pragmatic) 합의 결과.
> 운영 컨텍스트: TRPG 운영진 ~수십명이 사용하는 내부 ERP. 외부 노출 작음, GM 권한 = 데이터 풀 액세스.

## 리뷰 범위

| Wave | 도메인 | 파일 수 |
|------|--------|---------|
| 1 | 인증/RBAC + Middleware + (erp)layout | 5 |
| 2 | DB 레이어 (lib/db/*) | 11 |
| 3 | API Routes (app/api/erp/**) | 26 |
| 4 | TanStack Query hooks + 클라이언트 흐름 | 17 + 4 |
| 5 | 대형 클라이언트 컴포넌트 + dangerouslySetInnerHTML | 10 |

총 파일: 297, TS/TSX LOC: 26,487

## 합의 우선순위 분포

- **P1 (머지 전 필수): 9건**
- **P2 (다음 사이클 필수): 9건**
- **P3 (정리/유지보수): 다수**
- **ASK (정책 확인): 5건**

---

## P1 — 머지 전 반드시 처리

### [P1-1] DossierClient: PATCH 후 캐시 invalidate 누락
- **파일**: [DossierClient.tsx:395-411](app/(erp)/erp/personnel/[id]/DossierClient.tsx#L395)
- **현상**: `fetch PATCH` 직후 `router.refresh()`만 호출. TanStack 캐시(`personnelKeys.all`, `characterKeys.all`)는 stale 잔존. CLAUDE.md "router.refresh 회피" 컨벤션 위반.
- **위험**: GM이 dossier 편집 → personnel 카탈로그 복귀 시 staleTime 2분 동안 옛 데이터 노출.
- **수정안** (LOC ~5):
  ```tsx
  // handleSaveEdit 내 router.refresh() 라인 교체
  await queryClient.invalidateQueries({ queryKey: characterKeys.all });
  await queryClient.invalidateQueries({ queryKey: personnelKeys.all });
  setIsEditing(false);
  ```

### [P1-2] CharacterDetailClient.onSaved에 personnelKeys invalidate 누락
- **파일**: [CharacterDetailClient.tsx:128](app/(erp)/erp/characters/[id]/CharacterDetailClient.tsx#L128)
- **현상**: lore 편집 후 `characterKeys.all`만 invalidate. lore가 personnel dossier에도 영향을 주는데 `personnelKeys.*` 누락.
- **수정안** (LOC ~3):
  ```tsx
  onSaved={async () => {
    setIsEditing(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: characterKeys.all }),
      queryClient.invalidateQueries({ queryKey: personnelKeys.all }),
    ]);
  }}
  ```

### [P1-3] CharacterEditForm/DossierClient: 빈 문자열 patch가 다른 필드를 덮어씀 (race window 데이터 손실)
- **파일**:
  - [DossierClient.tsx:364-411](app/(erp)/erp/personnel/[id]/DossierClient.tsx#L364) `handleSaveEdit`
  - [CharacterEditForm.tsx:319-378](app/(erp)/erp/characters/[id]/CharacterEditForm.tsx#L319) `buildBody` (admin 모드)
- **현상**:
  - 두 폼 모두 **사용자가 안 건드린 lore 필드**를 PATCH body에 그대로 포함 (initial draft 빈 문자열 / 0 / [] 그대로 전송).
  - server `buildUpdatePatch`는 `value !== undefined`만 체크 → `$set: { 'lore.X': '' }` 발생.
  - **race 시나리오**: GM-A 편집 시작 → GM-B(또는 Claude 통짜 스크립트)가 같은 캐릭터 lore.notes 업데이트 → GM-A 다른 필드만 수정 후 저장 → GM-A 옛 빈 lore.notes가 GM-B 변경분 덮어씀.
- **위험**: 운영진 수십명 + Claude 통짜 업데이트 빈번한 환경에서 **영구적 데이터 손실**.
- **수정안 (정공법)**: client-side diff 기반 patch — `computeFormDiff` 결과의 변경된 필드만 body에 포함.
  ```tsx
  function buildPatchBody(diff: DiffEntry[]): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const { field, after } of diff) {
      setByPath(patch, field, after); // dot path → nested object
    }
    return patch;
  }
  ```
  LOC ~30. CharacterEditForm은 이미 diff를 계산하므로 server payload만 그것 기반으로 재구성.
- **임시 가드 (LOC ~5)**: `originalIsUndefined && newIsEmpty`인 경우 patch에서 제외. 단, 사용자가 의도적으로 비우는 케이스 차단 가능 → 정공법 권장.

### [P1-4] credits POST: userId 검증 + 음수 가드 + 서버사이드 displayName 누락
- **파일**: [credits/route.ts:75-86](app/api/erp/credits/route.ts#L75)
- **현상**:
  - `body.userId` 형식 검증 없음 → ObjectId 아닌 문자열도 그대로 저장 → 잔액 조회 시 매칭 안 되어 trash row 발생.
  - `body.userName` 클라이언트 신뢰 (audit log 신뢰성 저하).
  - 음수 잔액 가드 없음 → `ADMIN_DEDUCT`로 임의 큰 음수 amount 가능.
  - read-modify-write race: 두 동시 PATCH 시 lost update.
- **위험**: 운영진이 잘못된 userId 입력 시 영구적 trash row, 잔액 일관성 깨짐.
- **수정안** (LOC ~30):
  ```ts
  if (!isValidObjectId(body.userId)) {
    return NextResponse.json({ error: "userId 형식 오류" }, { status: 400 });
  }
  const target = await findUserById(body.userId);
  if (!target) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }
  // userName은 서버에서 결정
  const userName = target.displayName;
  // 음수 가드 (정책 확인 후)
  if (newBalance < 0 && body.type !== "ADMIN_DEDUCT_ALLOWED_NEGATIVE") {
    return NextResponse.json({ error: "잔액 음수 불가" }, { status: 400 });
  }
  ```
  race condition은 shared-db `addCredit`을 `findOneAndUpdate` + `$inc` 또는 `withTransaction` 으로 재설계 필요 — **별도 PR (shared-db 본체 변경)**.

### [P1-5] inventory POST: master_items 실재/isAvailable 검증 누락
- **파일**: [inventory/[characterId]/route.ts:63-89](app/api/erp/inventory/[characterId]/route.ts#L63)
- **현상**: `body.itemId`/`body.itemName`을 클라이언트 신뢰. `findMasterItemById` 검증 없음.
- **위험**: 클라이언트 폼 버그/실수로 잘못된 itemId 보내면 master_items와 끊긴 고스트 inventory row. `isAvailable: false` 아이템도 지급 가능.
- **수정안** (LOC ~15):
  ```ts
  if (!isValidObjectId(body.itemId)) return NextResponse.json({ error: "itemId 형식 오류" }, { status: 400 });
  const masterItem = await findMasterItemById(body.itemId);
  if (!masterItem) return NextResponse.json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
  if (!masterItem.isAvailable) return NextResponse.json({ error: "비활성 아이템" }, { status: 400 });
  // itemName은 서버에서 결정
  const entry = await addToInventory({ ...body, itemName: masterItem.name, /* ... */ });
  ```

### [P1-6] /erp/admin layout.tsx 부재 — 가드 단일 실패점
- **파일**: `app/(erp)/erp/admin/` (layout.tsx 부재)
- **현상**: `ROUTE_PERMISSIONS`에 `/erp/admin → GM` 선언 있으나 `getRouteMinRole` 호출처 0건. admin 페이지마다 개별적으로 `if (!hasRole(... "GM")) redirect` 반복.
- **위험**: 새 admin 페이지 추가 시 가드 누락 가능. 단일 실패점.
- **수정안** (LOC ~12, 신규 파일):
  ```tsx
  // app/(erp)/erp/admin/layout.tsx
  import { redirect } from "next/navigation";
  import { auth } from "@/lib/auth/config";
  import { hasRole } from "@/lib/auth/rbac";

  export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    if (!session?.user) redirect("/login");
    if (!hasRole(session.user.role, "GM")) redirect("/erp");
    return <>{children}</>;
  }
  ```
  + 각 admin 페이지의 중복 가드 제거 (defense-in-depth로 유지해도 무방).

### [P1-7] ROUTE_PERMISSIONS / getRouteMinRole 데드 정책 → 삭제 또는 강제
- **파일**: [lib/auth/rbac.ts:15-31](lib/auth/rbac.ts#L15)
- **현상**: 정의만 있고 호출처 0건. 정책 객체와 실제 가드 코드가 분리되어 있어 정책 객체 수정해도 동작 안 바뀜 (허위 안전감).
- **수정안 (선택1, 권장)**: `ROUTE_PERMISSIONS` / `getRouteMinRole` **삭제**. P1-6의 layout.tsx + 페이지별 명시 가드로 충분.
- **수정안 (선택2)**: `(erp)/layout.tsx`에서 호출하도록 통합 (단, prefix 매칭 우선순위 등 정책 테이블 자체 복잡도 도입).

### [P1-8] (erp)/layout.tsx에 최소 역할 가드(G) 부재
- **파일**: [app/(erp)/layout.tsx:18-22](app/(erp)/layout.tsx#L18)
- **현상**: `!session?.user` 체크만. ROUTE_PERMISSIONS에 따르면 J/U는 ERP 진입 차단되어야 하지만 가드 없음.
- **위험**: J/U 등급도 모든 ERP 페이지(admin 제외) 진입 가능. 정책 위반.
- **수정안** (LOC ~3, 정책 확인 필요 — ASK):
  ```tsx
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "G")) redirect("/login?error=Forbidden");
  ```
- **ASK**: 최소 역할이 G인지 U인지 정책 확정 필요.

### [P1-9] lib/db/utils.ts에 `import "./init"` 누락 — change-logs DELETE 라우트 cold-start 깨짐
- **파일**: [lib/db/utils.ts](lib/db/utils.ts) + [app/api/erp/characters/[id]/change-logs/[logId]/route.ts:23-27](app/api/erp/characters/[id]/change-logs/[logId]/route.ts#L23)
- **현상**: 진짜 init 우회 라우트 1건 — `change-logs/[logId]/route.ts` (DELETE)는 shared-db CRUD 직접 + utils만 import. `lib/db/utils.ts`는 init 사이드이펙트 없음.
- **위험**: Vercel cold-start 첫 요청에서 `getDb()` → "[shared-db] Serverless mode: initServerless() must be called first." throw.
- **수정안** (LOC 1):
  ```ts
  // lib/db/utils.ts 맨 위
  import "./init";
  export { isValidObjectId } from "@stargate/shared-db";
  ```

---

## P2 — 다음 사이클 필수

### [P2-1] generateRandomPassword 엔트로피 결함 (~36비트)
- **파일**: [lib/db/users.ts:40-46](lib/db/users.ts#L40)
- **현상**: `bytes.toString(36).padStart(2, "0")` 인코딩이 비-균등 분포. 9 bytes → 12자 출력의 실제 엔트로피가 ~36비트 수준.
- **수정안** (LOC ~10):
  ```ts
  const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
  function generateRandomPassword(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < 12; i++) {
      let n = bytes[i] ?? 0;
      while (n >= 252) { // rejection sampling
        const extra = new Uint8Array(1);
        crypto.getRandomValues(extra);
        n = extra[0]!;
      }
      out += BASE36[n % 36];
    }
    return out;
  }
  ```

### [P2-2] users 도메인: API `Cache-Control: no-store`인데 useQuery staleTime 5분
- **파일**: [hooks/queries/useUsersQuery.ts](hooks/queries/useUsersQuery.ts) + [app/api/erp/users/route.ts](app/api/erp/users/route.ts)
- **현상**: API는 즉시성을 의도해 no-store인데 클라이언트는 5분간 stale로 봄. role 변경/신규 사용자 추가가 5분간 admin UI에 반영 안 됨.
- **수정안** (LOC 1): `useUsers` staleTime을 `0` 또는 `30 * 1000`으로 낮춤.

### [P2-3] callbackUrl 정책 일원화 (open-redirect 잠재 + UX 회귀)
- **파일**: [middleware.ts:24-26](middleware.ts#L24) + [app/(auth)/login/page.tsx:41,47](app/(auth)/login/page.tsx#L41)
- **현상**: middleware가 `?callbackUrl=<경로>` set, login page는 무시하고 `"/erp"` 하드코딩. middleware 코드가 데드코드 + 잠재적 open-redirect.
- **수정안** (LOC ~20):
  ```ts
  // lib/auth/callback-url.ts (신규)
  export function safeCallbackUrl(raw: string | null): string {
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/erp";
    if (!raw.startsWith("/erp")) return "/erp";
    return raw;
  }
  ```
  middleware는 set, login page는 `safeCallbackUrl(searchParams.get("callbackUrl"))` 사용.

### [P2-4] requireRole이 평문 에러 메시지 throw → 정보 누설 가능
- **파일**: [lib/auth/rbac.ts:33-37](lib/auth/rbac.ts#L33)
- **현상**: `throw new Error("권한 부족: V 이상 필요 (현재: G)")` 평문. 일부 라우트가 `err.message`를 그대로 응답으로 흘림.
- **수정안** (LOC ~15):
  ```ts
  export class ForbiddenError extends Error {
    readonly code = "FORBIDDEN";
    constructor(public required: UserRole, public actual: UserRole) {
      super("권한 부족");
    }
  }
  export function requireRole(userRole: UserRole, requiredRole: UserRole): void {
    if (!hasRole(userRole, requiredRole)) {
      throw new ForbiddenError(requiredRole, userRole);
    }
  }
  ```
  호출처는 `if (err instanceof ForbiddenError) return 403 with { error: "Forbidden" }` (메시지에 required/actual 포함 금지).

### [P2-5] config.ts JWT/Session callback `as` 캐스팅 다발
- **파일**: [lib/auth/config.ts:128-138](lib/auth/config.ts#L128)
- **현상**: `token.id as string` 등 5곳 캐스팅. `types/next-auth.d.ts`에 augmentation 이미 적용 → 캐스팅 불필요.
- **수정안** (LOC ~5): 캐스팅 제거 후 타입 에러 검증.

### [P2-6] wiki PATCH 화이트리스트 + tags Array.isArray 검증
- **파일**: [app/api/erp/wiki/[id]/route.ts:73-78](app/api/erp/wiki/[id]/route.ts#L73)
- **현상**: 클라이언트 input destructure로 화이트리스트 효과는 있으나 tags가 query operator object여도 통과. content/title 길이 제한 없음.
- **수정안** (LOC ~20): `ALLOWED_WIKI_FIELDS = new Set([...])` + 타입 가드 (Array.isArray, length cap).

### [P2-7] session-reports POST/PATCH highlights/participants Array.isArray 검증
- **파일**: [app/api/erp/session-reports/route.ts:46-72](app/api/erp/session-reports/route.ts#L46)
- **현상**: `highlights`, `participants`를 `string[]`로 type assertion. Array.isArray 런타임 검증 부재. 클라이언트가 `highlights: "string"` 보내면 그대로 저장 → UI render `.map` crash.
- **수정안** (LOC ~10):
  ```ts
  if (highlights !== undefined && (!Array.isArray(highlights) || !highlights.every((h) => typeof h === "string" && h.length <= 500))) {
    return NextResponse.json({ error: "highlights 형식 오류" }, { status: 400 });
  }
  ```

### [P2-8] CharacterCreateForm: useCreateCharacter mutation hook 미사용
- **파일**: [app/(erp)/erp/characters/new/CharacterCreateForm.tsx](app/(erp)/erp/characters/new/CharacterCreateForm.tsx)
- **현상**: useCreateCharacter mutation hook이 정의되어 있는데 직접 fetch 사용 + `router.push` 만 호출. 새 캐릭터가 catalog 캐시에 즉시 안 보일 수 있음.
- **수정안** (LOC ~10): `const createCharacter = useCreateCharacter()` + `await createCharacter.mutateAsync(body)` 패턴.

### [P2-9] Number(NaN) 가드 (CharacterEditForm + CharacterCreateForm 8회 + 8회)
- **파일**:
  - [CharacterEditForm.tsx:910,919,928,937,946,955,964,973](app/(erp)/erp/characters/[id]/CharacterEditForm.tsx#L910)
  - [CharacterCreateForm.tsx:464,472,480,488,496,504,512,520](app/(erp)/erp/characters/new/CharacterCreateForm.tsx#L464)
- **현상**: HP/SAN/DEF/ATK + delta 입력 16회 모두 `setHp(Number(e.target.value))`. 빈 입력 → 0, 잘못된 입력 → NaN → JSON.stringify null. 사용자에게 "왜 저장 안 되지?" 혼선.
- **수정안** (LOC ~16, 인라인 가드):
  ```tsx
  onChange={(e) => {
    const n = Number(e.target.value);
    if (Number.isFinite(n)) setHp(n);
  }}
  ```

---

## P3 — 정리 / 유지보수 (선택)

| ID | 항목 | 파일 | 권고 |
|----|------|------|------|
| P3-1 | `getErpDb`/`getRegistrarDb` deprecated alias 제거 (호출처 0건) | lib/db/client.ts:18-29 | 즉시 삭제 |
| P3-2 | `canEditCharacter` @deprecated 호출처 1건 마이그레이션 | characters/[id]/page.tsx:42 → `canEditLore` | LOC 5 |
| P3-3 | sessions enrichSessions silent fallback 구조화 로깅 | lib/db/sessions.ts:92-95 | LOC 10 |
| P3-4 | listProfileCharactersByOwner 빈 문자열 가드 | lib/db/characters.ts:50 | LOC 1 |
| P3-5 | request.json() parse 헬퍼 일괄 도입 (8 라우트) | api/erp/{wiki,inventory,credits,session-reports,users,characters}/* | 별도 PR 권장 |
| P3-6 | ROOT_ALLOWED_FIELDS_ADMIN을 shared-db로 추출 (PATCH+revert 중복) | characters/[id]/route.ts vs revert/route.ts | LOC ~10 |
| P3-7 | users/[id]/{status,reset-password,unlink-discord} dead-code TODO 3건 정리 | 동일 패턴 | LOC -30 |
| P3-8 | sessions/route.ts `parseInt`+`isNaN` → `Number.isFinite` | sessions/route.ts:42-50 | LOC ~5 |
| P3-9 | wiki searchWikiPages 짧은 검색어 가드 (q.length < 2) | wiki/route.ts | LOC 2 |
| P3-10 | useResetUserPassword 반환 타입 zod parse | useUserMutation.ts:95-97 | LOC ~5 |
| P3-11 | characterKeys.byTier deprecated 주석 + 마이그레이션 | useCharactersQuery.ts | 점진적 |
| P3-12 | useCharacterChangeLogs ordering (interface vs key) | useCharacterChangeLogs.ts | LOC 작음 |
| P3-13 | wikiKeys.list 정규화 (undefined property 제거) | useWikiQuery.ts:7-9 | LOC ~5 |
| P3-14 | fetchJson 공통 wrapper (mutation 14곳 fetch+JSON+error 복붙) | hooks/mutations/* + queries/* | 별도 PR |
| P3-15 | DossierClient/CharacterEditForm Field 컴포넌트 추출 | _components/Field.tsx | 별도 PR |
| P3-16 | equipment.map key={i} → uuid 또는 stable id | CharacterEditForm.tsx:1064 | LOC ~5 |
| P3-17 | "11 슬롯" stale 주석 ("7 슬롯"으로 잘못 표기) | CharacterCreateForm.tsx:671 | LOC 1 |
| P3-18 | DossierClient PDF / PersonnelClient 등급안내 빈 lambda → disabled | 두 파일 | LOC ~4 |
| P3-19 | DossierPortraitImage src 변경 시 errored state reset | DossierClient.tsx:134-160 | LOC 1 |
| P3-20 | wiki GET catch 빈 + console.error 누락 | wiki/route.ts:41 | LOC 2 |

---

## ASK — 정책 확인 필요

| ID | 질문 | 영향 |
|----|------|------|
| ASK-1 | `(erp)/layout.tsx` 최소 역할이 `G`인가 `U`인가? (P1-8 결정에 영향) | RBAC 정책 |
| ASK-2 | `notifications` POST 라우트 부재가 의도된 RBAC 차단인가? Discord bot이 알림을 어떻게 생성하는가? | 알림 생성 경로 신뢰성 |
| ASK-3 | 캐릭터 시트 "-" → "미상" 정규화는 import 경로 한정인가, API POST/PATCH 모두 적용인가? | characters/route.ts 정규화 위치 결정 |
| ASK-4 | inventory 재지급 시 `note`가 `$setOnInsert`라 보존됨 — 의도된 정책? | inventory.ts:79-103 |
| ASK-5 | `users` PATCH(displayName 변경) 라우트 부재가 의도된 미구현인가? | 운영 도구 결함 가능성 |
| ASK-6 | SessionWrapper에 `discordId` 통째 전달 — 클라이언트 노출 정책? | 최소 노출 원칙 |
| ASK-7 | DossierClient GM 편집과 CharacterEditForm admin 편집 두 폼 분리 의도? lore-only로 좁힐 예정? | UX 통합 PR 가능성 |
| ASK-8 | `lib/query/client.ts` staleTime 60s 디폴트와 도메인별 override의 정책 의도? Cache-Control vs staleTime 정렬 ADR 작성 의향? | 캐시 정책 일관성 |

---

## 거부된 strict 제안 (참고)

Pragmatic이 강한 근거로 reject한 항목 — 적용 시 over-engineering 또는 기능 손상 위험:

- middleware 매처 `/api/erp/*` 확장 (현재 매처가 정확) — API는 401 JSON이 맞음.
- 매직 문자열 `"V"`/`"GM"` 정책 객체 추출 — `UserRole` 타입 리터럴 유니온이 컴파일러로 잡아줌.
- mutation hook에 `mutationKey` 일괄 추가 — mutation cache 미사용. YAGNI.
- creditKeys/notificationKeys 등 `{ all }` 단일 factory를 nested로 통일 — 도메인 복잡도 차이.
- OrgIcon `dangerouslySetInnerHTML` → ReactNode 매핑 — 정적 enum + 디자이너 SVG 동기화 비용.
- UsersAdminClient `window.confirm` → 모달 — 운영진 ERP 컨텍스트, 별도 UX PR.
- `<img>` → `Next/Image` 마이그레이션 — 프로젝트 전체 마이그레이션 대상, 별도 PR.

---

## 추천 처리 순서

### 단일 PR ① "Critical fixes" (LOC ~80)
1. P1-9 utils.ts `import "./init"` 1줄
2. P1-1 DossierClient invalidate (LOC 5)
3. P1-2 CharacterDetailClient onSaved 확장 (LOC 3)
4. P1-3 buildPatchBody diff 기반 (LOC ~30)
5. P1-4 credits POST userId/userName/음수 가드 (LOC ~30)
6. P1-5 inventory POST master 검증 (LOC ~15)

### 단일 PR ② "RBAC 일원화" (LOC ~50)
1. P1-6 admin/layout.tsx 신설
2. P1-7 ROUTE_PERMISSIONS 삭제 (또는 강제)
3. P1-8 (erp)/layout.tsx G 가드 (ASK-1 답변 후)
4. P2-3 callbackUrl 정책 일원화

### 단일 PR ③ "보안/타입 정리" (LOC ~50)
1. P2-1 generateRandomPassword 엔트로피
2. P2-4 ForbiddenError 클래스
3. P2-5 config.ts as 캐스팅 제거
4. P2-6 wiki PATCH 화이트리스트
5. P2-7 session-reports POST/PATCH 검증

### 단일 PR ④ "Mutation 패턴 일관성" (LOC ~50)
1. P2-8 CharacterCreateForm useCreateCharacter
2. P2-9 Number(NaN) 가드
3. P2-2 useUsers staleTime 0

### 별도 PR (점진적 정리)
- P3-* 모음 (ESLint 차단, fetchJson wrapper, 컴포넌트 추출 등)
- shared-db `addCredit` race condition (`$inc` 또는 `withTransaction`)
- shared-db `updateMasterItem` 시그니처 좁히기
- mutation hook 통합 (DossierClient 마이그레이션 + dead hook 활성화)
- Cache-Control vs staleTime 정렬 ADR

---

## 최종 평가

- **보안 표면**: XSS / dangerouslySetInnerHTML / SVG 인젝션 모두 안전. wiki sanitizer는 escape-then-whitelist로 강건. OrgIcon은 enum-only.
- **인증/RBAC**: 큰 골격은 정상. Layout 단위 가드 누락(admin)이 단일 실패점.
- **DB 레이어**: shared-db 마이그레이션이 대부분 완료. 한 라우트의 init 우회만 즉시 봉인 필요.
- **API Routes**: 캐릭터 도메인은 모범적(diff/audit/revert/화이트리스트). 그러나 wiki/credits/inventory 같은 다른 도메인은 화이트리스트/검증 비대칭.
- **TanStack Query**: hook 정의는 깔끔. 그러나 CharacterCreateForm/DossierClient/CharacterEditForm/CharacterDetailClient 4파일이 정의된 hook을 우회하고 raw fetch + router.refresh 또는 부분 invalidate로 일관성 깨짐.
- **클라이언트 컴포넌트**: 거대 파일(1300+ LOC)의 SRP 분해는 P3 영역. 진짜 위험은 빈 문자열 patch가 race window에서 다른 운영진의 변경을 덮어씀.

가장 큰 단일 위험은 **mutation 캐시 + 데이터 정합성** 두 영역. 이 둘이 한 PR로 해결되면 코드베이스의 "정책-구현 정합성"이 크게 향상됨.
