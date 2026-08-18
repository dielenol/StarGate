# TRPG 캘린더 디스코드 봇

`trpg-web`에서 관리하는 TRPG 세션을 Discord에 안내하고 YouTube 오디오를 음성 채널에서 재생하는 봇입니다. 월간 세션 조회, 주사위 굴림, 세션 알림·리마인드, 운영 길드 멤버 동기화와 표준 음악 대기열을 담당합니다.

## 현재 활성 기능

| 구분 | 기능 |
| --- | --- |
| 도움말 | `/도움말`로 전체 또는 세션·주사위·음악별 사용법과 실행 예시 제공 |
| 세션 조회 | `/세션확인`으로 월간 캘린더 PNG, 세션 요약·상세, 웹 캘린더 링크 제공 |
| 주사위 | `/roll`, `/r`로 Dice Maiden 계열 핵심 문법 처리 |
| YouTube 음악 | `/음악`의 한글 서브커맨드로 검색·URL 재생과 대기열·음성 연결 제어 |
| 세션 알림 | `trpg-web`의 세션 생성·수정·취소를 폴링해 참가자에게 안내 |
| 24시간 리마인드 | 시작 약 24시간 전 참가자에게 1회 안내 |
| DM 폴백 | DM 실패 시 지정 채널에서 대상자를 멘션하고 같은 안내 전송 |
| 운영 장애 알림 | 음악·Discord 주요 런타임 장애를 운영자 DM과 선택적 로그 채널로 전송 |
| 멤버 동기화 | 시작 시 전체 동기화, 가입·변경·퇴장 이벤트 반영, 24시간마다 재동기화 |

세션 생성·수정·취소와 참가자 선택은 `trpg-web`에서 수행합니다. 과거 `/일정 ...` 관리 명령, 참석·불참 버튼, 응답 마감·집계 기능은 코드만 보존되어 있고 현재 실행되지 않습니다.

## 요구사항

- Node.js 22.12.0+
- pnpm workspace
- MongoDB Atlas (trpg-web과 같은 `stargate` DB)
- Discord Bot Token
- FFmpeg와 최신 yt-dlp (`yt-dlp[default]`, Node.js EJS runtime 사용)

Docker 이미지에는 FFmpeg와 고정된 yt-dlp **nightly** 버전이 포함됩니다. YouTube가 player client를 조일 때마다 stable 릴리스는 수 주 뒤처지고 그 사이 재생이 HTTP 403으로 깨지므로, nightly 채널을 고정 버전으로 사용합니다. 로컬 또는 PM2 실행에서는 두 실행파일을 `PATH`에 두거나 `YT_DLP_PATH`, `FFMPEG_PATH`로 절대 경로를 지정해야 합니다.

## 설정

1. `.env.example`을 복사해 `trpg-bot/.env` 생성
2. 필수 값 입력:
   - `DISCORD_TOKEN`: Discord Developer Portal에서 발급한 봇 토큰
   - `DISCORD_CLIENT_ID`: Application ID
   - `MONGODB_URI`: trpg-web과 같은 MongoDB 연결 문자열
   - `TRPG_GUILD_ID`: 운영 Discord 서버 ID
   - `TRPG_FALLBACK_CHANNEL_ID`: DM 실패 시 멘션을 보낼 텍스트 채널 ID
   - `TRPG_MUSIC_CHANNEL_ID`: 음악 기능 사용 시 필수. 명령과 단일 상태판을 둘 일반 텍스트 채널 ID
   - `TRPG_ALERT_USER_ID`: 운영 장애 DM을 받을 본인의 Discord 사용자 ID. 운영 환경에서는 설정 권장
   - `TRPG_ALERT_CHANNEL_ID`: 선택. 운영 장애를 별도 메시지로 남길 일반 텍스트 채널 ID
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

봇 시작 시 `/도움말`, `/세션확인`, `/roll`, `/r`, `/음악`을 자동 등록합니다. `GUILD_ID`를 설정하면 해당 길드에만 즉시 반영되고, 비우면 글로벌 등록이 수행됩니다. 별도의 register 스크립트는 없습니다.

길드 등록과 글로벌 등록을 전환해도 이전 범위의 커맨드는 자동 삭제되지 않습니다. 중복 커맨드가 남으면 Discord Developer Portal 또는 REST API에서 이전 등록을 정리해야 합니다.

## 커맨드 사용법

- `/도움말`
  - 미입력 시 현재 활성 명령 전체의 설명과 대표 예시를 비공개 임베드로 표시
  - `기능`: `전체 명령`, `세션 확인`, `주사위`, `YouTube 음악` 중 상세 항목 선택
  - 예: `/도움말 기능:YouTube 음악`
- `/세션확인`
  - `연도`, `월`: 미입력 시 KST 기준 현재 연·월
  - `모드`: `상세 보기` 또는 `요약만 보기`
  - `비공개`: 나에게만 보이도록 응답
  - 선택한 달의 `open` 세션 중 KST 오늘 날짜 이후 일정만 표시
- `/roll`, `/r`
  - `식`: 예) `2d6+3`, `4d6 k3`, `6d10 t7`, `+d20`
  - `비공개`: 나에게만 보이도록 응답
  - `식:help`로 지원 문법 확인
- `/음악 재생 검색어:<YouTube 링크 또는 검색어>`
  - `TRPG_MUSIC_CHANNEL_ID`로 지정한 전용 텍스트 채널에서만 실행됩니다.
  - 사용자가 들어가 있는 일반 음성 채널에 참가해 재생합니다.
  - 재생 중이면 최대 100곡의 인메모리 대기열에 추가합니다.
  - 길드별 YouTube 정보 해석은 동시에 2건까지만 처리하며, 해석 중인 요청도 대기열 자리를 예약합니다.
  - URL은 YouTube 계열 도메인만 허용하며 재생목록 파라미터가 있어도 한 영상만 처리합니다.
- `/음악 재생목록 링크:<YouTube 재생목록 URL>`
  - 명시적인 `list` 식별자가 있는 링크만 허용하며 재생목록 순서를 유지합니다.
  - 한 요청에서는 최대 50곡, 길드의 현재 곡을 포함한 전체 대기열은 최대 100곡입니다.
  - 비공개·삭제 영상은 제외하고 실제 오디오는 각 곡의 재생 직전에 해석합니다.
- `/음악 일시정지`, `/음악 재개`, `/음악 건너뛰기`
  - 봇과 같은 음성 채널에 있는 사용자만 제어할 수 있습니다.
- `/음악 반복 모드:<끔|현재 곡|대기열 전체>`
  - 정상적으로 곡이 끝났을 때만 반복하며 오류가 발생했거나 직접 건너뛴 곡은 즉시 반복하지 않습니다.
- `/음악 초기화`
  - 현재 곡·예약곡·처리 중인 검색/재생목록 요청·반복 설정을 모두 정리하되 음성 채널에는 남습니다.
- `/음악 대기열`
  - 현재 곡, 실제 음질 경로와 다음 10곡을 표시합니다.
- `/음악 퇴장`
  - 재생·대기열을 정리하고 음성 채널에서 나갑니다.

음악 대기열은 DB에 저장하지 않으므로 프로세스를 재시작하면 초기화됩니다. 청취자가 없으면 30초 뒤, 대기열이 빈 상태가 5분 지속되면 자동 퇴장합니다.

### 음악 전용 채널과 상태판

- 모든 음악 명령 응답은 명령을 실행한 사용자에게만 보이는 비공개 메시지입니다.
- 전용 채널에는 봇이 소유한 상태판 임베드 한 개만 공개로 유지합니다.
- 재생 준비·재생 중·일시정지·반복·대기열·오류·초기화·자동 퇴장 상태는 새 메시지를 보내지 않고 같은 상태판을 수정합니다.
- 상태가 빠르게 연속 변경되면 현재 수정 중인 화면과 가장 최신 화면만 반영해 Discord 요청 적체를 방지합니다.
- 봇이 재시작되면 최근 메시지에서 상태판 표식을 찾아 재사용하며, 없을 때만 새로 생성합니다.
- 사용자의 일반 메시지 전송 권한은 꺼도 되지만 `채널 보기`, `애플리케이션 명령어 사용` 권한은 허용해야 합니다. 봇에는 `채널 보기`, `메시지 전송`, `메시지 기록 보기`, `링크 임베드` 권한이 필요합니다.

### 운영 장애 알림

- `TRPG_ALERT_USER_ID`를 설정하면 슬래시 커맨드 등록, 음악 런타임 초기화, Discord 클라이언트, 음악 상태판·명령, 음성 연결 장애를 해당 사용자에게 DM으로 보냅니다.
- 재생 소스의 일시적인 단건 실패는 상태판에만 표시합니다. 5분 안에 3곡이 연속 실패할 때 운영 장애로 알립니다.
- 같은 종류의 장애는 10분 동안 한 번만 보내 Discord 오류 폭주를 막습니다.
- `TRPG_ALERT_CHANNEL_ID`를 설정하면 DM 성공 여부와 관계없이 다채봇이 해당 채널에 별도 임베드 메시지도 남깁니다. 음악 상태판 메시지를 운영 로그로 덮어쓰지 않습니다.
- 알림에는 오류 스택이나 미디어 URL을 싣지 않으며 URL·토큰·인증값을 제거한 짧은 오류 요약만 포함합니다.
- 봇 프로세스나 호스트 자체가 완전히 종료되면 봇이 직접 DM을 보낼 수 없습니다. 무응답·프로세스 종료 감지는 Dokploy/외부 업타임 모니터를 별도로 사용해야 합니다.

### 음악 음질 경로

- YouTube가 WebM/Opus를 제공하면 컨테이너만 분리하고 Opus 프레임을 Discord에 그대로 전달합니다.
- AAC·HLS·라이브처럼 직접 전달할 수 없는 소스만 FFmpeg에서 48 kHz stereo, Opus 128 kbps VBR로 한 번 변환합니다.
- 재생 준비 중 `건너뛰기`·`초기화`·`퇴장`·연결 종료가 발생하면 진행 중인 미디어 요청을 취소하며, 응답 헤더와 첫 오디오 데이터에는 각각 20초 제한을 적용합니다.
- 인라인 볼륨·EQ·필터를 두지 않아 추가 디코딩/재인코딩과 100% 초과 증폭 클리핑을 피합니다. 음량은 각 사용자의 Discord 클라이언트에서 조절합니다.
- 사용자별 음량은 음성 채널에서 다채봇을 우클릭한 뒤 `사용자 음량` 슬라이더로 조절합니다.
- Discord 음성 연결은 최신 `@discordjs/voice`의 DAVE 종단간 암호화를 사용합니다.

### YouTube 403 대응

`YouTube Opus 스트림 연결에 실패했습니다 (HTTP 403)` 이 반복되면 googlevideo가 미디어 URL 자체를 거부한 상태입니다. 대응 순서:

1. **player client 교체 (재배포 불필요)** — `YT_DLP_PLAYER_CLIENTS`를 다른 조합으로 바꾸고 재기동합니다. 기본값은 gvs PO token을 요구하지 않는 `tv,visionos`이며, 403이 나면 봇이 자동으로 폴백 프로필(`visionos,tv_downgraded` + HLS·m4a 허용)로 한 번 재해석합니다. PO token 없이 HTTPS 음원을 받을 수 있는 client는 `tv`, `tv_downgraded`, `visionos`, `web_embedded` 뿐이므로 `android*`·`ios`·`mweb`·`web`·`web_safari`는 provider 없이 지정하지 않습니다. 존재하지 않는 client 이름을 넣으면 yt-dlp가 경고만 남기고 자체 기본값으로 되돌아갑니다(봇은 `--no-warnings`로 실행하므로 로그에 보이지 않음) — 값을 바꿀 때는 [yt-dlp의 client 목록](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/youtube/_base.py)과 대조하세요.
2. **yt-dlp nightly 승급** — `Dockerfile`의 `ARG YT_DLP_VERSION`을 [최신 nightly](https://pypi.org/project/yt-dlp/#history)로 올려 재빌드합니다. 기본 player client가 막힌 경우 upstream이 며칠 안에 교체하므로 이 경로가 가장 확실합니다.
3. **PO token 붙이기** — 서버 IP가 YouTube에 플래그된 경우 PO token 없이는 풀리지 않습니다. POT provider 컨테이너를 띄우고 `YT_DLP_POT_PROVIDER_URL`을 지정합니다. 플러그인(`bgutil-ytdlp-pot-provider`)은 이미지에 포함되어 있어 주소만 주면 동작합니다.

   ```bash
   docker run --name bgutil-provider -d --init --restart unless-stopped \
     brainicism/bgutil-ytdlp-pot-provider
   ```

   봇 컨테이너와 같은 Docker 네트워크에 두고 `YT_DLP_POT_PROVIDER_URL=http://bgutil-provider:4416`을 설정합니다. PO token은 403 우회를 보장하지 않고 트래픽을 더 정상처럼 보이게 하는 수단입니다.

현재 사용 중인 런타임 버전은 기동 로그의 `음악 런타임 준비 완료 — yt-dlp=…` 줄에서 확인합니다.

YouTube 추출 방식은 서비스 정책이나 서명 변경에 따라 중단될 수 있습니다. 운영자는 [YouTube 서비스 약관과 개발자 정책](https://developers.google.com/youtube/terms/developer-policies), 콘텐츠 저작권과 재생 권한을 확인해야 합니다.

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
- 이미지 내장 런타임: FFmpeg, `yt-dlp[default]` nightly(`ARG YT_DLP_VERSION`), `bgutil-ytdlp-pot-provider` 플러그인, Node.js 22 EJS runtime
- 앱 타입: long-running worker/service. Vercel serverless 대상이 아님

PM2 설정 파일은 로컬 또는 별도 VM에서 수동 운영할 때만 사용하는 보조 설정입니다.

## 라이선스

MIT
