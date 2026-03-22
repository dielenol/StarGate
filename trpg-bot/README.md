# TRPG 참여 체크 디스코드 봇

TRPG 세션 일정 참여 여부를 디스코드에서 수집하고, 마감 시 자동으로 결과를 집계하는 봇입니다.

## 기능

- **세션 생성**: `/session create` 슬래시 커맨드로 세션 생성
- **참여 응답**: 참석/불참 버튼으로 1인 1상태 응답 (실시간 명단 표시)
- **자동 마감**: 마감 시점에 버튼 비활성화 및 최종 결과 메시지 전송
- **무응답자 표시**: 대상 역할 기준으로 무응답자 명단 출력 (Discord 멘션 형식)

## 요구사항

- Node.js 18+
- MongoDB Atlas (또는 호환 MongoDB)
- Discord Bot Token

## 설정

1. `.env.example`을 복사하여 `.env` 생성
2. `.env`에 다음 값 입력:
   - `DISCORD_TOKEN`: Discord Developer Portal에서 발급한 봇 토큰
   - `DISCORD_CLIENT_ID`: Application ID
   - `MONGODB_URI`: MongoDB 연결 문자열
   - `GUILD_ID`: (선택) 개발용, 특정 서버에만 커맨드 등록 시

## 설치 및 실행

```bash
npm install
npm run run
```

`npm run run`은 빌드 후 바로 실행합니다. (빌드만: `npm run build`, 실행만: `npm start`)

개발 모드 (hot reload):

```bash
npm run dev
```

## 슬래시 커맨드 등록

봇을 처음 실행하면 자동으로 등록됩니다. `GUILD_ID`를 설정하면 해당 서버에만 등록되어 즉시 반영됩니다.

수동 등록만 필요할 때:

```bash
npm run register
```

## 커맨드 사용법

### `/session create`

| 옵션 | 필수 | 설명 |
|------|------|------|
| title | O | 세션명 |
| date | O | 세션 진행 일시 (예: 2026-03-22 20:00) |
| close | O | 응답 마감 일시 (예: 2026-03-20 23:59) |
| role | O | 참여 대상 역할 ID 또는 @역할멘션 (@here, @everyone 불가) |
| channel | - | 공지 채널 ID (미지정 시 현재 채널) |

## 상세 스펙

전체 구현 스펙 및 플랜 대비 현황은 [docs/SPEC.md](docs/SPEC.md)를 참조하세요.

## 라이선스

MIT