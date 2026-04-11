# registra-bot 코드리뷰

검토 기준일: 2026-04-10

검토 범위: `registra-bot/src`, `registra-bot/README.md`

검증 메모: `registra-bot`에서 `npm run build`는 통과했습니다.

## P4

- 시간 해석이 전부 봇 호스트의 로컬 타임존에 묶여 있습니다. 생성/수정 파싱, 월간 캘린더 범위, 자동완성 추천, 리마인드 계산이 모두 `new Date()`와 `getFullYear()/getMonth()`에 의존하므로, 운영 환경이 KST가 아니면 일정 시각과 월 경계가 통째로 밀립니다. 근거: `src/commands/session-create.ts:36-39`, `src/commands/session-create-autocomplete.ts:28-33`, `src/commands/session-manage.ts:245-246`, `src/db/sessions.ts:198-216`. 개선: 저장은 UTC로 하되 입력/표시는 명시적으로 `Asia/Seoul` 기준으로 변환하거나, 아예 타임존을 설정값으로 분리하세요.

## P5

- `/일정 참여확인`은 사용자의 YES 응답 전체를 읽어 온 뒤 `targetDateTime` 오름차순으로 정렬하고 앞 20개만 보여 줍니다. 참여 이력이 많은 사용자는 최근 일정이 아니라 가장 오래된 일정만 보게 되고, 조회 비용도 전체 응답 수에 선형으로 증가합니다. 근거: `src/db/responses.ts:91-139`. 개선: 기본 정렬을 "다가오는 일정 우선, 없으면 최근 지난 일정"으로 바꾸고, DB 단계에서 limit를 적용할 수 있게 쿼리 구조를 조정하세요.
