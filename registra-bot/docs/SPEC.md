# 레지스트라(REGISTRAR) 봇 — 구현 스펙

> NOVUS ORDO 통합 일정·가용 여부 수집. NPC 설정은 [NPC-REFERENCES.md](./NPC-REFERENCES.md) 참고.

---

## 1. 개요

- 관리자가 `/일정 생성`으로 **등록 일정**을 올리고, 대상 역할 멤버가 **가용** / **불가**로 응답합니다.
- **응답 마감** 시 공지 버튼을 비활성화하고 **확정 보고** 임베드(및 설정 시 PNG)를 전송합니다.
- 후속 작업(공지 수정, 확정 보고 송부, 로그 기록)은 `CLOSING` / `CANCELING` 중간 상태에서 단계별로 저장되며, 실패 시 스케줄러가 자동 재시도합니다. 각 세션의 후속 처리는 MongoDB lease/token으로 한 실행자만 선점합니다. 시작 시점의 trigger(`scheduled`/`force`/`cancel`), 요청자, 취소 사유, operation key는 재시작 후에도 원래 값으로 이어집니다.
- Discord 인터랙션 최상위 핸들러는 공통 안전 래퍼로 감싸며, 예기치 않은 예외 시 자동완성은 빈 목록으로 종료하고 슬래시/버튼은 에페메랄 fallback 응답을 보냅니다.
- 용어: **배정 일시**(`targetDateTime`), **등록 ID**(`_id`), **접수 중**(OPEN), **마감 처리 중**(`CLOSING`), **기각 처리 중**(`CANCELING`), **미제출**(무응답 명단).

---

## 2. 데이터·인프라

| 항목 | 값 |
| --- | --- |
| 기본 MongoDB DB 이름 | `stargate` (통합 DB, `MONGODB_DB_NAME`로 재정의) |
| 컬렉션 | `sessions`, `session_responses`, `session_logs` (스키마는 타입 `Session` 등과 동일) |
| 버튼 `customId` | `registrar:attend:{등록ID}:yes` / `:no` |

---

## 3. 슬래시 커맨드 (`/일정`)

루트 설명: *NOVUS ORDO 통합 일정 — 등록·가용 여부 수집 (레지스트라)*

| 서브 | 권한·비고 |
| --- | --- |
| `생성` | 서버 관리 · 공지 + 가용/불가 버튼 |
| `목록` | 서버 관리 · 접수 중만 요약 |
| `한눈에` | 서버 관리 · 월별 목록·등록 ID · `CLOSING`/`CANCELING` 포함 |
| `달력` | 서버 관리 · 월간 PNG (`RESULT_CARD_IMAGE`) |
| `집계` | 서버 관리 · 채널 공개, 등록 ID는 실행자 에페메랄 |
| `참여확인` | 일반 · 본인 가용(YES)만 에페메랄 |
| `마감` / `응답마감변경` / `일정변경` / `취소` | 서버 관리 · 수정 명령은 `OPEN` 상태에서만 적용 |

**옵션 이름 변경:** 예전 `세션아이디` → **`등록아이디`** (API 및 안내 문구).

---

## 4. PNG·환경변수

- `RESULT_CARD_IMAGE`: `0` / `false` / `off` 이면 Puppeteer PNG 생략
- `PARTICIPATION_CHECK_IMAGE_COOLDOWN_MINUTES`: `/일정 참여확인` 월간 PNG 재첨부 간격(분)
- `PNG_RENDER_MIN_INTERVAL_MS`: 연속 렌더 간격

---

## 5. 스케줄러

- **마감**: OPEN 중 `closeDateTime` 경과 분 처리 (1분 틱)
- **마감 보정**: `CLOSING` / `CANCELING` 중 후속 처리 미완료 건 재시도 (1분 틱, 공지 수정/확정 보고/로그 저장 단계별 이어서 수행). 단, Discord 발송 여부가 불확실한 `DELIVERY_UNKNOWN`은 자동 재발송하지 않고 운영 reconciliation 대상으로 남깁니다.
- **마감 중복 방지**: 이전 비동기 틱이 끝날 때까지 다음 틱을 건너뛰고, 수동 명령과 스케줄러 사이에는 세션별 10분 lease/token을 적용합니다. 확정·기각 채널 메시지는 등록 ID 기반 Discord nonce와 저장된 메시지 ID로 중복을 억제합니다.
- **전달 선기록**: 확정·기각 채널 메시지를 보내기 전에 `DISPATCHING`을 저장합니다. 전송 성공 후 메시지 ID 저장에 실패하거나 `DISPATCHING` 상태에서 프로세스가 재시작되면 `DELIVERY_UNKNOWN`으로 격리하므로 lease 만료 뒤에도 자동 재발송하지 않습니다.
- **legacy 격리**: 배포 전부터 진행 중이어서 trigger·취소 사유·operation key·전달 상태를 완전하게 복원할 수 없는 pending 문서는 신규 `PENDING`으로 간주하지 않습니다. `LEGACY_STATE_UNKNOWN` reconciliation 대상으로 격리해 공지와 로그를 자동 재생하지 않습니다.
- **로그 멱등성**: finalization 시작 시 생성한 operation key로 결정적 로그 ID를 사용합니다. 로그 append 성공 뒤 완료 플래그 기록이 실패해도 같은 operation key의 재시도는 로그를 중복 생성하지 않습니다.
- **리마인드**: 배정 **24시간 전** 구간에서 **가용(YES)** 응답자만 멘션 (15분 틱)
- **리마인드 선점**: 발송 전에 세션 문서에서 lease 기반 발송권을 원자적으로 선점합니다. 발송 성공 후 `sent` 플래그를 기록하며, 기록 실패 시에도 lease를 세션 종료 이후까지 연장해 중복 발송을 차단합니다.

---

## 6. 미구현·후보 (기존 플랜과 동일 계열)

다중 날짜 후보, Maybe, 반복 일정, 타임존 옵션, 외부 캘린더 연동, 대기열 등은 범위 외. 필요 시 별도 스펙으로 확장.

---

## 7. 코드 레이아웃

`src/constants/registrar.ts` — `ATTEND_BUTTON_PREFIX`, `LOG_PREFIX`, 서명·임베드 푸터 문자열  
상세 동작·절차는 [REGISTRAR-OPERATIONS-SPEC.md](./REGISTRAR-OPERATIONS-SPEC.md) 참고.  
`src/commands/register.ts` — Discord 명령 정의  
`src/commands/session-create.ts` / `session-manage.ts` — 핸들러  
`src/utils/safe-interaction.ts` — InteractionCreate 최상위 안전 래퍼·fallback 응답  
`src/utils/embed.ts` — 공지·확정 보고 임베드 (레지스트라 푸터)

---

## 8. 마이그레이션 (trpg-bot 복제본에서 전환 시)

1. `.env`에 `MONGODB_DB_NAME=registrar_bot` (또는 URI 경로 일치)
2. 봇 재초대·슬래시 재등록 (옵션명 `등록아이디` 반영)
3. **기존 공지 메시지의 버튼**은 `trpg:attend:` 접두사이므로 **새 봇으로는 동작하지 않음** — 필요 시 공지 재게시
