# TRPG 캘린더 디스코드 봇 — 현재 구현 명세

> 최종 대조일: 2026-07-16. 기준은 `src/index.ts`에서 실제 등록하는 명령·이벤트·스케줄러다.

## 1. 문서 범위

이 문서는 현재 실행되는 `trpg-bot` 기능을 설명한다. 과거 Discord RSVP 봇 기능은 소스 파일로 남아 있지만 현재 엔트리포인트에서 연결되지 않으므로 활성 기능으로 간주하지 않는다.

초기 RSVP 설계와 후보 기능은 [`../trpg-discord-bot-plan.md`](../trpg-discord-bot-plan.md)에 역사적 자료로 보존한다.

## 2. 현재 역할

`trpg-bot`은 세션을 직접 생성하거나 참가 응답을 수집하지 않는다. 세션과 참가자는 `trpg-web`에서 관리하며, 봇은 다음 책임을 가진다.

1. `/세션확인`으로 월간 세션 캘린더 제공
2. `/roll`, `/r`로 TRPG 주사위 처리
3. 세션 생성·수정·취소 알림과 시작 24시간 전 리마인드 발송
4. 운영 Discord 길드의 멤버 정보를 DB에 동기화

```text
trpg-web ── 세션 생성·수정·취소 ──> trpg_sessions
                                          │
                       ┌──────────────────┴──────────────────┐
                       │                                     │
                trpg-bot 폴링                         /세션확인 조회
                       │                                     │
              참가자 DM → 실패 시 폴백 채널          Discord 캘린더 응답
```

## 3. 활성 슬래시 커맨드

### 3-1. `/세션확인`

운영 길드의 월간 `open` 세션을 조회하여 Discord 임베드, 캘린더 PNG와 웹 캘린더 링크를 제공한다.

| 옵션 | 타입 | 필수 | 동작 |
| --- | --- | --- | --- |
| `연도` | 정수 | 아니요 | 미입력 시 KST 현재 연도. 등록 범위는 2026~2100 |
| `월` | 정수 | 아니요 | 미입력 시 KST 현재 월. 범위는 1~12 |
| `모드` | 선택 | 아니요 | `상세`가 기본값, `간단`은 세션별 상세 필드 생략 |
| `비공개` | 불리언 | 아니요 | `true`면 에페메랄 응답, 기본은 채널 공개 |

동작 규칙:

- DM에서는 실행할 수 없다.
- `TRPG_GUILD_ID`와 일치하는 길드에서만 실행할 수 있다.
- `trpg_sessions`에서 선택한 연·월의 `status: "open"` 세션을 일시 순으로 조회한다.
- KST 오늘 날짜보다 이전인 세션은 제외한다. 오늘 세션은 시작 시각이 지났어도 표시하며, 과거 월 조회 결과는 비어 있다.
- 월간 요약에 표시 세션 수, 오늘 일정 수, 오늘 이후 일정 수와 참가 대상 누적 인원을 표시한다.
- 상세 모드는 최대 12개 세션의 일시, 마스터, 참가자 명단을 표시한다. 참가자 멘션은 세션당 최대 16명까지 표시하고 나머지는 인원수로 축약한다.
- 웹 버튼은 `${TRPG_WEB_BASE_URL}/calendar`로 연결된다.

캘린더 PNG:

- Puppeteer로 7열 월간 달력을 렌더링한다.
- 현재 월을 조회할 때 오늘 날짜를 강조한다.
- 날짜별 세션은 시작 시각 순으로 최대 3건을 표시하고 초과분은 `+N more`로 표시한다.
- 제목은 캘린더 칸에서 최대 12자로 축약한다.
- 렌더 작업은 프로세스 내에서 직렬화하고 개별 렌더는 30초 후 타임아웃된다.
- `RESULT_CARD_IMAGE=0`, `false`, `off`이면 PNG를 생성하지 않는다.
- PNG가 비활성화되거나 렌더에 실패해도 텍스트 임베드와 웹 링크는 응답한다.

### 3-2. `/roll`, `/r`

두 명령은 같은 주사위 엔진을 사용하며 `/r`은 `/roll`의 단축 이름이다.

| 옵션 | 타입 | 필수 | 동작 |
| --- | --- | --- | --- |
| `식` | 문자열 | 예 | 주사위 식. 최대 500자 |
| `비공개` | 불리언 | 아니요 | `true`면 에페메랄 응답 |

지원 문법:

- 기본 주사위: `XdY`, `d20`, `d%`, `dF`
- 산술: `+`, `-`, `*`, `/`, 괄호
- 여러 식: 세미콜론(`;`)으로 최대 4개 분리
- 반복: `6 4d6 k3`처럼 식 앞에 반복 횟수 지정, 세그먼트당 최대 20회
- 폭발: `e`, `ie`
- 선택: `k`(높은 값 유지), `kl`(낮은 값 유지), `d`(낮은 값 제거)
- 리롤: `r`, `ir`
- 판정: `t`(성공), `f`(실패), `b`(봇치)
- 플래그: `s`(간단히), `nr`(개별 결과 숨김), `p`(비공개), `ul`(입력 순서 유지)
- 주석: `!` 뒤의 텍스트
- 별칭: `+d20`, `-d20`, `+d%`, `-d%`, `attack`, `skill`, `save`, `dndstats`, `sr6`, `age`
- `식:help`를 입력하면 간단한 도움말을 에페메랄로 표시한다.

제한:

- 한 주사위 항은 최대 100개, 면 수는 최대 1000이다.
- 한 요청이 생성하는 개별 주사위 결과는 최대 1000개다.
- 여러 결과 중 메시지에는 최대 12개 Roll을 표시하고 나머지는 생략 수로 안내한다.
- 모든 사용자 멘션 파싱을 비활성화하여 주사위 입력·출력이 실제 멘션을 만들지 않는다.
- DM과 운영 길드 외 서버에서는 실행할 수 없다.

## 4. 자동 알림

### 4-1. 공통 발송 흐름

생성·수정·취소 알림은 `TRPG_POLLING_INTERVAL_MS` 주기로 확인하며 기본값은 60초다. 시작 24시간 전 리마인드는 `TRPG_REMINDER_INTERVAL_MS` 주기로 확인하며 기본값은 300초다. 모든 스케줄러는 봇 기동 직후 한 번 실행된다.

알림 처리 순서:

1. DB에서 미발송 세션 조회
2. 5분 lease로 해당 세션의 발송권을 원자적으로 선점
3. 참가자별 Discord DM 시도
4. DM 실패 시 `TRPG_FALLBACK_CHANNEL_ID`에서 `<@userId>` 멘션과 같은 안내 전송
5. `trpg_session_notifications`에 `dm`, `fallback`, `failed` 결과 기록
6. 참가자 순회 후 세션에 알림 완료 시각 기록

각 스케줄러는 이전 tick이 끝나지 않았으면 다음 tick을 건너뛰어 같은 프로세스 안의 중첩 실행을 막는다. lease는 여러 워커 또는 재시작 상황에서 같은 세션의 동시 처리를 막는다.

알림 임베드에는 다음 내용이 포함된다.

- 세션 제목
- `YYYY-MM-DD HH:mm (KST)`와 Discord 절대·상대 시각
- 마스터 이름
- 현재 참가자 수와 멘션 명단
- 웹 캘린더 버튼

### 4-2. 생성 알림

- 대상: 생성 알림이 완료되지 않은 `open` 세션
- 수신자: `participantDiscordIds`
- 버튼: 세션 ID를 포함한 웹 캘린더 URL
- 사용자별 기존 성공 기록이 있으면 다시 보내지 않는다.

### 4-3. 수정 알림

- 대상: 수정 알림 대기열에 들어간 `open` 세션
- 수신자: `updateNotificationRecipientDiscordIds`가 있으면 해당 스냅샷, 없으면 현재 참가자
- 참가자 변경 시 이전·현재 참가자의 합집합을 스냅샷으로 사용하므로 제외된 참가자도 변경 사실을 받을 수 있다.
- `updateNotificationChanges`가 있으면 임베드에 변경 요약을 표시한다.

### 4-4. 취소 알림

- 대상: 취소 알림 대기열에 들어간 `cancelled` 세션
- 기능 배포 전부터 취소 상태였던 과거 세션은 대기열 시각이 없으므로 발송하지 않는다.
- 수신자: `participantDiscordIds`
- 버튼: 취소된 날짜를 기준으로 웹 캘린더를 연다.
- 사용자별 기존 성공 기록이 있으면 다시 보내지 않는다.

### 4-5. 시작 24시간 전 리마인드

- 대상: 아직 리마인드가 발송되지 않은 `open` 세션
- 수신자: `participantDiscordIds`
- 기본 5분 폴링에서는 현재 시각 기준 약 23시간 50분~24시간 10분 뒤 세션을 후보로 조회한다.
- 넓게 겹치는 조회 창과 원자적 claim을 함께 사용해 tick 지연으로 인한 누락과 중복 발송을 줄인다.
- 사용자별 기존 성공 기록이 있으면 다시 보내지 않는다.

### 4-6. 발송 실패 처리

- 개별 사용자 오류는 로그를 남기고 다음 참가자 발송을 계속한다.
- DM과 폴백이 모두 실패해도 참가자 순회가 끝나면 세션 알림은 완료 처리된다.
- 따라서 `failed`로 기록된 개별 수신자를 자동으로 다시 시도하는 별도 재시도 큐는 현재 없다.
- 수정 알림은 사용자별 기존 성공 기록을 조회하지 않으므로 일부 발송 후 프로세스가 중단되면 lease 만료 뒤 이미 받은 참가자에게 다시 전송될 수 있다.

## 5. 길드 멤버 동기화

동기화 대상은 `TRPG_GUILD_ID` 운영 길드의 일반 사용자이며 봇 계정은 제외한다.

| 시점 | 처리 |
| --- | --- |
| 봇 준비 완료 | 길드 전체 멤버 fetch 후 DB와 reconcile |
| `GuildMemberAdd` | 신규 멤버 upsert |
| `GuildMemberUpdate` | username·표시명 등 upsert |
| `GuildMemberRemove` | `leftAt` 기록 |
| 24시간마다 | 누락 이벤트 보정을 위한 전체 재동기화 |

표시명은 서버 nickname → Discord global name → username 순으로 결정한다. 전체 동기화에서는 Discord에 없는 DB 활성 멤버를 찾아 `leftAt`을 기록한다.

## 6. 데이터 저장

봇은 `@stargate/shared-db`를 통해 MongoDB에 장기 실행 모드로 연결하고 기동 시 관련 인덱스를 보장한다. 기본 DB 이름은 `stargate`다.

### 6-1. `trpg_sessions`

핵심 필드:

| 필드 | 설명 |
| --- | --- |
| `guildId` | 세션 소유 길드 |
| `title` | 세션 제목 |
| `date`, `startTime` | KST 진행 날짜와 시각 |
| `createdByDiscordId`, `createdByUsername` | 마스터 정보 |
| `participantDiscordIds` | 알림 대상 참가자 |
| `status` | `open` 또는 `cancelled` |
| `*NotificationQueuedAt` | 수정·취소 알림 대기열 시각 |
| `*NotificationSentAt`, `reminderSentAt` | 알림 완료 시각 |
| `*ClaimLeaseUntil` | 발송권 lease 만료 시각 |

현재 모델에는 Discord RSVP 응답, 응답 마감 또는 `closed` 상태가 없다.

### 6-2. `trpg_guild_members`

- Discord 사용자 ID, username, 표시명, 가입 시각
- 마지막 동기화 시각
- 탈퇴 시각 `leftAt`; 활성 멤버는 `null`

### 6-3. `trpg_session_notifications`

- 세션 ID와 수신자 Discord ID
- 종류: `creation`, `update`, `cancellation`, `reminder24h`
- 방식: `dm`, `fallback`, `failed`
- 시도 시각과 오류 문자열

## 7. 환경변수

| 변수 | 필수 | 기본값 | 용도 |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | 예 | - | Discord 봇 토큰 |
| `DISCORD_CLIENT_ID` | 예 | - | Discord Application ID |
| `MONGODB_URI` | 예 | - | MongoDB 연결 문자열 |
| `MONGODB_DB_NAME` | 아니요 | `stargate` | 테스트·스테이징 DB override |
| `GUILD_ID` | 아니요 | 전역 등록 | 설정 시 해당 길드에 슬래시 등록 |
| `TRPG_GUILD_ID` | 예 | - | 운영 길드와 명령 실행 경계 |
| `TRPG_FALLBACK_CHANNEL_ID` | 예 | - | DM 실패 시 폴백 채널 |
| `TRPG_WEB_BASE_URL` | 예 | - | 웹 캘린더 링크 기준 URL |
| `TRPG_POLLING_INTERVAL_MS` | 아니요 | `60000` | 생성·수정·취소 폴링 주기 |
| `TRPG_REMINDER_INTERVAL_MS` | 아니요 | `300000` | 24시간 리마인드 폴링 주기 |
| `RESULT_CARD_IMAGE` | 아니요 | 활성 | `/세션확인` PNG 활성 여부 |

필수 환경변수가 없으면 기동이 실패한다. 잘못된 폴백 채널은 부팅 시 오류 로그를 남기지만 봇은 계속 실행된다.

## 8. 커맨드 등록과 운영 경계

- `GUILD_ID`가 있으면 해당 길드에 `/세션확인`, `/roll`, `/r`을 등록한다.
- `GUILD_ID`가 없으면 같은 명령을 글로벌로 등록한다.
- 등록 범위를 전환해도 이전 범위의 커맨드는 자동 삭제되지 않는다.
- 명령이 글로벌로 노출되더라도 런타임에서 `TRPG_GUILD_ID` 외 길드 실행을 차단한다.
- 봇은 단일 운영 길드를 전제로 한다.

## 9. 비활성 레거시

다음 파일은 소스 보존용이며 현재 `src/index.ts`에서 import하지 않는다.

- `commands/session-create.ts`, `session-manage.ts`, `session-create-autocomplete.ts`의 `/일정 ...` 관리 명령
- `handlers/button-handler.ts`의 참석·불참 버튼 처리
- `scheduler/close-checker.ts`, `scheduler/reminder-checker.ts`
- `services/session-close.ts`의 응답 마감·최종 집계
- `utils/result-card-image.ts`, `build-session-result-card.ts`의 구형 결과 카드
- `db/sessions.ts`, `responses.ts`, `logs.ts`의 구형 `sessions` 계열 접근

레거시 기능을 재활성화하려면 현재 `trpg-web` 중심 데이터 모델과의 소유권, `registra-bot`과의 길드·컬렉션 충돌 가능성을 먼저 검토해야 한다.

## 10. 현재 제한 사항

- Discord에서 세션을 생성·수정·취소할 수 없다.
- Discord에서 참석·불참 응답을 받지 않는다.
- `/세션확인`은 `open` 세션만 보여주며 어제까지의 일정은 표시하지 않는다. 오늘 이미 시작한 세션은 표시될 수 있다.
- 캘린더와 알림 입력 시각은 KST 고정이며 사용자별 타임존 설정은 없다.
- PNG 렌더에는 Puppeteer가 실행할 Chromium 환경이 필요하다.
- 자동 알림의 개별 완전 실패는 기록되지만 자동 재시도되지 않는다.
- 알림 후보 DB 조회는 `TRPG_GUILD_ID`로 필터하지 않으므로 `trpg_sessions`를 단일 운영 영역으로 사용하는 전제가 있다.
- 반복 일정, 참가 상한·대기열, 외부 캘린더 동기화는 지원하지 않는다.

## 11. 활성 파일 구조

```text
src/
├── index.ts
├── config.ts
├── commands/
│   ├── register.ts
│   ├── trpg-session-check.ts
│   └── dice-roll.ts
├── scheduler/
│   ├── trpg-notification-checker.ts
│   ├── trpg-update-notification-checker.ts
│   ├── trpg-cancellation-notification-checker.ts
│   └── trpg-reminder-checker.ts
├── services/
│   └── member-sync.ts
├── utils/
│   ├── trpg-calendar-image.ts
│   ├── trpg-session-message.ts
│   ├── dm-with-fallback.ts
│   ├── dice-roller.ts
│   └── kst.ts
└── db/
    └── client.ts
```

프로세스 종료 시 폴링·일일 동기화 인터벌을 먼저 정리하고 Discord, Puppeteer, MongoDB 연결을 순서대로 종료한다.
