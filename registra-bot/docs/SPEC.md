# 레지스트라(REGISTRAR) 봇 — 구현 스펙

> NOVUS ORDO 통합 일정·가용 여부 수집. NPC 설정은 [NPC-REFERENCES.md](./NPC-REFERENCES.md) 참고.

---

## 1. 개요

- 관리자가 `/일정 생성`으로 **등록 일정**을 올리고, 대상 역할 멤버가 **가용** / **불가**로 응답합니다.
- **응답 마감** 시 공지 버튼을 비활성화하고 **확정 보고** 임베드(및 설정 시 PNG)를 전송합니다.
- 용어: **배정 일시**(`targetDateTime`), **등록 ID**(`_id`), **접수 중**(OPEN), **미제출**(무응답 명단).

---

## 2. 데이터·인프라

| 항목 | 값 |
| --- | --- |
| 기본 MongoDB DB 이름 | `registrar_bot` (`MONGODB_DB_NAME`로 재정의) |
| 컬렉션 | `sessions`, `session_responses`, `session_logs` (스키마는 타입 `Session` 등과 동일) |
| 버튼 `customId` | `registrar:attend:{등록ID}:yes` / `:no` |

---

## 3. 슬래시 커맨드 (`/일정`)

루트 설명: *NOVUS ORDO 통합 일정 — 등록·가용 여부 수집 (레지스트라)*

| 서브 | 권한·비고 |
| --- | --- |
| `생성` | 서버 관리 · 공지 + 가용/불가 버튼 |
| `목록` | 서버 관리 · 접수 중만 요약 |
| `한눈에` | 서버 관리 · 월별 목록·등록 ID |
| `달력` | 서버 관리 · 월간 PNG (`RESULT_CARD_IMAGE`) |
| `집계` | 서버 관리 · 채널 공개, 등록 ID는 실행자 에페메랄 |
| `참여확인` | 일반 · 본인 가용(YES)만 에페메랄 |
| `마감` / `응답마감변경` / `일정변경` / `취소` | 서버 관리 |

**옵션 이름 변경:** 예전 `세션아이디` → **`등록아이디`** (API 및 안내 문구).

---

## 4. PNG·환경변수

- `RESULT_CARD_IMAGE`: `0` / `false` / `off` 이면 Puppeteer PNG 생략
- `PARTICIPATION_CHECK_IMAGE_COOLDOWN_MINUTES`: `/일정 참여확인` 월간 PNG 재첨부 간격(분)
- `PNG_RENDER_MIN_INTERVAL_MS`: 연속 렌더 간격

---

## 5. 스케줄러

- **마감**: OPEN 중 `closeDateTime` 경과 분 처리 (1분 틱)
- **리마인드**: 배정 **24시간 전** 구간에서 **가용(YES)** 응답자만 멘션 (15분 틱)

---

## 6. 미구현·후보 (기존 플랜과 동일 계열)

다중 날짜 후보, Maybe, 반복 일정, 타임존 옵션, 외부 캘린더 연동, 대기열 등은 범위 외. 필요 시 별도 스펙으로 확장.

---

## 7. 코드 레이아웃

`src/constants/registrar.ts` — `ATTEND_BUTTON_PREFIX`, `LOG_PREFIX`, 서명·임베드 푸터 문자열  
상세 동작·절차는 [REGISTRAR-OPERATIONS-SPEC.md](./REGISTRAR-OPERATIONS-SPEC.md) 참고.  
`src/commands/register.ts` — Discord 명령 정의  
`src/commands/session-create.ts` / `session-manage.ts` — 핸들러  
`src/utils/embed.ts` — 공지·확정 보고 임베드 (레지스트라 푸터)

---

## 8. 마이그레이션 (trpg-bot 복제본에서 전환 시)

1. `.env`에 `MONGODB_DB_NAME=registrar_bot` (또는 URI 경로 일치)
2. 봇 재초대·슬래시 재등록 (옵션명 `등록아이디` 반영)
3. **기존 공지 메시지의 버튼**은 `trpg:attend:` 접두사이므로 **새 봇으로는 동작하지 않음** — 필요 시 공지 재게시
