/**
 * Discord 슬래시 커맨드 루트·서브커맨드·옵션 이름 (한글).
 * `register.ts`와 핸들러가 반드시 동일 값을 써야 합니다.
 */

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
