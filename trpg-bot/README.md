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
- `/음악 볼륨 [퍼센트]`
  - 0~200% 범위. 생략하면 현재 음량만 확인합니다. 기본값은 100%입니다.
  - **100%가 아니면 무손실 Opus 전달 대신 FFmpeg 변환 경로를 사용합니다.** Opus 인코더 의존성을 추가하지 않고 음량을 조절하는 방법이 FFmpeg 필터뿐이기 때문입니다. 기본 음량으로 듣는 동안은 기존과 같이 무손실입니다.
  - 재생 중에 바꾸면 현재 곡을 **재생 위치부터 이어서** 다시 엽니다(약 1~2초 끊김). 라이브 스트림은 위치 탐색이 되지 않아 처음부터 다시 엽니다.
  - 100%를 넘기면 증폭이므로 원음에 따라 소리가 깨질 수 있습니다. 명령 응답에 경고가 함께 표시됩니다.
  - 개별 사용자 음량만 조절하고 싶으면 음성 채널에서 다채봇을 우클릭해 `사용자 음량` 슬라이더를 쓰는 편이 음질 손실이 없습니다.
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
- 재생 소스의 일시적인 단건 실패는 상태판에만 표시합니다. 중간 성공 여부와 관계없이 1시간 안에 3회 실패하면 반복 운영 장애로 알립니다.
- 같은 종류의 장애는 10분 동안 한 번만 보내 Discord 오류 폭주를 막습니다.
- `TRPG_ALERT_CHANNEL_ID`를 설정하면 DM 성공 여부와 관계없이 다채봇이 해당 채널에 별도 임베드 메시지도 남깁니다. 음악 상태판 메시지를 운영 로그로 덮어쓰지 않습니다.
- 알림에는 오류 스택이나 미디어 URL을 싣지 않으며 URL·토큰·인증값을 제거한 짧은 오류 요약만 포함합니다.
- 봇 프로세스나 호스트 자체가 완전히 종료되면 봇이 직접 DM을 보낼 수 없습니다. 무응답·프로세스 종료 감지는 Dokploy/외부 업타임 모니터를 별도로 사용해야 합니다.

### 음악 음질 경로

- YouTube가 WebM/Opus를 제공하면 컨테이너만 분리하고 Opus 프레임을 Discord에 그대로 전달합니다.
- AAC·HLS·라이브처럼 직접 전달할 수 없는 소스만 FFmpeg에서 48 kHz stereo, Opus 128 kbps VBR로 한 번 변환합니다.
- WebM/Opus 직접 경로는 512 KiB 연속 HTTP Range 요청으로 수신합니다. 응답이 오류나 조기 EOF로 끊기면 마지막으로 전달한 바이트부터 각 중단마다 최대 2회 이어받습니다.
- Range 재시도 후에도 직접 Opus 스트림이 끊기거나 곡 길이보다 5초를 초과해 일찍 끝나면 현재 재생 위치부터 FFmpeg 안정 경로로 한 번 복구합니다.
- 재생 준비 중 `건너뛰기`·`초기화`·`퇴장`·연결 종료가 발생하면 진행 중인 미디어 요청을 취소하며, 각 Range 응답과 오디오 데이터 수신에는 20초 제한을 적용합니다.
- 음량이 기본값(100%)이면 인라인 볼륨·EQ·필터를 두지 않아 추가 디코딩/재인코딩을 피합니다. `/음악 볼륨`으로 100%가 아닌 값을 지정하면 그 세션에서만 FFmpeg 음량 필터를 사용합니다.
- 사용자별 음량은 음성 채널에서 다채봇을 우클릭한 뒤 `사용자 음량` 슬라이더로 조절합니다.
- Discord 음성 연결은 최신 `@discordjs/voice`의 DAVE 종단간 암호화를 사용합니다.

### YouTube 403 대응

`YouTube Opus 스트림 연결에 실패했습니다 (HTTP 403)` 이 반복되면 googlevideo가 미디어 URL 자체를 거부한 상태입니다. 원인은 두 갈래입니다 — **player client가 막혔거나**, **서버 IP가 YouTube에 플래그된 것**입니다.

#### 이미지에 이미 들어 있는 대응

- **PO token** — bgutil POT provider를 봇과 같은 컨테이너에서 함께 띄웁니다(`docker-entrypoint.sh`). `YT_DLP_POT_PROVIDER_URL`은 `http://127.0.0.1:4416`으로 기본 설정되어 있어 별도 구성이 필요 없습니다. Dokploy Application은 사이드카를 붙일 수 없어 이 방식을 택했습니다. 메모리를 아끼려면 `POT_PROVIDER_DISABLED=1`로 끌 수 있습니다(대신 PO token 없이 동작).
- **클라이언트 폴백** — 403이 나면 봇이 자동으로 기본 프로필(`visionos`)에서 폴백 프로필(`web_safari` + HLS·m4a 허용)로 한 번 교체해 다시 해석합니다. 폴백은 PO token을 사용하므로 provider가 떠 있어야 신뢰할 수 있습니다.

#### player client 실측값 (2026-08-18, yt-dlp 2026.8.18 nightly)

| client | 상태 |
|--------|------|
| `visionos` | 정상. PO token 없이 WebM/Opus HTTPS 음원 |
| `web_safari` | 정상이나 gvs PO token 필요 → provider 전제 |
| `web` | 동일 (PO token 필요) |
| `tv`, `tv_downgraded` | **불가** — `The page needs to be reloaded` 로 URL 미수신 |
| `android*`, `ios`, `mweb`, `tv_simply` | PO token 필요 |

`tv` 계열은 SABR-only 실험에 걸려 https 포맷이 URL 없이 오는 사례도 관측됐습니다. TVHTML5 계열이 회복되면 후보로 되돌릴 수 있습니다.

#### 여전히 403일 때

1. **player client 교체 (재배포 불필요)** — `YT_DLP_PLAYER_CLIENTS`를 위 표의 정상 클라이언트로 바꾸고 재기동합니다. 존재하지 않는 client 이름을 넣으면 yt-dlp가 경고만 남기고 자체 기본값으로 되돌아갑니다(봇은 `--no-warnings`로 실행하므로 로그에 보이지 않음).
2. **yt-dlp nightly 승급** — `Dockerfile`의 `ARG YT_DLP_VERSION`을 [최신 nightly](https://pypi.org/project/yt-dlp/#history)로 올려 재빌드합니다. 기본 client가 막힌 경우 upstream이 며칠 안에 교체하므로 이 경로가 가장 확실합니다.
3. **쿠키 또는 프록시** — IP 평판 문제가 PO token으로도 풀리지 않으면 남는 수단입니다.

### 일일 자동 점검

봇이 스스로 하루 한 번 음악 해석 경로를 점검하고, 나빠질 때만 알립니다.

- **언제** — 기동 1분 뒤 1회, 이후 24시간 주기 (`TRPG_MUSIC_HEALTHCHECK_INTERVAL_MS`)
- **어디서** — 봇 프로세스 안에서 실제 해석 코드로 수행합니다. YouTube 차단은 서버 IP 에서만 재현되므로 외부 CI(GitHub Actions 등)에서 돌리면 의미가 없습니다.
- **무엇을** — 해석 프로필별로 실제 재생과 같은 연속 Range 경로를 최대 8 MiB까지 소비합니다. 기본 점검 영상은 전체 미디어를 확인하며, 음성 채널에는 연결하지 않아 사용자에게 보이지 않습니다.
- **판정** — `healthy`(기본 프로필 정상) / `degraded`(폴백만 정상) / `down`(전부 실패). 프로필을 나눠 보는 이유는 1순위 client 가 죽었는데 폴백이 가려주는 상태를 미리 잡기 위해서입니다.
- **알림** — `down`은 critical, `degraded`는 warning 으로 DM + `TRPG_ALERT_CHANNEL_ID` 에 보냅니다. 프로필별 실패 단계(URL 해석 / 미디어 수신), HTTP 상태, 실행 중인 yt-dlp 버전이 함께 실립니다. **정상일 때는 아무 메시지도 보내지 않습니다.** 실패 뒤 정상으로 돌아오면 복구 알림을 한 번 보냅니다.
- 일시적 네트워크 오류로 알림이 뜨지 않게 프로필마다 최대 2회 시도합니다.
- 끄려면 `TRPG_MUSIC_HEALTHCHECK=0`. 점검 영상은 `TRPG_MUSIC_HEALTHCHECK_VIDEO_URL` 로 바꿉니다(삭제·지역차단되지 않는 공개 영상을 쓰세요 — 그런 영상을 지정하면 점검이 항상 실패합니다. 다만 알림에 실패 단계가 실리므로 "영상 없음"과 "403 차단"은 구분됩니다).

#### 진단

재생 실패가 중간 성공 여부와 관계없이 1시간 안에 3회 발생하면 운영 알림(DM·`TRPG_ALERT_CHANNEL_ID`)에 **실행 중인 yt-dlp 버전·player client·POT provider 주소**가 함께 실립니다. 서버 로그 없이 Discord에서 바로 확인할 수 있습니다.

컨테이너에 접근할 수 있으면 다음으로 한 번에 판정합니다:

```bash
docker exec $(docker ps --format '{{.Names}}' | grep -i trpg | head -1) bash -c 'yt-dlp --version; URL=$(yt-dlp --ignore-config --no-warnings --js-runtimes node --extractor-args "youtube:player_client=visionos" -f "bestaudio[ext=webm][acodec^=opus]/bestaudio" -g -- "https://www.youtube.com/watch?v=dQw4w9WgXcQ" | head -1); curl -s -o /dev/null -w "media=%{http_code}\n" -r 0-8388607 "$URL"'
```

기동 로그의 `[pot-provider] Started POT server` 와 `음악 런타임 준비 완료 — yt-dlp=…` 두 줄로 provider와 런타임 버전을 확인합니다.

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
- 이미지 내장 런타임: FFmpeg, `yt-dlp[default]` nightly(`ARG YT_DLP_VERSION`), `bgutil-ytdlp-pot-provider` 플러그인 + POT provider 서버(같은 컨테이너), Node.js 22 EJS runtime
- 앱 타입: long-running worker/service. Vercel serverless 대상이 아님

PM2 설정 파일은 로컬 또는 별도 VM에서 수동 운영할 때만 사용하는 보조 설정입니다.

## 라이선스

MIT
