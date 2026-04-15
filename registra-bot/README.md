# 레지스트라(REGISTRAR) — NOVUS ORDO 통합 일정 봇

Discord에서 **등록 일정**을 공지하고, 대상 역할에 **가용·불가** 응답을 수집한 뒤 마감 시 **확정 보고**를 올리는 봇입니다. 페르소나는 설정상 **REGISTRAR(아그네타 스톨)** — 일정 총괄 비서 톤의 문구를 사용합니다.

NPC·세계관 참고: [docs/NPC-REFERENCES.md](docs/NPC-REFERENCES.md)

## 기능

- **등록**: `/일정 생성` — **서버 관리** 권한, 공지는 채널 전체 공개
- **응답**: **가용** / **불가** 버튼, 1인 1상태 (마감 전 변경 가능)
- **자동 마감**: `closeDateTime`에 버튼 비활성화 및 확정 보고 메시지
- **미제출자**: 대상 역할 기준 무응답 명단 (멘션 형식)
- **한눈에·집계·달력**: `/일정 한눈에`, `/일정 집계`, `/일정 달력` — 동작은 [docs/SPEC.md](docs/SPEC.md) 참고
- **내 가용 일정**: `/일정 참여확인` — 본인이 **가용(YES)**만 에페메랄로 모음 (월간 PNG는 쿨다운·설정에 따름)

## 요구사항

- Node.js 18+
- MongoDB (기본 DB 이름: `registrar_bot`, `MONGODB_DB_NAME`로 변경 가능)
- Discord Bot Token

## 설정

1. `.env.example`을 복사해 `.env` 생성
2. `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `MONGODB_URI` 필수
3. `GUILD_ID` (선택): 해당 길드에만 슬래시 등록
4. `MONGODB_DB_NAME` (선택): 기본 `registrar_bot`
5. `RESULT_CARD_IMAGE`, `PARTICIPATION_CHECK_IMAGE_COOLDOWN_MINUTES`, `PNG_RENDER_MIN_INTERVAL_MS` — PNG 관련은 SPEC 참고

## 실행

```bash
npm install
npm run run
```

개발: `npm run dev`

## 슬래시 등록

봇 기동 시 `ClientReady`에서 자동 등록합니다.

## 배포

OCI VM 한 대에서 다른 봇과 함께 `PM2`로 운영하려면 루트 문서인 [`docs/OCI_COMPUTE_PM2_MULTI_BOT_DEPLOYMENT.md`](../docs/OCI_COMPUTE_PM2_MULTI_BOT_DEPLOYMENT.md)를 참고하세요.

공용 PM2 설정 파일은 [`deploy/pm2/ecosystem.config.cjs`](../deploy/pm2/ecosystem.config.cjs)에 있습니다.

## 기술 메모

- 버튼 `customId` 접두사: `registrar:attend:` (다른 봇·복제본과 분리)
- 슬래시 옵션 **등록아이디**: MongoDB 문서 `_id` 문자열

## 라이선스

MIT


## Discord Nickname → Character Name 
- "춤추기사랑하기노래부르기" → "빅보이"
- "라면" → "클라운"
- "모스" → "인덱서"
- "세슘" → "메리골드"
- "대형마법" → "우디"
- "Bush Dog" → "네베드"
- "힘이" → "타이거 씨"/"시유 씨"
- "Arkaiyu" → "마리아"
- "치자도우" → "이동식"
- "버터누나" → "오틸리아"
- "홀로서기" → "운연"
- "순대/soondae" → "크로노스"
- "pitboy"/"흑우"/"레놀" → "GM님"/"마스터님"
