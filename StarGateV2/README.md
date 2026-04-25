# StarGate Web (NOVUS ORDO)

Stargate TRPG 운영을 위한 공식 웹앱 + ERP 시스템. 공개 홍보 사이트와 내부 운영 ERP를 한 Next.js 앱으로 통합.

## 기술 스택

- Next.js 16 (App Router, Turbopack)
- React 19
- next-auth 5 beta (Discord OAuth / Credentials, JWT)
- MongoDB 7 (`@stargate/shared-db` 워크스페이스 패키지 경유)
- TanStack Query v5 (서버 상태 캐싱 + 뮤테이션)
- CSS Modules (BEM 네이밍)
- 배포: Vercel (serverless)

## 페이지 구조

### 공개 (`app/(public)/`)
- `/` — 메인 랜딩
- `/apply` — 가입 신청 (Discord Webhook 전송)
- `/contact` — 문의 (Discord Webhook 전송)
- `/gameplay`, `/rules` — 게임 안내
- `/world`, `/world/b`, `/world/c`, `/world/player` — 세계관

### 인증 (`app/(auth)/`)
- `/login`

### 독립 (`app/(standalone)/`)
- `/survey/keyring` — 독립 설문 (네비 없음)

### ERP (`app/(erp)/erp/`, 인증 필수)
- `/erp` — 대시보드
- `/erp/characters` / `/erp/characters/[id]` / `/erp/characters/new`
- `/erp/credits`
- `/erp/inventory` / `/erp/inventory/[characterId]` / `/erp/inventory/items/new`
- `/erp/sessions` — 세션 캘린더
- `/erp/sessions/report` / `/erp/sessions/report/[id]` / `/erp/sessions/report/new`
- `/erp/wiki` / `/erp/wiki/[id]` / `/erp/wiki/[id]/edit` / `/erp/wiki/new`
- `/erp/notifications`
- `/erp/profile` — 내 캐릭터 대문 (대표 포스터 + 보유 캐릭터 카드)
- `/erp/account` — 시스템 계정 설정 (Discord 연동, PW 변경)
- `/erp/personnel` / `/erp/personnel/[id]` — 신원조회 Dossier
- `/erp/admin/users` — GM 전용 / `/erp/admin/characters/import` — V+ 전용
- `/erp/chronicle`, `/erp/gallery`, `/erp/hall-of-fame`, `/erp/missions` — 스텁 (COMING SOON)

## 권한 모델

`GM(100) > V(90) > A(80) > M(70) > H(60) > G(50) > J(40) > U(30)` 계층 (AgentLevel과 통일). RBAC 유틸은 `lib/auth/rbac.ts`의 `hasRole` / `requireRole`. `middleware.ts`는 Edge Runtime에서 쿠키 존재만 확인하고, 실제 세션/역할 검증은 `app/(erp)/layout.tsx`와 각 API 라우트에서 수행.

## 환경 변수

`.env.example` 참조. 필수:

| 변수 | 용도 |
|------|------|
| `AUTH_SECRET` | next-auth JWT 서명 (`openssl rand -base64 32`) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord OAuth |
| `MONGODB_URI` | MongoDB Atlas 연결 문자열 |
| `GUILD_ID` | 운영 Discord 길드 ID (세션 API가 서버에서 강제 사용) |
| `DISCORD_WEBHOOK_URL` | `/apply`, `/contact` 제출 알림 채널 |

선택:
- `NEXT_PUBLIC_APP_BASE_PATH` — 서브패스 배포 시 이미지 경로 보정
- `NEXT_PUBLIC_SITE_URL` — 메타 절대 URL 고정

## 개발

모노레포 루트에서 shared-db 빌드가 선행돼야 한다.

```bash
# 모노레포 루트에서
pnpm install
pnpm --filter @stargate/shared-db build

# StarGateV2에서
cd StarGateV2
pnpm dev         # next dev --turbopack (http://localhost:3000)
pnpm build       # shared-db 빌드 + next build
pnpm start       # 프로덕션 서버
pnpm lint        # eslint . --max-warnings=0
npx tsc --noEmit # 타입 체크
```

## 시드

```bash
pnpm seed:factions        # dry-run (기본, 쓰기 없음)
pnpm seed:institutions    # dry-run

# 실제 적재 (opt-in 2단계 필수)
pnpm seed:factions -- --execute --yes
pnpm seed:institutions -- --execute --yes
```

`scripts/` 하위의 `seed-admin`, `migrate-characters` 등 기타 스크립트는 `tsx`로 직접 실행.

## DB 접근 패턴

- `lib/db/init.ts` — shared-db serverless 초기화 (사이드이펙트)
- `lib/db/sessions.ts` — shared-db의 `findSessionsByGuildInMonth` / `findUpcomingSessionsByGuild` / `countParticipationByUserId`를 `import "./init"`과 함께 re-export. 세션 집계는 반드시 이 래퍼 경유.
- 그 외 도메인은 `lib/db/{users,characters,credits,inventory,wiki,session-reports,notifications}.ts` 의 CRUD 함수 직접 호출.

## 주의사항

- `<a>` 대신 `<Link>` 사용 (Next.js 클라이언트 내비게이션)
- CSS Modules BEM 패턴: `styles.block__element`, `styles["block__element--modifier"]`
- `dangerouslySetInnerHTML` 사용 시 반드시 `sanitizeHtml` 적용
- middleware에 `mongodb` import 금지 (Edge Runtime 비호환)

## 관련 문서

- 루트 [`CLAUDE.md`](../CLAUDE.md) — 모노레포 전반
- [`docs/spec/README.md`](docs/spec/README.md) — NPC/Faction/Institution 스펙
- [`docs/design/novus-ordo/`](docs/design/novus-ordo/) — 세계관 설계 노트
