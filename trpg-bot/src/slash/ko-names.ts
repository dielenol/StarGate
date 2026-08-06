/**
 * Discord 슬래시 커맨드 루트·서브커맨드·옵션 이름 (한글).
 * `register.ts`와 핸들러가 반드시 동일 값을 써야 합니다.
 *
 * Phase 2 부터는 `/일정`·`/참여확인` 은 등록되지 않으며 (`register.ts` 참조),
 * 신규 `/세션확인` 만 활성. 기존 상수는 비활성 코드의 호환을 위해 유지.
 */

/** Phase 2 신규 슬래시 — `/세션확인`. 이번 달 TRPG 세션 캘린더 + 웹 링크 응답. */
export const SESSION_CHECK_NAME = "세션확인";

/** Dice Maiden 계열 주사위 슬래시 — `/roll`, `/r`. */
export const ROLL_NAME = "roll";
export const ROLL_SHORT_NAME = "r";

/** YouTube 음악 재생과 제어를 한곳에 묶는 `/음악` 루트. */
export const MUSIC_ROOT = "음악";

/** `/음악` 아래에 노출되는 한글 서브커맨드. */
export const MusicSubcommand = {
  play: "재생",
  pause: "일시정지",
  resume: "재개",
  skip: "건너뛰기",
  stop: "정지",
  queue: "대기열",
  leave: "퇴장",
} as const;

export type MusicSubcommandName =
  (typeof MusicSubcommand)[keyof typeof MusicSubcommand];

export const MUSIC_QUERY_OPTION = "검색어";

export function isMusicCommandName(value: string): value is typeof MUSIC_ROOT {
  return value === MUSIC_ROOT;
}

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
