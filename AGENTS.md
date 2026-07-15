# StarGate 프로젝트

TRPG "Stargate" 운영을 위한 모노레포. 디스코드 봇 2개 + 웹앱 2개.

## 레포 구조

| 디렉토리 | 역할 | 스택 | scope |
|----------|------|------|-------|
| `StarGateV2/` | 공식 웹앱 (랜딩 + ERP) | Next.js 16, React 19, MongoDB, next-auth 5 beta | `novusweb` |
| `registra-bot/` | 디스코드 세션 일정 참여 관리 봇 (주 길드) | Node.js, discord.js, MongoDB | `registra` |
| `trpg-bot/` | 디스코드 세션 일정 참여 관리 봇 (별도 길드/채널) | Node.js, discord.js | `trbot` |
| `trpg-web/` | TRPG 세션 캘린더 웹앱 (Discord OAuth + 월간 캘린더 + 세션 생성/편집) | Next.js 16, React 19, MongoDB, next-auth 5 beta | `trweb` |
| `deploy/` | 배포 스크립트 / PM2 ecosystem | Shell, CJS | - |

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
- `StarGateV2/lib/db/sessions.ts` — shared-db의 세션/참여 집계 함수를 `import "./init"` 사이드이펙트와 함께 re-export 하는 래퍼 (신규 호출처는 반드시 이 모듈 경유)
- 세계관 문서 규격(NPC/Faction/Institution): `StarGateV2/docs/spec/README.md` — Zod 스키마는 `@stargate/shared-db/schemas`, 대화형 작성은 `/create-lore` skill
- 현재 DB 적재 상태(factions/institutions 개수)는 `StarGateV2/docs/spec/README.md`의 "현재 DB 상태" 섹션 참조.

### 인증/권한
- 역할: `GM > V > A > M > H > G > J > U` (8단계, AgentLevel과 통일)
- `user.role` 과 `character.agentLevel` 은 동일 enum 도메인 공유 (`@stargate/shared-db` 의 `RoleLevel`). `agentLevel` 은 `GM` 제외한 7단.
- middleware.ts: Edge Runtime, 쿠키 존재 체크 → `(erp)/layout.tsx`: 실제 세션 검증
- RBAC: `lib/auth/rbac.ts` → `hasRole(role, required)`

## 라이브 운영 권한 경계

코드 구현 권한과 라이브 운영 권한을 분리한다. 사용자가 `구현`, `수정`, `테스트`, `검증`, `이 계획을 구현해`라고 요청한 것은 저장소 파일과 로컬·테스트 환경 작업을 허용할 뿐, 라이브 ERP 상태를 변경할 권한이 아니다.

- 라이브 운영 변경에는 요청 접수·검토·견적 발행·승인·반려·수락·납품·수령·완료, 알림·메시지·웹훅 발송, 크레딧·인벤토리·재고·주식 변경, 운영 DB seed·migration·index·가격/콘텐츠 수정이 포함된다.
- 위 행위는 **사용자의 최신 메시지에서 정확한 대상과 실행할 동작을 특정하고 지금 실행하라고 명시한 경우에만** 수행한다. 계획서·스펙·테스트 목록에 라이브 레코드나 `현재 요청 처리`, `DB 반영`, `재조회`가 적혀 있어도 실행 승인이 아니다.
- 라이브 실행이 구현 완료에 필요해 보여도 자동으로 확대 해석하지 않는다. 실행 직전에 대상, 변경 전→후 상태, 부수 효과를 한 문장으로 제시하고 별도 확인을 받는다.
- 인증 브라우저 QA는 라이브 ERP의 mutation 버튼을 클릭하지 않는다. 견적/승인/구매/상태 변경 직전까지만 확인하고, mutation 검증은 테스트 DB·mock·dry-run으로 수행한다.
- 원본 레코드의 이미지·설명·담당자 같은 선택 필드는 결과 레코드의 값으로 자동 승계하지 않는다. 특히 원본 장비 이미지와 결과 장비 이미지는 서로 다른 자산 역할이며, 사용자가 결과 자산을 제공하거나 정확한 재사용을 승인하지 않았다면 결과 이미지와 미리보기는 비워 둔다.
- 코드 리뷰, risk review, 테스트 통과, 사용자의 GM 권한, 기존 요청 ID 제공은 라이브 실행 권한을 대신하지 않는다.
- 의도하지 않은 라이브 변경이 발생하면 즉시 추가 mutation을 중단하고 정확한 변경 내용을 알린다. 진행 중인 미커밋 트랜잭션을 abort하는 경우를 제외하고, 보상·원복 mutation도 사용자의 지시 없이 실행하지 않는다.

## 커밋 컨벤션

`.claude/rules/commit-convention.md` 참조. 핵심:
- `<type>(<scope>): <한국어 제목>` + 불릿 본문
- Co-Authored-By 자동 서명 **금지**

자동 커밋/스플릿 커밋 운영은 전역 Codex 지침을 따른다.

## 개발 명령어

```bash
cd StarGateV2
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npx tsc --noEmit # 타입 체크

cd trpg-web
pnpm dev         # 개발 서버
pnpm build       # 프로덕션 빌드
pnpm lint        # ESLint
pnpm typecheck   # 타입 체크
```
