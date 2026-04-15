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
│   ├── admin/{members,users}  # ADMIN 전용
│   ├── characters/            # 캐릭터 관리 (GM+)
│   ├── credits/               # 크레딧/재화
│   ├── inventory/             # 장비/인벤토리
│   ├── notifications/         # 알림
│   ├── profile/               # 프로필/PW 변경
│   ├── sessions/              # 세션 캘린더 + 리포트
│   └── wiki/                  # 월드빌딩 위키
├── (public)/                  # 공개 홍보 사이트
│   ├── apply/, contact/       # 입회 신청, 문의
│   ├── gameplay/, rules/      # 게임 정보
│   └── world/                 # 세계관 (캐릭터 포함)
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
├── db/collections.ts          # 컬렉션 헬퍼
├── db/*.ts                    # 도메인별 CRUD (users, characters, wiki, credits 등)
└── db/registrar-read.ts       # registrar_bot DB 읽기 전용

components/
├── erp/ERPSidebar/            # ERP 사이드바
├── erp/PermissionGate/        # 클라이언트 권한 게이트
└── sidebar/                   # 공개 사이트 사이드바

types/                         # 도메인 타입 (user, character, wiki, credit 등)
```

## 인증 & RBAC

- **JWT 전략** (서버리스 최적화)
- **역할 계층**: `SUPER_ADMIN(100) > ADMIN(80) > GM(60) > PLAYER(40) > GUEST(20)`
- **middleware**: Edge Runtime — 쿠키 존재만 확인, 실제 RBAC는 서버 컴포넌트에서
- **middleware에 mongodb import 금지** (Edge Runtime 비호환)

## DB 연결

- `stargate_erp` — ERP 데이터 (users, characters, wiki_pages 등)
- `registrar_bot` — 봇 데이터 읽기 전용 (`registrar-read.ts`)
- 연결 풀: `maxPoolSize: 5`, `global.mongoClientPromise` 패턴

## API Route 패턴

```typescript
const session = await auth();
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
try { requireRole(session.user.role, "GM"); } catch { return 403; }
// DB 조작 → JSON 응답
```

- 모든 동적 라우트에 `isValidObjectId()` 검증 필수
- 업데이트 API는 필드 화이트리스트 적용

## 환경변수

`.env.example` 참조. 필수: `AUTH_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `MONGODB_URI`

## 주의사항

- `<a>` 대신 `<Link>` 사용 (Next.js 클라이언트 내비게이션)
- CSS Modules BEM 패턴: `styles.block__element`, `styles["block__element--modifier"]`
- `dangerouslySetInnerHTML` 사용 시 반드시 `sanitizeHtml` 적용
- 이미지: 현재 `<img>` 사용 중 (추후 `<Image>` 전환 검토)
