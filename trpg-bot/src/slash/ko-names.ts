/**
 * Discord 슬래시 커맨드 루트·서브커맨드·옵션 이름 (한글).
 * `register.ts`와 핸들러가 반드시 동일 값을 써야 합니다.
 *
 * Phase 2 부터는 `/일정`·`/참여확인` 은 등록되지 않으며 (`register.ts` 참조),
 * 신규 `/세션확인` 만 활성. 기존 상수는 비활성 코드의 호환을 위해 유지.
 */

/** Phase 2 신규 슬래시 — `/세션확인`. 이번 달 TRPG 세션 캘린더 + 웹 링크 응답. */
export const SESSION_CHECK_NAME = "세션확인";

export const SCHEDULE_ROOT = "일정";

export const Sub = {
  create: "생성",
  list: "목록",
  overview: "한눈에",
  calendar: "달력",
  result: "집계",
  participationCheck: "참여확인",
  close: "마감",
  editClose: "응답마감변경",
  editDate: "일정변경",
  cancel: "취소",
} as const;

export const Opt = {
  title: "제목",
  date: "일시",
  closeTime: "응답마감",
  role: "역할",
  channel: "채널",
  sessionId: "세션아이디",
  withImage: "이미지포함",
  newClose: "새응답마감",
  newDate: "새일시",
  month: "월",
} as const;
