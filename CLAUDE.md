# StarGate 프로젝트

TRPG "Stargate" 운영을 위한 모노레포. 디스코드 봇 2개 + 웹앱 1개.

## 레포 구조

| 디렉토리 | 역할 | 스택 | scope |
|----------|------|------|-------|
| `StarGateV2/` | 공식 웹앱 (랜딩 + ERP) | Next.js 16, React 19, MongoDB, next-auth 5 beta | `novusweb` |
| `registra-bot/` | 세션 관리 디스코드 봇 | Node.js, discord.js, MongoDB | `registra` |
| `trpg-bot/` | TRPG 진행 디스코드 봇 | Node.js, discord.js | `trbot` |
| `deploy/` | 배포 스크립트 | Shell | - |

## StarGateV2 (웹앱) 아키텍처

### 기술 스택
- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI**: React 19, CSS Modules (BEM 네이밍)
- **서버 상태**: TanStack Query v5 (클라이언트 캐싱 + 뮤테이션)
- **DB**: MongoDB 7 (직접 연결, maxPoolSize: 5)
- **인증**: next-auth 5 beta (Credentials Provider, JWT)
- **배포**: Vercel (서버리스)

### 데이터 흐름 패턴

**서버 컴포넌트 (page.tsx)**:
- `lib/db/*.ts` → MongoDB 직접 호출 → JSX 렌더
- `auth()` 로 세션 검증, `hasRole()` 로 권한 체크

**하이브리드 패턴 (성능 최적화 적용 페이지)**:
- 서버 page.tsx → 초기 데이터 fetch → 클라이언트 컴포넌트에 `initialData` 전달
- 클라이언트에서 `useQuery({ initialData })` → 캐시 관리, 재진입 시 즉시 표시
- 적용 페이지: characters, inventory, notifications, wiki, reports

**뮤테이션 패턴**:
- `hooks/mutations/use*Mutation.ts` → `useMutation` + `invalidateQueries`
- `router.refresh()` 대신 캐시 invalidation으로 갱신

### 주요 디렉토리 (StarGateV2/)

```
app/
  (auth)/         — 로그인/인증 페이지
  (erp)/          — ERP 시스템 (인증 필요)
    erp/          — 대시보드, 캐릭터, 크레딧, 인벤토리, 알림, 세션, 위키 등
  (public)/       — 공개 랜딩 페이지
  (standalone)/   — 독립 페이지 (설문 등)
  api/erp/        — API Route Handlers
hooks/
  queries/        — TanStack Query hooks (도메인별)
  mutations/      — TanStack Mutation hooks (도메인별)
lib/
  auth/           — next-auth 설정, RBAC
  db/             — MongoDB 컬렉션별 CRUD 함수
  query/          — QueryClient 설정
components/erp/   — ERP 공용 컴포넌트 (Sidebar, QueryProvider 등)
types/            — 도메인 타입 정의
```

### DB 구조
- **stargate** DB (통합): users, characters, credit_transactions, character_inventory, master_items, wiki_pages, session_reports, notifications, sessions, session_responses, factions, institutions 등
- 연결: `@stargate/shared-db` 패키지 (`StarGateV2/lib/db/init.ts`에서 serverless 초기화)
- 세계관 문서 규격(NPC/Faction/Institution): `StarGateV2/docs/spec/README.md` — Zod 스키마는 `@stargate/shared-db/schemas`, 대화형 작성은 `/create-lore` skill

### 인증/권한
- 역할: `SUPER_ADMIN > ADMIN > GM > PLAYER > GUEST`
- middleware.ts: Edge Runtime, 쿠키 존재 체크 → `(erp)/layout.tsx`: 실제 세션 검증
- RBAC: `lib/auth/rbac.ts` → `hasRole(role, required)`

## 커밋 컨벤션

`.claude/rules/commit-convention.md` 참조. 핵심:
- `<type>(<scope>): <한국어 제목>` + 불릿 본문
- Co-Authored-By 자동 서명 **금지**

## 개발 명령어

```bash
cd StarGateV2
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npx tsc --noEmit # 타입 체크
```
