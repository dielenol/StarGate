# trpg-bot

`trpg-web` 세션을 Discord에 안내하는 장기 실행 봇. 월간 캘린더 조회, 주사위 굴림, 생성·수정·취소 알림, 시작 24시간 전 리마인드와 길드 멤버 동기화를 담당한다.

## 스택

| 항목 | 값 |
|------|-----|
| 런타임 | Node.js ESM (`"type": "module"`) |
| 언어 | TypeScript 5.7, strict, ES2022 target, NodeNext module |
| 봇 프레임워크 | discord.js v14 |
| DB | MongoDB 6/Atlas, 통합 DB `stargate` |
| 이미지 생성 | Puppeteer 24 (월간 캘린더 PNG) |
| 환경변수 | dotenv |
| 패키지 매니저 | pnpm (루트 workspace 멤버 — `pnpm-workspace.yaml` 에 등록) |

## 실행

```bash
# 루트 디렉터리에서
pnpm install                              # 워크스페이스 전체 의존성 설치

# trpg-bot 단독 작업
cd trpg-bot
pnpm run dev      # tsx src/index.ts (개발)
pnpm run build    # tsc → dist/
pnpm start        # node dist/index.js (프로덕션)
pnpm run run      # build + start 일괄
```

## 폴더 구조

```
src/
├── index.ts           # 진입점 — Client 초기화, 이벤트·스케줄러 등록
├── config.ts          # 환경변수 검증, config 객체 export
├── commands/          # 활성 슬래시 핸들러 (/세션확인, /roll, /r)와 등록 코드
├── handlers/          # 비활성 버튼 인터랙션 보존 코드
├── scheduler/         # trpg-web 알림/리마인드 폴링 스케줄러
├── services/          # 멤버 동기화 + 비활성 세션 마감 코드
├── db/                # shared-db 연결 shim + 비활성 레거시 CRUD
│   └── client.ts      # shared-db 연결·인덱스 초기화
├── types/             # 비활성 레거시 세션 타입
├── slash/             # 슬래시 커맨드 한국어 이름 상수
└── utils/             # embed, date-time, result-card-image, safe-interaction
```

## DB 컬렉션

- `trpg_sessions` — trpg-web 세션 일정
- `trpg_guild_members` — TRPG 길드 멤버 캐시
- `trpg_session_notifications` — DM/폴백 알림 시도 로그

## 코딩 컨벤션

- 린터/포매터 미설정 — 글로벌 `script-ordering.md` 규칙 적용
- 현재 `TrpgSession.status`는 `"open" | "cancelled"`
- 활성 도메인 CRUD와 타입은 `@stargate/shared-db`를 단일 출처로 사용

## 현재 런타임 경계

- 활성 슬래시: `/세션확인`, `/roll`, `/r`
- 세션 mutation: 봇이 아니라 `trpg-web`에서 수행
- 활성 스케줄러: 생성·수정·취소 알림, 시작 24시간 전 리마인드
- 활성 멤버 처리: 부팅 전체 동기화, add/update/remove 이벤트, 24시간 재동기화
- 비활성 레거시: `/일정 ...`, `/참여확인`, RSVP 버튼, 응답 마감·집계 스케줄러와 결과 카드
- 비활성 파일은 보존되어 있으나 `src/index.ts`에서 import하지 않는다.

## 환경변수

`.env.example` 참조. 필수: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `MONGODB_URI`, `TRPG_GUILD_ID`, `TRPG_FALLBACK_CHANNEL_ID`, `TRPG_WEB_BASE_URL`

## 주의사항

- Puppeteer 의존 → `/세션확인` PNG 렌더링을 위해 헤드리스 Chrome 환경 필요 (`RESULT_CARD_IMAGE=0`으로 비활성화 가능)
- `tsx`는 dev 전용, 프로덕션은 반드시 `tsc` 빌드 후 `dist/` 실행
- 캘린더와 알림 일시는 KST 기준
- registra-bot과 활성 커맨드·TRPG 전용 컬렉션은 분리됨

## 운영 분리 약속

trpg-bot 은 registra-bot 과 **서로 다른 디스코드 길드**에서만 운영된다.
같은 `stargate` DB를 사용하지만 trpg-bot의 활성 데이터는 `trpg_sessions`,
`trpg_guild_members`, `trpg_session_notifications` 컬렉션에 분리되어 있다.
비활성 레거시 코드는 registra-bot과 같은 `sessions` 계열 컬렉션을 참조하므로,
향후 재활성화할 때는 운영 길드와 데이터 소유권을 다시 검토해야 한다.

## 슬래시 커맨드 운영 모드 전환 시 주의

`DISCORD_CLIENT_ID`만 두고 `GUILD_ID`를 비우면 **전역(Global) 등록**, 둘 다 두면
**길드 등록** 이다. 두 모드를 전환할 때 이전 모드의 잔존 슬래시는 자동 정리되지
않으므로, 운영자가 Discord Developer Portal 또는 REST API 로 **수동 정리**해야 한다.
잔존 슬래시가 남아 있으면 같은 이름의 명령이 두 번 보이거나 잘못된 핸들러가
응답할 수 있다.
