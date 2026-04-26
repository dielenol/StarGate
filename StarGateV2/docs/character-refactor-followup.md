# 캐릭터 프로필·자가편집 리팩토링 — 후속 작업 체크리스트

> 작성일: 2026-04-26
> 컨텍스트: P1~P8 (P2 보류) + 디자인 슬롯 8개 적용 완료. 본 문서는 **운영 세팅** + **남은 후속 PR 후보** 정리.

---

## 0. 완료 요약

### Phase 구현 (코드)
- [x] **P1** shared-db 스키마 (`SheetBase.posterImage`, `PLAYER_ALLOWED_CHARACTER_FIELDS`, `character_change_logs` 컬렉션)
- [ ] **P2** 이미지 업로드 인프라 — **보류** (갤러리 도입 시점에 결정)
- [x] **P3** 라우트 분리 (`/erp/account` 신설 + `/erp/profile` 의미 재정의)
- [x] **P4** 캐릭터 상세 PosterHero (3:4 + 코너 틱 + LOGO 카드)
- [x] **P5** 자가편집 권한 + 화이트리스트 이원화 (`canEditCharacter`)
- [x] **P6** audit log + 쿨다운 enforcement (24h/10회)
- [x] **P7** diff 프리뷰 모달 + 디스코드 GM 채널 웹훅
- [x] **P8** GM 원클릭 롤백 + 변경 이력 뷰어

### 디자인 슬롯 (Claude Design)
- [x] **슬롯 1** `/erp/profile` 내 캐릭터 대문
- [x] **슬롯 2** `/erp/account` 시스템 dossier
- [x] **슬롯 3** PosterHero (Tower 1단계 — vitals/agent details 미흡수)
- [x] **슬롯 4** `/erp/characters` 카탈로그
- [x] **슬롯 5/6** CharacterEditForm + 잠금/quota
- [x] **슬롯 7** DiffPreviewModal
- [x] **슬롯 8** ChangeLogsPanel

### 회귀 보호 테스트
- shared-db 21 케이스 (`packages/shared-db/src/.../__tests__/*`)
- StarGateV2 권한 boundary 41 케이스 (`StarGateV2/lib/auth/__tests__/*`)
- 합 **62 케이스 PASS**

---

## 1. 운영 환경변수 설정 (즉시 필요 시)

`.env`(또는 Vercel 환경변수)에 추가. 미설정 시 fallback 동작은 명시.

### Discord 웹훅 (P7)
```bash
# GM 전용 캐릭터 편집 감사 채널 — 미설정 시 silent skip + console.warn
DISCORD_WEBHOOK_CHAR_EDIT_URL=https://discord.com/api/webhooks/<id>/<token>
```
- 미설정 시 동작: `notifyCharacterEdit` 호출이 skip 되고 warning log 만 남김. 캐릭터 편집 자체는 정상 작동
- 채널은 기존 `DISCORD_WEBHOOK_URL` (apply/contact 공개 채널)과 **분리** 권장

### 쿨다운 설정 (P6, 옵션)
```bash
# 플레이어 자가편집 쿨다운 — 미설정 시 fallback (10회 / 24시간)
CHARACTER_EDIT_COOLDOWN_MAX=10
CHARACTER_EDIT_COOLDOWN_WINDOW_HOURS=24
```
- admin (V+)에는 미적용 (운영 책임 영역)
- 0/음수/NaN 입력 시 fallback (구멍 차단)

### 체크리스트
- [ ] Vercel 프로덕션 환경변수 추가
- [ ] dev/staging 환경변수 추가
- [ ] `.env.example` 갱신 (권한 차단으로 미수정 — 수동 추가 필요)

---

## 2. dev 서버 확인 체크리스트

```bash
cd StarGateV2 && pnpm dev   # → http://localhost:3000
```

### 페이지 진입 확인
- [ ] `/erp/profile` — 대표 캐릭터 포스터 + 다른 캐릭터 카드 + shortcut
- [ ] `/erp/account` — 사이드 dossier + ACCOUNT/DISCORD/SECURITY 카드
- [ ] `/erp/characters` — ALL/AGENT/NPC 탭 + 카드 그리드
- [ ] `/erp/characters/[id]` — PosterHero(Tower) + 기존 시트 + ChangeLogsPanel(GM/owner)

### 동작 확인 (admin 계정)
- [ ] 캐릭터 편집 진입 → modeBanner ADMIN
- [ ] 필드 수정 → 저장 → DiffPreviewModal 진입 → 변경 사유 입력 → 확인
- [ ] PATCH 성공 → audit log 새 row + Discord 채널 알림 (웹훅 설정 시)
- [ ] ChangeLogsPanel "REVERT" 버튼 → confirm → 캐릭터 복원 + 새 audit row

### 동작 확인 (player 계정 — 본인 소유 캐릭터)
- [ ] 캐릭터 편집 진입 → modeBanner PLAYER + quota 표시
- [ ] 잠긴 필드(능력치/이미지/codename 등)에 GM 자물쇠 + disabled 빗금
- [ ] 서사 7필드만 편집 가능 (quote/appearance/personality/background/gender/age/height)
- [ ] 저장 → DiffPreviewModal → PATCH → audit log
- [ ] 24h 내 10회 초과 시 429 응답 + cooldown info

### 동작 확인 (player 계정 — 타인 캐릭터)
- [ ] 편집 버튼 미노출
- [ ] PATCH/edit-quota/change-logs API 직접 호출 시 404 (oracle 차단)

---

## 3. git 정리 (사용자 동의 필요)

### Stash
```bash
git stash list
# stash@{0}: WIP on main: 57f4351 docs: 세계관 lore 문서 추가
```
**모든 내용 main에 흡수됨**. drop 가능.
- [ ] `git stash drop stash@{0}` 실행

### feature 브랜치
```bash
git branch
# feature/p1-shared-db-wip   ← main에 흡수됨
# backup-before-email-rewrite ← 별도 검토 필요
```
- [ ] `git branch -D feature/p1-shared-db-wip` 실행
- [ ] `backup-before-email-rewrite` 별도 검토 후 결정

### Working tree (사용자 영역, 캐릭터 작업 무관)
다음은 사용자 별도 작업 — 처리 결정 필요:
```
M StarGateV2/app/(erp)/erp/sessions/SessionCalendar.module.css
M StarGateV2/app/(erp)/erp/sessions/SessionCalendar.tsx
M StarGateV2/app/(erp)/erp/sessions/SessionsClient.tsx
M StarGateV2/app/(erp)/erp/sessions/page.module.css
M StarGateV2/app/(erp)/erp/sessions/page.tsx
?? StarGateV2/app/(erp)/erp/sessions/SessionsAgenda.tsx
?? StarGateV2/app/(erp)/erp/sessions/_utils.ts
?? StarGateV2/docs/spec/npc/arbiter.md
?? StarGateV2/scripts/seed-payloads/
```
- [ ] 사용자 작업이면 별도 commit 또는 stash 보존

---

## 4. 후속 PR 후보 (즉시 필요 X)

리뷰 합의에서 후속으로 미룬 항목들. 기능 동작에 영향 없으나 향후 정리 시 도움.

### 우선순위 — 높음

#### F1. PosterHero 2단계 (Tower 레이아웃 완성)
**현재 상태**: 1단계 (portrait + 코너 틱 + caption + LOGO 카드)만 적용됨
**남은 작업**: 디자이너의 Tower 레이아웃 우측 사이드 — vitals(HP/SAN/DEF/ATK 진행 바) + agent details(class/weight/credit/skills chips) + quote 카드

**전제**:
- 기존 `CharacterDetailClient` 의 좌측 시트 영역과 **중복 회피** — Hero 흡수하려면 시트 영역 일부 제거 필요
- Lower 탭 시스템 (프로필/능력/장비/세션 이력/타임라인) 도입 검토

**참고**: `/tmp/claude-design/extracted/novusordo/project/character-detail.{jsx,css}`

---

### 우선순위 — 중간

#### F2. P2 이미지 업로드 인프라
**시점**: 갤러리 정식 도입 시 또는 비개발자 GM 합류 시
**스토리지 결정 필요**:
- Vercel Blob (DX 최상, Hobby commercial 제한 회색지대)
- Cloudflare R2 (egress 무료, 설정 ~1시간)
- uploadthing (편리, 2GB 제한)

**작업 범위**:
- `lib/storage/blob.ts` (또는 r2.ts) 래퍼
- 업로드 Route Handler (`POST /api/erp/characters/[id]/images`)
- `next.config.ts` `images.remotePatterns` 추가
- `useCharacterImageUpload` 훅
- CharacterEditForm 에 ImageUploadField 통합 (현재 URL 텍스트 입력 → 드롭존 업로더)

**참고 계획**: 본 리포지토리 PR 히스토리에서 P2 spec 참조

#### F3. admin audit dot-path 정밀화
**현재**: ADMIN 편집 시 `field: "sheet"` 단일 entry 에 sheet 통째 객체 저장
**문제**: ChangeLogsPanel revert UX 정밀도 0 (sheet 통째 복원만 가능)
**해결**: shared-db 에 `ADMIN_DIFF_DOT_PATHS` 신설 (audit 비교 전용 dot path 셋)

```ts
// packages/shared-db/src/crud/characters.ts
export const ADMIN_DIFF_DOT_PATHS = new Set<string>([
  "codename", "type", "role", "agentLevel", "department",
  "previewImage", "ownerId", "isPublic",
  "sheet.codename", "sheet.name", "sheet.mainImage", "sheet.posterImage",
  "sheet.quote", "sheet.gender", "sheet.age", "sheet.height",
  // ... AGENT/NPC sheet 필드 모두
]);
```
- PATCH route + revert route 의 `computeCharacterDiff` 호출 시 새 셋 사용
- e2e 테스트 추가 (admin 단일 필드 변경 → 1 entry, revert 가능)

---

### 우선순위 — 낮음

#### F4. CharacterEditForm 1100라인 분리 리팩
**현재**: 단일 파일 1078 LOC + useState 30+
**목표**:
- `CharacterEditForm/sections/BasicInfoSection.tsx`
- `CharacterEditForm/sections/AgentSection.tsx`
- `CharacterEditForm/sections/NpcSection.tsx`
- `CharacterEditForm/hooks/useFormState.ts` (useState 묶기)
- root 200 LOC 이하

**시점**: 추가 필드/섹션 작업이 예정됐을 때

#### F5. fmt 헬퍼 `lib/format/date.ts` 통합
**현재**: `fmtDate`/`fmtDateTime` 함수가 7+ 파일에 산재
- `app/(erp)/erp/account/page.tsx`
- `app/(erp)/erp/admin/users/`
- `app/(erp)/erp/wiki/`
- `app/(erp)/erp/wiki/[id]/`
- `app/(erp)/erp/page.tsx` (dashboard)
- `app/(erp)/erp/sessions/report/`
- 등

**목표**:
```ts
// lib/format/date.ts (신규)
export function formatDate(d: Date | string): string { ... }
export function formatDateTime(d: Date | string): string { ... }
```

**작업**: 기존 인라인 정의 제거 + import 일괄 치환

#### F6. `/api/erp/profile/password` → `/api/erp/account/password` 이관
**위치**: `StarGateV2/app/(erp)/erp/account/PasswordForm.tsx:13` TODO(P5) 명시
**현재**: P3 라우트 분리 시 호환성 유지차 기존 경로 유지
**작업**:
1. `app/api/erp/account/password/route.ts` 신규 (기존 핸들러 복사)
2. `PasswordForm.tsx` fetch URL 갱신
3. `app/api/erp/profile/password/route.ts` 410 Gone 또는 deprecation 후 제거

#### F7. sheet.codename / codename 정합성 정리
**현재**: `Character.codename` 과 `sheet.codename` 동일 값 mirror — DiffPreviewModal/ChangeLogsPanel 에 두 줄 노출
**옵션**:
- DB 모델에서 `sheet.codename` 제거 (마이그레이션)
- 또는 ADMIN_DIFF_FIELDS 에서 둘 중 하나 제외 (UI 노이즈 회피)

#### F8. Image optimization
**현재**: `next.config.ts` `images.unoptimized: true`
**시점**: 외부 CDN 이미지 도입 시 (포스터/아바타) — `remotePatterns` 추가 + `unoptimized: false` 전환

---

## 5. 안전성/운영 모니터링 권장

### 추적할 지표
- audit insert 실패율 (console.warn `[characters PATCH] audit insert failed`)
- 디스코드 웹훅 실패율 (console.warn `[characters PATCH] webhook scheduling failed`)
- 쿨다운 429 발생 빈도 (player 자가편집 throttle 체감)
- revert API 사용 빈도 (`source: 'admin', reason: 'revert:...'` audit row)

### 잠재 위험 (현재는 수용 가능)
- **TOCTTOU race**: 동시 PATCH 시 쿨다운 우회 가능 — 마스터 3명 + 플레이어 ~20명 규모에서 무시 가능
- **audit insert TX 미보장**: update 성공 후 audit 실패 시 로그 유실 — best-effort 정책 명시됨
- **이미지 URL 외부 조작**: PLAYER_ALLOWED_CHARACTER_FIELDS 에 이미지 미포함이라 위험 없음 (admin only)

---

## 6. 메모리

본 리포지토리 작업 컨텍스트는 다음 위치에 저장됨:
- `~/.claude/projects/-Users-flitto-Code-StarGate/memory/MEMORY.md` — 프로젝트 인덱스
- `~/.claude/projects/-Users-flitto-Code-StarGate/memory/project_p1_wip.md` — P1 WIP 기록 (현재는 main 흡수 완료)
- `~/.claude/projects/-Users-flitto-Code-StarGate/memory/feedback_rank_alert_palette.md` — 색상 팔레트 단일 출처 정책

P1 WIP 기록은 main 흡수됐으므로 추후 `consolidate-memory` 시점에 정리 가능.

---

## 7. 다음 작업 진입 가이드

후속 PR 진행 시:
1. 본 문서의 해당 항목 참조
2. 글로벌 워크플로우(`~/.claude/CLAUDE.md`) 의 Overseer 패턴 적용
3. L3 변경(권한/스키마)이면 dual review + validator 필수
4. 디자인은 Claude Design 후속 (자매 슬롯 패턴 참조)

캐릭터 작업 외 다른 영역(sessions, personnel, wiki 등) 변경은 본 문서 범위 외.
