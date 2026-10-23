/**
 * Discord 슬래시 커맨드 루트·서브커맨드·옵션 이름 (한글).
 * `register.ts`와 핸들러가 반드시 동일 값을 써야 합니다.
 */

/** `/세션확인` — 월간 TRPG 세션 캘린더 + 웹 링크 응답. */
export const SESSION_CHECK_NAME = "세션확인";
export const SESSION_CHECK_MINE_OPTION = "내세션";

/** `/내세션` — 내가 참가하거나 진행하는 다가오는 세션 목록 (비공개). */
export const MY_SESSIONS_NAME = "내세션";
export const MY_SESSIONS_LIMIT_OPTION = "개수";

/** `/일정투표` — 후보 날짜로 Discord 기본 투표를 열고 마감 뒤 결과를 알린다. */
export const SCHEDULE_POLL_NAME = "일정투표";
export const SCHEDULE_POLL_DATE_OPTIONS = [
  "날짜1",
  "날짜2",
  "날짜3",
  "날짜4",
  "날짜5",
  "날짜6",
  "날짜7",
  "날짜8",
  "날짜9",
  "날짜10",
] as const;
export const SCHEDULE_POLL_TIME_OPTION = "시각";
export const SCHEDULE_POLL_TITLE_OPTION = "제목";
export const SCHEDULE_POLL_DURATION_OPTION = "마감";
export const SCHEDULE_POLL_MULTISELECT_OPTION = "복수선택";

/** `/비밀굴림` — 주사위 결과를 지정한 사람에게만 DM 으로 보낸다. */
export const SECRET_ROLL_NAME = "비밀굴림";
export const SECRET_ROLL_TARGET_OPTION = "대상";
export const SECRET_ROLL_SHOW_ME_OPTION = "나도보기";

/** `/상태` — 운영자(서버 관리 권한)용 봇 진단. */
export const STATUS_NAME = "상태";

/** 활성 명령 전체와 주제별 사용법을 보여주는 `/도움말`. */
export const HELP_NAME = "도움말";
export const HELP_TOPIC_OPTION = "기능";

export const HelpTopic = {
  all: "all",
  session: "session",
  dice: "dice",
  music: "music",
} as const;

export type HelpTopicValue = (typeof HelpTopic)[keyof typeof HelpTopic];

export function isHelpTopic(value: string): value is HelpTopicValue {
  return Object.values(HelpTopic).includes(value as HelpTopicValue);
}

/** Dice Maiden 계열 주사위 슬래시 — `/roll`, `/r`. */
export const ROLL_NAME = "roll";
export const ROLL_SHORT_NAME = "r";

/** YouTube 음악 재생과 제어를 한곳에 묶는 `/음악` 루트. */
export const MUSIC_ROOT = "음악";

/** `/음악` 아래에 노출되는 한글 서브커맨드. */
export const MusicSubcommand = {
  play: "재생",
  playlist: "재생목록",
  pause: "일시정지",
  resume: "재개",
  skip: "건너뛰기",
  repeat: "반복",
  volume: "볼륨",
  shuffle: "셔플",
  remove: "삭제",
  reset: "초기화",
  queue: "대기열",
  leave: "퇴장",
} as const;

export type MusicSubcommandName =
  (typeof MusicSubcommand)[keyof typeof MusicSubcommand];

export const MUSIC_QUERY_OPTION = "검색어";
export const MUSIC_PLAYLIST_OPTION = "링크";
export const MUSIC_REPEAT_MODE_OPTION = "모드";
export const MUSIC_VOLUME_OPTION = "퍼센트";
export const MUSIC_REMOVE_POSITION_OPTION = "번호";

export function isMusicCommandName(value: string): value is typeof MUSIC_ROOT {
  return value === MUSIC_ROOT;
}
