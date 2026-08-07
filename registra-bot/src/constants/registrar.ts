/**
 * 레지스트라(REGISTRAR) 봇 — NOVUS ORDO 일정 총괄 비서 페르소나·브랜딩 상수
 *
 * @see StarGateV2/docs/spec/npc/npc-registrar-spec.md
 * @see StarGateV2/discord-notice/npc/npc-registrar.md
 */

/** Discord 버튼·customId 접두사 (다른 봇과 분리) */
export const ATTEND_BUTTON_PREFIX = "registrar:attend:";

/** 콘솔 로그 태그 */
export const LOG_PREFIX = "[Registrar]";

/** 임베드·알림 푸터 서명 */
export const REGISTRAR_SIGNATURE = "NOVUS ORDO · REGISTRAR";

/** 공지 임베드(응답 수집 중) 푸터 */
export const EMBED_FOOTER_OPEN =
  "가용·불가 회신은 기한 내 제출하십시오. 미제출 인원은 대장에 공백으로 남습니다.";

/** 공지 임베드 본문(OPEN): 채널 공지 상단에 표시되는 안내 문구 */
export const EMBED_DESCRIPTION_OPEN =
  "통보 대상 **역할**을 보유한 인원은 아래 **가용**·**불가**로 회신하십시오. 「응답 마감」 시각까지 제출할 수 있으며, 기한 내 재클릭 시 회신이 갱신됩니다.";

/** 최종 결과 임베드 푸터 */
export const EMBED_FOOTER_RESULT_CLOSED =
  "회신 접수를 마감했습니다. 이후 수정·취소는 허용되지 않습니다.";

/** 마감 직후 공지 임베드 푸터(버튼 비활성화 상태) */
export const EMBED_FOOTER_ANNOUNCE_CLOSED =
  "회신 접수를 마감했습니다. 확정 보고를 확인하십시오.";

/** 임베드 색상 — 맥락별 분기. 모든 신규/리팩터 시 이 상수만 참조. */
export const REGISTRAR_COLORS = {
  /** 공지·확정 보고·달력 등 공식 게시물 (기존 골드) */
  primary: 0xc5a059,
  /** 참여자용 안내(에페메랄) — 무채 톤으로 권한 차이 시각화 */
  helpPlayer: 0x8a8a8a,
  /** 운영자용 안내(에페메랄) — 짙은 갈색으로 권한 인지 */
  helpAdmin: 0x6b4423,
} as const;
