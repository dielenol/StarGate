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
| 패키지 매니저 | npm (독립 패키지, 루트 pnpm workspace 외부) |

## 실행

```bash
npm install       # 의존성 설치
npm run dev       # tsx src/index.ts (개발)
npm run build     # tsc → dist/
npm start         # node dist/index.js (프로덕션)
npm run run       # build + start 일괄
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
