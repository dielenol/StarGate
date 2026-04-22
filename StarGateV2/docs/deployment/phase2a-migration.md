# Phase 2-A 배포 런북: UserRole → AgentLevel+GM 통일

## 배경

기존 `user.role` 은 5단(`SUPER_ADMIN / ADMIN / GM / PLAYER / GUEST`), `character.agentLevel` 은 7단(`V / A / M / H / G / J / U`)으로 분리돼 있어 권한 체계가 이원화돼 있었다. Phase 2-A 는 두 도메인을 **8단 `RoleLevel` 하나로 통일**한다.

| 구 역할 | 신 역할 | 의미 |
|--------|--------|------|
| `SUPER_ADMIN` | `GM` | 최고 운영자 (웹+DB) |
| `ADMIN` | `GM` | 운영자 (통합됨) |
| `GM` | `V` | VIP / 최상급 플레이어 |
| `PLAYER` | `G` | 일반 플레이어 |
| `GUEST` | `U` | 미분류 |

또한 구 `user.securityClearance` (보조 열람 등급) 필드는 제거하고, **열람 등급 = 사용자 역할** 로 단순화된다 (`lib/personnel.ts` 의 `getUserClearance(userRole)` 참조).

`character.agentLevel` 은 `GM` 리터럴을 제외한 7단 그대로 유지한다.

---

## 사전 준비

1. **DB 전체 백업 (필수)**
   ```bash
   mongodump --db=stargate --out=./backup-phase2a-$(date +%Y%m%d-%H%M%S)
   ```

2. **현재 role 분포 스냅샷**
   ```js
   // mongo shell
   db.users.aggregate([
     { $group: { _id: "$role", count: { $sum: 1 } } },
     { $sort: { _id: 1 } }
   ]);
   ```
   결과를 배포 티켓/노트에 기록.

3. **현재 `securityClearance` 보유자 수**
   ```js
   db.users.countDocuments({ securityClearance: { $exists: true } });
   ```

4. **환경변수 확인**
   - `MONGODB_URI`, `AUTH_SECRET` 이 유효한지 Vercel 대시보드에서 확인

---

## 배포 순서

### 1. 코드 배포

1. feature branch를 `main` 으로 머지
2. shared-db 빌드
   ```bash
   pnpm --filter @stargate/shared-db build
   ```
3. StarGateV2 Vercel 배포 (자동 또는 수동 트리거)
4. 빌드 성공 확인 (Vercel 로그)

### 2. 마이그레이션 (사용자 수동 실행)

1. **dry-run — 변경 예정 카운트 확인**
   ```bash
   pnpm tsx StarGateV2/scripts/migrate-user-roles.ts
   ```
   출력된 `would change N documents` 가 §사전준비 3번 결과와 합치하는지 검증.

2. **실제 실행**
   ```bash
   pnpm tsx StarGateV2/scripts/migrate-user-roles.ts --execute --yes
   ```
   - `users_backup_<ISO_TS>` 컬렉션이 자동 생성됨 (스크립트 출력에서 백업명 확인)
   - 각 `updateMany` 의 matched/modified 카운트를 확인
   - 스크립트 종료 시 출력되는 롤백 명령을 티켓에 복사

3. **재실행 안전성 확인 (선택)**
   ```bash
   pnpm tsx StarGateV2/scripts/migrate-user-roles.ts
   ```
   모든 항목이 `would change 0 documents` 가 되어야 함 (멱등성).

### 3. 세션 무효화

**목적**: 구 role (SUPER_ADMIN 등) 을 품은 JWT 가 남아 있으면 `hasRole()` 검사가 전부 false 가 되어 사용자들이 권한 오류를 경험한다. 전원 강제 재로그인.

1. Vercel 환경변수 `AUTH_SECRET` 회전 (기존 값 기록 → 새 랜덤값으로 덮어쓰기)
2. Vercel redeploy (환경변수 변경 반영)
3. 전 사용자 로그아웃됨 → 재로그인 시 최신 DB role 로 JWT 재발급

### 4. registra-bot 재시작

1. 서버에서 최신 코드 pull
2. 의존성/빌드
   ```bash
   pnpm install
   pnpm --filter registra-bot build
   ```
3. PM2 재시작
   ```bash
   pm2 restart registra-bot
   ```
4. 로그 확인 — `upsertDiscordUser` 가 `role: "U"` 로 신규 유저를 생성하는지 (기존 `GUEST` 문자열이 남아 있으면 stale 빌드)

---

## 스모크 테스트

| 대상 | 경로 | 기대 |
|------|------|------|
| GM 계정 | `/erp/admin/users` | 200 — 사용자 관리 화면 정상 렌더 |
| GM 계정 | `/erp/admin/characters/import` | 200 — 캐릭터 인입 정상 노출 |
| G 계정 | `/erp` | 200 — 대시보드 정상 |
| G 계정 | `/erp/admin` | 403 리다이렉트 (또는 권한 오류) |
| U 계정 | `/erp` | 403 리다이렉트 → `/login` |
| V 계정 | `/erp/admin/characters/import` | 200 — 캐릭터 인입 (nav minRole: V) |
| 신규 Discord 유저 (봇 응답) | — | `users` 에 `role: "U"` 로 upsert |
| 캐릭터 작성 폼 | `/erp/characters/new` | `agentLevel` 드롭다운 7개 선택지 (`V`/`A`/`M`/`H`/`G`/`J`/`U`, **GM 제외**) |

추가 확인:
- `/erp/personnel` 목록 및 Dossier 에서 필드 마스킹이 사용자 role 기반으로 올바르게 동작 (예: G 계정은 identity 등급만 통과, combatStats 는 마스킹)
- `/erp/admin/users` 에서 역할 변경 드롭다운이 8개 값 노출

---

## 롤백

### DB 롤백

마이그레이션 스크립트 종료 시 출력된 백업 컬렉션명 확인:

```js
// mongo shell
db.users.drop();
db.users_backup_<TS>.aggregate([{ $out: "users" }]);
```

### 코드 롤백

1. feature branch revert commit 생성 후 main 에 머지
2. Vercel redeploy
3. shared-db 이전 버전 빌드 반영

### 세션/봇 롤백

1. `AUTH_SECRET` 원본 값 복원 + Vercel redeploy (구 JWT 재사용 가능)
2. registra-bot 을 이전 태그/커밋으로 checkout 후 `pm2 restart`

---

## 주의

- **`AUTH_SECRET` 회전을 누락하면** 전 사용자가 로그인은 되나 모든 `hasRole()` 체크가 false 로 떨어져 403 이 쏟아진다. 회전 + redeploy 반드시 순서대로.
- **shared-db 배포와 registra-bot 재시작 순서가 어긋나면** 봇이 옛 `"GUEST"` 문자열로 계속 upsert 하다가 schema 검증이 실패한다. 반드시 웹/라이브러리 배포 → 봇 재시작 순.
- **`characters.agentLevel` 컬렉션은 이번 마이그레이션 대상이 아니다.** 기존 7단 값 그대로 유지.
- **마이그레이션 스크립트는 `users` 컬렉션만 건드린다.** `characters`, `sessions`, 기타 컬렉션은 변경 없음.
- dry-run 과 execute 사이 시간이 길면 그 사이 신규 유저가 생성될 수 있다. 배포 윈도우를 짧게 유지할 것.
