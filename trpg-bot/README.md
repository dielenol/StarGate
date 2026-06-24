# TRPG 캘린더 디스코드 봇

`trpg-web`에서 생성·수정·취소된 TRPG 세션을 Discord DM으로 안내하고, `/세션확인`으로 월간 세션 캘린더를 보여주는 봇입니다.

## 기능

- **세션 알림**: `trpg-web` 세션 생성·수정·취소를 폴링해 참가 대상자에게 DM 전송
- **DM 폴백**: DM 차단 사용자에게 지정 채널 멘션으로 동일 내용 안내
- **24시간 전 리마인드**: 예정된 세션 참가자에게 리마인드 DM 전송
- **멤버 동기화**: 운영 길드 멤버를 `trpg_guild_members`에 캐싱
- **세션 확인**: `/세션확인` — 월간 TRPG 캘린더 PNG와 웹 캘린더 링크 응답
- **주사위 롤**: `/roll`, `/r` — Dice Maiden 계열 핵심 주사위 문법 처리

## 요구사항

- Node.js 22.6.0+ 권장
- pnpm workspace
- MongoDB Atlas (trpg-web과 같은 `stargate` DB)
- Discord Bot Token

## 설정

1. `.env.example`을 복사해 `trpg-bot/.env` 생성
2. 필수 값 입력:
   - `DISCORD_TOKEN`: Discord Developer Portal에서 발급한 봇 토큰
   - `DISCORD_CLIENT_ID`: Application ID
   - `MONGODB_URI`: trpg-web과 같은 MongoDB 연결 문자열
   - `TRPG_GUILD_ID`: 운영 Discord 서버 ID
   - `TRPG_FALLBACK_CHANNEL_ID`: DM 실패 시 멘션을 보낼 텍스트 채널 ID
   - `TRPG_WEB_BASE_URL`: 운영 trpg-web URL, 예: `https://dache-calender.vercel.app`
3. `GUILD_ID`는 `/세션확인`을 길드 커맨드로 즉시 등록할 때 사용합니다. 운영에서는 보통 `TRPG_GUILD_ID`와 같은 값으로 둡니다.

기본 DB 이름은 `stargate`이며, 테스트/스테이징만 `MONGODB_DB_NAME`으로 override합니다.

## 로컬 Discord 테스트

코드는 한 벌만 유지하고 Discord Application/Bot과 환경변수만 운영/개발로 분리합니다.
운영 다채봇 토큰으로 로컬 봇을 동시에 실행하지 마세요.

1. Discord Developer Portal에서 개발용 Application/Bot을 하나 만들고 테스트 서버에 초대합니다.
2. `trpg-bot/.env.local.example`을 복사해 `trpg-bot/.env.local`을 만듭니다.
3. `.env.local`에 개발용 봇 토큰, 개발용 Client ID, 테스트 서버 ID를 입력합니다.
4. 주사위 명령만 테스트할 때는 `TRPG_BOT_DICE_ONLY=1`을 유지합니다.

```bash
cd trpg-bot
cp .env.local.example .env.local
pnpm run dev:local
```

`TRPG_BOT_DICE_ONLY=1`에서는 `/roll`, `/r`만 등록하며 MongoDB 연결, 멤버 동기화,
세션 알림/리마인드 폴링을 실행하지 않습니다. `/세션확인`까지 테스트하려면
`TRPG_BOT_DICE_ONLY=0`으로 바꾸고 `.env.local`의 MongoDB, 폴백 채널, 웹 URL 값을
개발용으로 채운 뒤 실행합니다.

## 설치 및 실행

```bash
# 모노레포 루트에서
pnpm install
pnpm run build:shared
pnpm run build:trpg-bot

# 프로덕션 실행
cd trpg-bot
pnpm start
```

개발 모드 (hot reload):

```bash
cd trpg-bot
pnpm dev
```

개발용 봇/env로 실행:

```bash
cd trpg-bot
pnpm run dev:local
```

## 슬래시 커맨드 등록

봇 시작 시 `/세션확인`, `/roll`, `/r`을 자동 등록합니다. `GUILD_ID`를 설정하면 해당 길드에만 즉시 반영되고, 비우면 글로벌 등록이 수행됩니다. 별도의 register 스크립트는 없습니다.
`TRPG_BOT_DICE_ONLY=1`에서는 `/roll`, `/r`만 등록합니다.

## 커맨드 사용법

- `/세션확인`
  - `연도` 선택
  - `월` 선택
  - `모드`: `상세` 또는 `간단`
  - `비공개`: 나에게만 보이도록 응답
- `/roll`, `/r`
  - `식`: `2d6+3`, `4d6 k3`, `6d10 t7`, `6 4d6 k3` 등
  - `비공개`: 나에게만 보이도록 응답

## 상세 스펙

전체 구현 스펙 및 플랜 대비 현황은 [docs/SPEC.md](docs/SPEC.md)를 참조하세요.

## 배포

`registra-bot`과 같은 Docker/Dokploy 방식으로 배포합니다.

- Build context: 저장소 루트(`/`)
- Dockerfile path: `trpg-bot/Dockerfile`
- Runtime env: `trpg-bot/.env.example`의 필수 값을 Dokploy 환경변수에 설정
- 앱 타입: long-running worker/service. Vercel serverless 대상이 아님

PM2 설정 파일은 로컬 또는 별도 VM에서 수동 운영할 때만 사용하는 보조 설정입니다.

## 라이선스

MIT
