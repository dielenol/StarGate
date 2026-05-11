# trpg-bot

Discord TRPG 세션 참여 체크 봇. registra-bot과 유사한 구조이나 별도 봇으로 운영.

## 스택

| 항목 | 값 |
|------|-----|
| 런타임 | Node.js ESM (`"type": "module"`) |
| 언어 | TypeScript 5.7, strict, ES2022 target, NodeNext module |
| 봇 프레임워크 | discord.js v14 |
| DB | MongoDB 6 (Atlas, DB명 `trpg_bot`) |
| 이미지 생성 | Puppeteer 24 (결과 카드 PNG) |
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
├── commands/          # 슬래시 커맨드 핸들러 (session-create, session-manage, register)
├── handlers/          # 버튼 인터랙션 핸들러
├── scheduler/         # 폴링 스케줄러 (close-checker 1분, reminder-checker 15분)
├── services/          # 비즈니스 로직 (session-close)
├── db/                # MongoDB 컬렉션별 CRUD
│   └── client.ts      # MongoClient 싱글톤, 인덱스 자동 생성
├── types/             # session.ts, session-log.ts
├── slash/             # 슬래시 커맨드 한국어 이름 상수
└── utils/             # embed, date-time, result-card-image, safe-interaction
```

## DB 컬렉션

- `sessions` — 세션 일정
- `session_responses` — 참여 응답 (sessionId + userId unique)
- `session_logs` — 세션 로그

## 코딩 컨벤션

- 린터/포매터 미설정 — 글로벌 `script-ordering.md` 규칙 적용
- `ResponseStatus`는 `"YES" | "NO"` 이진값
- DB 함수는 `src/db/` 도메인 파일에 분리

## 환경변수

`.env.example` 참조. 필수: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `MONGODB_URI`

## 주의사항

- Puppeteer 의존 → 헤드리스 Chrome 환경 필요 (`RESULT_CARD_IMAGE=0`으로 비활성화 가능)
- `tsx`는 dev 전용, 프로덕션은 반드시 `tsc` 빌드 후 `dist/` 실행
- registra-bot과 구조가 유사하나 DB명(`trpg_bot`)과 커맨드 세부사항이 다름

## 운영 분리 약속

trpg-bot 은 registra-bot 과 **서로 다른 디스코드 길드**에서만 운영된다.
같은 stargate DB의 sessions/session_responses/session_logs 컬렉션을 공유하므로,
같은 길드에 두 봇을 동시에 invite 하면 cross-write 사고가 발생할 수 있다.
Phase 2 에서 trpg-bot 의 기존 스케줄러는 등록이 해제되어 호출되지 않으나,
운영자는 항상 길드 분리를 보장해야 한다.

## 슬래시 커맨드 운영 모드 전환 시 주의

`DISCORD_CLIENT_ID` 만 두고 `GUILD_ID` 를 비우면 **전역(Global) 등록**, 둘 다 두면
**길드 등록** 이다. 두 모드를 전환할 때 이전 모드의 잔존 슬래시는 자동 정리되지
않으므로, 운영자가 Discord Developer Portal 또는 REST API 로 **수동 정리**해야 한다.
잔존 슬래시가 남아 있으면 같은 이름의 명령이 두 번 보이거나 잘못된 핸들러가
응답할 수 있다.
