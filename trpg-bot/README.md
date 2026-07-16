# TRPG 캘린더 디스코드 봇

`trpg-web`에서 관리하는 TRPG 세션을 Discord에 안내하는 봇입니다. 월간 세션 조회, 주사위 굴림, 세션 생성·수정·취소 알림, 시작 24시간 전 리마인드와 운영 길드 멤버 동기화를 담당합니다.

## 현재 활성 기능

| 구분 | 기능 |
| --- | --- |
| 세션 조회 | `/세션확인`으로 월간 캘린더 PNG, 세션 요약·상세, 웹 캘린더 링크 제공 |
| 주사위 | `/roll`, `/r`로 Dice Maiden 계열 핵심 문법 처리 |
| 세션 알림 | `trpg-web`의 세션 생성·수정·취소를 폴링해 참가자에게 안내 |
| 24시간 리마인드 | 시작 약 24시간 전 참가자에게 1회 안내 |
| DM 폴백 | DM 실패 시 지정 채널에서 대상자를 멘션하고 같은 안내 전송 |
| 멤버 동기화 | 시작 시 전체 동기화, 가입·변경·퇴장 이벤트 반영, 24시간마다 재동기화 |

세션 생성·수정·취소와 참가자 선택은 `trpg-web`에서 수행합니다. 과거 `/일정 ...` 관리 명령, 참석·불참 버튼, 응답 마감·집계 기능은 코드만 보존되어 있고 현재 실행되지 않습니다.

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
3. `GUILD_ID`는 활성 슬래시 커맨드를 길드 커맨드로 즉시 등록할 때 사용합니다. 운영에서는 보통 `TRPG_GUILD_ID`와 같은 값으로 둡니다.

기본 DB 이름은 `stargate`이며, 테스트/스테이징만 `MONGODB_DB_NAME`으로 override합니다.

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

## 슬래시 커맨드 등록

봇 시작 시 `/세션확인`, `/roll`, `/r`을 자동 등록합니다. `GUILD_ID`를 설정하면 해당 길드에만 즉시 반영되고, 비우면 글로벌 등록이 수행됩니다. 별도의 register 스크립트는 없습니다.

길드 등록과 글로벌 등록을 전환해도 이전 범위의 커맨드는 자동 삭제되지 않습니다. 중복 커맨드가 남으면 Discord Developer Portal 또는 REST API에서 이전 등록을 정리해야 합니다.

## 커맨드 사용법

- `/세션확인`
  - `연도`, `월`: 미입력 시 KST 기준 현재 연·월
  - `모드`: `상세` 또는 `간단`
  - `비공개`: 나에게만 보이도록 응답
  - 선택한 달의 `open` 세션 중 KST 오늘 날짜 이후 일정만 표시
- `/roll`, `/r`
  - `식`: 예) `2d6+3`, `4d6 k3`, `6d10 t7`, `+d20`
  - `비공개`: 나에게만 보이도록 응답
  - `식:help`로 지원 문법 확인

모든 슬래시 커맨드는 `TRPG_GUILD_ID`로 지정된 운영 길드의 채널에서만 실행됩니다.

## 자동 알림

- 생성·수정·취소 알림은 기본 1분마다 확인합니다.
- 시작 24시간 전 리마인드는 기본 5분마다 확인합니다.
- 안내에는 제목, KST 일시, 마스터, 참가자와 웹 캘린더 버튼이 포함됩니다.
- 수정 알림에는 변경 요약이 추가됩니다.
- DM·폴백·실패 결과는 `trpg_session_notifications`에 기록됩니다.

## 상세 스펙

현재 활성 기능과 비활성 레거시의 경계는 [docs/SPEC.md](docs/SPEC.md)를 참조하세요. [trpg-discord-bot-plan.md](trpg-discord-bot-plan.md)는 초기 RSVP 봇 설계 기록이며 현재 동작 명세가 아닙니다.

## 배포

`registra-bot`과 같은 Docker/Dokploy 방식으로 배포합니다.

- Build context: 저장소 루트(`/`)
- Dockerfile path: `trpg-bot/Dockerfile`
- Runtime env: `trpg-bot/.env.example`의 필수 값을 Dokploy 환경변수에 설정
- 앱 타입: long-running worker/service. Vercel serverless 대상이 아님

PM2 설정 파일은 로컬 또는 별도 VM에서 수동 운영할 때만 사용하는 보조 설정입니다.

## 라이선스

MIT
