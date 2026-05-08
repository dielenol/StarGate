/**
 * Discord 슬래시 커맨드 루트·서브커맨드·옵션 이름 (한글).
 * `register.ts`와 핸들러가 반드시 동일 값을 써야 합니다.
 */

export const SCHEDULE_ROOT = "일정";
export const HELP_ROOT_KO = "도움말";
export const HELP_ROOT_EN = "help";
export const INFO_ROOT_KO = "안내";
export const INFO_ROOT_EN = "info";
/** `/크레딧 ...` — GM 전용 크레딧 운영 (지급/차감/전체지급/작전지급/작전차감/조회) */
export const CREDIT_ROOT = "크레딧";
/** `/잔액` — 누구나 사용 가능한 본인 메인 캐릭 잔액 조회 (단일 명령, 서브 ❌) */
export const BALANCE_ROOT = "잔액";

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

/**
 * `/크레딧 ...` 서브커맨드 한국어 이름. GM 전용 6개 (잔액은 별도 단일 명령 `/잔액` 으로 분리).
 */
export const CreditSub = {
  grant: "지급",
  deduct: "차감",
  grantAll: "전체지급",
  opGrant: "작전지급",
  opDeduct: "작전차감",
  query: "조회",
} as const;

export const Opt = {
  title: "제목",
  date: "일시",
  closeTime: "응답마감",
  role: "역할",
  channel: "채널",
  /** 슬래시 옵션 API 이름: 등록 ID(문서 _id) */
  registrationId: "등록아이디",
  withImage: "이미지포함",
  newClose: "새응답마감",
  newDate: "새일시",
  month: "월",
  reason: "사유",
  pin: "고정",
} as const;

/** `/크레딧 ...` 옵션 한국어 이름. */
export const CreditOpt = {
  user: "대상",
  amount: "금액",
  reason: "사유",
} as const;
