# StarGateV2

"노부스 오르도" TRPG 공개 홍보 사이트 + 내부 운영 ERP 통합 웹앱.

## 스택

| 항목 | 값 |
|------|-----|
| 프레임워크 | Next.js 16 (App Router) |
| 런타임 | React 19, TypeScript 5.9 |
| 인증 | Auth.js v5 (NextAuth 5.0.0-beta.30) — Discord OAuth + Credentials |
| DB | MongoDB 7 (Atlas, 드라이버 직접 사용, ORM 없음) |
| 스타일링 | CSS Modules (군사/기밀 테마) |
| 패키지 매니저 | pnpm |
| 배포 | Vercel |
| 린터 | ESLint (Flat Config, next/core-web-vitals + typescript) |

## 실행

```bash
pnpm dev          # Next.js dev server (port 3000)
pnpm build        # 프로덕션 빌드
pnpm lint         # eslint . --max-warnings=0
```

## 폴더 구조

```
app/
├── (auth)/login/              # 로그인 페이지
├── (erp)/erp/                 # ERP 내부망 (인증 필수)
│   ├── admin/{members,users,characters/import}  # ADMIN 전용
│   ├── characters/            # 캐릭터 관리 (GM+)
│   ├── credits/               # 크레딧/재화
│   ├── inventory/             # 장비/인벤토리
│   ├── notifications/         # 알림
│   ├── profile/               # 내 캐릭터 대문 (대표 포스터 + 보유 캐릭터 카드)
│   ├── account/               # 시스템 계정 설정 (Discord 연동, PW 변경)
│   ├── sessions/              # 세션 캘린더 + 리포트
│   ├── wiki/                  # 월드빌딩 위키
│   ├── personnel/[id]         # 신원조회 Dossier
│   └── chronicle/, gallery/, hall-of-fame/, missions/  # 스텁 (COMING SOON)
├── (public)/                  # 공개 홍보 사이트
│   ├── apply/, contact/       # 입회 신청, 문의
│   ├── gameplay/, rules/      # 게임 정보
│   └── world/                 # 세계관 (b, c, player 포함)
├── (standalone)/              # 독립 페이지 (네비 없음, URL 직접 접근)
│   └── survey/keyring/
└── api/
    ├── auth/[...nextauth]/    # Auth.js 핸들러
    ├── erp/                   # ERP API 엔드포인트
    └── apply/, contact/       # 공개 API

lib/
├── auth/config.ts             # NextAuth 설정
├── auth/rbac.ts               # RBAC 유틸 (역할 계층 검증)
├── db/client.ts               # MongoClient 싱글톤 (global 캐싱, maxPoolSize: 5)
├── db/init.ts                 # shared-db serverless 초기화 (사이드이펙트)
├── db/collections.ts          # 컬렉션 헬퍼
├── db/sessions.ts             # shared-db 세션/참여 집계 함수 re-export 래퍼 (`import "./init"` 포함)
└── db/*.ts                    # 도메인별 CRUD (users, characters, wiki, credits, session-reports 등)

components/
├── erp/ERPSidebar/            # ERP 사이드바
├── erp/CommandK/              # ⌘K 커맨드 팔레트
├── erp/PermissionGate/        # 클라이언트 권한 게이트
├── erp/QueryProvider.tsx      # TanStack Query Provider
├── erp/SessionWrapper.tsx     # 세션 컨텍스트 래퍼
├── erp/nav-config.ts          # ERP 내비 메뉴 정의
└── sidebar/                   # 공개 사이트 사이드바

types/                         # 도메인 타입 (user, character, wiki, credit 등)
```

## 세계관 문서 (docs/spec)

NPC/세력(Faction)/기관(Institution) 3개 도메인 구조화. 상세는 [docs/spec/README.md](docs/spec/README.md).

- MD 템플릿: `docs/spec/templates/{npc,faction,institution}.template.md`
- 자동 작성: `/create-lore [npc|faction|institution]` (Claude skill, Zod 검증 포함)
- Zod 스키마: `@stargate/shared-db/schemas` — `{domain}DocSchema` + `{domain}FrontmatterSchema` + `toDb{Domain}` 어댑터
- DB 컬렉션: `factions` / `institutions` / `characters (type=NPC)`
- seed: `pnpm run seed:{factions,institutions}` (dry-run 기본, 쓰기는 `-- --execute --yes`)

## 인증 & RBAC

- **JWT 전략** (서버리스 최적화)
- **역할 계층**: `GM(100) > V(90) > A(80) > M(70) > H(60) > G(50) > J(40) > U(30)` (8단계, AgentLevel과 통일)
- **user.role** 과 **character.agentLevel** 은 동일 enum 도메인(`RoleLevel`)을 공유한다. 단, `agentLevel` 은 AGENT 입력용이라 `GM` 리터럴을 제외한 7단만 사용.
- **middleware**: Edge Runtime — 쿠키 존재만 확인, 실제 RBAC는 서버 컴포넌트에서
- **middleware에 mongodb import 금지** (Edge Runtime 비호환)

## DB 연결

- `stargate` — 통합 DB (users, characters, wiki_pages, sessions, session_responses 등)
- 연결: `@stargate/shared-db` + `lib/db/init.ts` (serverless, `maxPoolSize: 5`)
- `lib/db/sessions.ts` — shared-db의 `findSessionsByGuildInMonth` / `findUpcomingSessionsByGuild` / `countParticipationByUserId`를 `import "./init"` 사이드이펙트와 함께 re-export. 세션 집계가 필요한 라우트/서버 컴포넌트는 이 래퍼를 import해 초기화 순서를 보장한다.

## API Route 패턴

```typescript
const session = await auth();
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
try { requireRole(session.user.role, "GM"); } catch { return 403; }
// DB 조작 → JSON 응답
```

- 모든 동적 라우트에 `isValidObjectId()` 검증 필수
- 업데이트 API는 필드 화이트리스트 적용
- `/api/erp/sessions` (GET) — ERP 로그인 사용자(PLAYER 이상) 접근 허용, `guildId`는 클라이언트 쿼리가 아닌 `process.env.GUILD_ID`를 서버에서 강제 사용 (단일 길드 전제)

## 환경변수

`.env.example` 참조. 필수: `AUTH_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `MONGODB_URI`

## 주의사항

- `<a>` 대신 `<Link>` 사용 (Next.js 클라이언트 내비게이션)
- CSS Modules BEM 패턴: `styles.block__element`, `styles["block__element--modifier"]`
- `dangerouslySetInnerHTML` 사용 시 반드시 `sanitizeHtml` 적용
- 이미지: 현재 `<img>` 사용 중 (추후 `<Image>` 전환 검토)
