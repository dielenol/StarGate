# trpg-bot

`trpg-web` 세션을 Discord에 안내하는 장기 실행 봇(다채봇). 맡는 일은 다음과 같다.
- 월간 캘린더 조회와 내 세션 목록
- 일정 투표
- 주사위와 비밀 굴림
- 세션 생성·수정·취소 알림, 시작 24시간·1시간 전 리마인드
- 길드 멤버 동기화
- YouTube 음악
- 운영 장애 알림과 생존 신호

세션 생성·수정·취소와 참가자 선택은 `trpg-web`이 한다. 봇은 읽기와 알림만 한다.

## 스택

| 항목 | 값 |
|------|-----|
| 런타임 | Node.js 22 ESM (`"type": "module"`) |
| 언어 | TypeScript 5.9, strict, ES2022 target, NodeNext module (상대 import 는 `.js` 확장자) |
| 봇 프레임워크 | discord.js v14, @discordjs/voice |
| DB | MongoDB 7 드라이버, 통합 DB `stargate` (`@stargate/shared-db` 경유) |
| 이미지 생성 | Puppeteer 24 (월간 캘린더 PNG) |
| 음악 런타임 | yt-dlp nightly + FFmpeg, 같은 컨테이너의 bgutil POT provider |
| 환경변수 | dotenv |
| 패키지 매니저 | pnpm (루트 workspace 멤버 — `pnpm-workspace.yaml` 에 등록) |

## 실행

```bash
# 루트 디렉터리에서
pnpm install                              # 워크스페이스 전체 의존성 설치
pnpm test:trpg-bot                        # shared-db 빌드·알림 상태 전이 테스트 + trpg-bot 테스트

# trpg-bot 단독 작업
cd trpg-bot
pnpm run dev      # tsx src/index.ts (개발)
pnpm typecheck    # tsc --noEmit
pnpm test         # dist 정리 후 tsc 빌드 → node --test (로컬 .env 는 읽지 않음)
pnpm run build    # 이전 dist 를 지우고 tsc → dist/
pnpm start        # node dist/index.js (프로덕션)
```

## 폴더 구조

```
src/
├── index.ts           # 진입점 — Client, 이벤트·명령·컴포넌트 라우팅, 스케줄러 등록, 종료 절차
├── config.ts          # 환경변수 검증 (필수값·URL·주기 범위), config 객체 export
├── commands/          # 슬래시 핸들러 (세션확인·내세션·일정투표·roll·비밀굴림·도움말·음악·상태)와 등록
├── scheduler/         # 알림 스케줄러 팩토리(notification-scheduler.ts) + 종류별 설정(생성·수정·취소·리마인드)
├── services/          # 멤버 동기화, 일정 투표 후보 해석·마감 처리
├── music/             # YouTube 해석·오디오 소스·길드별 세션·상태판·자동 점검
├── db/client.ts       # shared-db 연결·종료·ping
├── slash/ko-names.ts  # 슬래시 명령·옵션 한글 이름 상수
└── utils/             # kst, dice-roller, trpg-calendar-image, trpg-session-message, dm-with-fallback,
                       # operator-alerts, heartbeat, runtime-status, shutdown-state, require-manage-guild
tests/                 # node --test (dist 대상). config 를 불러오는 모듈은 tests/helpers/test-env.mjs 의 applyTestEnv() 후 동적 import
```

## DB 컬렉션

- `trpg_sessions` — trpg-web 세션 일정과 알림 상태 필드
  - 생성 `notification*`, 수정 `updateNotification*`(+`updateNotificationBaseline`), 취소 `cancellationNotification*`
  - 24h 리마인드 `reminder*`, 1h 리마인드 `reminder1h*`
- `trpg_guild_members` — TRPG 길드 멤버 캐시 (`leftAt` 으로 이탈 표시)
- `trpg_session_notifications` — DM/폴백 알림 시도 로그. 리마인드·수정 알림은 회차 키 `roundKey` 를 함께 기록한다

인덱스는 봇이 만들지 않는다. 배포 전 shared-db preflight(`ensureAllIndexes` 계열)로 운영자가 만든다. 1h 리마인드 인덱스 `trpg_sessions_reminder1h_pending`은 정의(`TRPG_SESSION_REMINDER_1H_INDEX_DEFINITION`)만 있으므로 운영자가 따로 생성한다.

## 코딩 컨벤션

- 린터/포매터 미설정 — 글로벌 `script-ordering.md` 규칙 적용
- 활성 도메인 CRUD와 타입은 `@stargate/shared-db`를 단일 출처로 사용
- 시간 계산은 `utils/kst.ts`(KST 고정)를 쓰고 파일마다 복제하지 않는다
- 알림 스케줄러는 `createNotificationScheduler(spec, deps)` 에 의존성을 주입해 DB 없이 테스트한다
- `packages/shared-db/src/crud/__tests__/trpg-sessions-claim-race.test.mjs` 는 Atlas 클러스터의 별도 DB에 접속하므로 사용자 승인 없이 실행하지 않는다
- shared-db 알림 상태 전이 테스트는 `pnpm --filter @stargate/shared-db test:trpg` 로 돌린다. 스크립트가 파일을 명시하는 이유는 같은 폴더의 race 테스트가 글롭에 섞이지 않게 하기 위해서다(글롭으로 바꾸면 CI 가 Atlas 에 접속한다)

## 현재 런타임 경계

- 활성 슬래시: `/세션확인`, `/내세션`, `/일정투표`, `/roll`, `/r`, `/비밀굴림`, `/도움말`, `/음악`, `/상태`(서버 관리 권한)
- 컴포넌트: 음악 상태판 버튼(`trpg:music:v1:*`), `/세션확인` 월 이동 버튼·세션 선택 메뉴(`trpg:session-check:v1:*`)
- 세션 mutation: 봇이 아니라 `trpg-web`에서 수행
- 활성 스케줄러: 생성·수정·취소 알림, 시작 24시간·1시간 전 리마인드(`TRPG_REMINDER_1H=0`이면 1시간 전 끔)
  - GM 본인은 생성·수정·취소 DM에서 제외하고, 리마인드에는 포함한다
- 활성 멤버 처리: 부팅 전체 동기화, add/update/remove 이벤트, 24시간 재동기화
- 운영: 장애 알림(DM·채널), 음악 자동 점검, 생존 신호 파일(게이트웨이 shard 기준, Docker HEALTHCHECK)과 선택적 외부 push
- 과거 RSVP 레거시(`/일정 ...`, `/참여확인`, 참석 버튼, 마감 집계)는 삭제했다. 필요하면 삭제 커밋의 부모에서 복구한다(`git log --diff-filter=D --oneline -- trpg-bot/src/commands/session-create.ts`)

## 환경변수

`.env.example` 과 `docs/SPEC.md` §7 참조.
- 필수: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `MONGODB_URI`, `TRPG_GUILD_ID`, `TRPG_FALLBACK_CHANNEL_ID`, `TRPG_WEB_BASE_URL`(http/https 필수)
- 주요 선택값: `TRPG_MUSIC_CHANNEL_ID`, `TRPG_ALERT_USER_ID`, `TRPG_ALERT_CHANNEL_ID`, `TRPG_REMINDER_1H`, `TRPG_HEARTBEAT_URL`

## 주의사항

- Puppeteer 의존 → `/세션확인` PNG 렌더링을 위해 헤드리스 Chrome 환경 필요 (`RESULT_CARD_IMAGE=0`으로 비활성화 가능)
- `tsx`는 dev 전용, 프로덕션은 반드시 `tsc` 빌드 후 `dist/` 실행
- 캘린더와 알림 일시는 KST 기준
- 주기 환경변수는 허용 범위를 벗어나면 경고 후 기본값을 쓴다 (0ms 폴링·타이머 오버플로 방지)
- main 푸시는 CI `test-trpg`(shared-db 상태 전이 테스트 + typecheck + test) 통과 후에만 Dokploy 배포를 호출한다. 문서·테스트만 바꾼 푸시는 배포하지 않는다. Dokploy Auto Deploy 는 꺼 둔다(켜면 게이트 우회)
- registra-bot과 활성 커맨드·TRPG 전용 컬렉션은 분리됨

## 운영 분리 약속

trpg-bot 은 registra-bot 과 **서로 다른 디스코드 길드**에서만 운영된다.
같은 `stargate` DB를 사용하지만 trpg-bot의 데이터는 `trpg_sessions`,
`trpg_guild_members`, `trpg_session_notifications` 컬렉션에 분리되어 있다.

## 슬래시 커맨드 운영 모드 전환 시 주의

`DISCORD_CLIENT_ID`만 두고 `GUILD_ID`를 비우면 **전역(Global) 등록**, 둘 다 두면
**길드 등록** 이다. 두 모드를 전환할 때 이전 모드의 잔존 슬래시는 자동 정리되지
않으므로, 운영자가 Discord Developer Portal 또는 REST API 로 **수동 정리**해야 한다.
잔존 슬래시가 남아 있으면 같은 이름의 명령이 두 번 보이거나 잘못된 핸들러가
응답할 수 있다. 모든 명령은 `contexts: [Guild]` 로 등록되어 DM 에는 보이지 않는다.
