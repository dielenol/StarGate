/**
 * Discord 임베드 빌더
 *
 * 세션 공지 메시지와 최종 결과 메시지용 임베드를 생성합니다.
 * @module utils/embed
 */

import { EmbedBuilder } from "discord.js";
import { SCHEDULE_ROOT } from "../slash/ko-names.js";
import type { Session } from "../types/session.js";
import type { ResponseCounts } from "../types/session.js";

/** 임베드 기본 색상 (골드 톤) */
const EMBED_COLOR = 0xc5a059;

/**
 * 날짜를 로컬 문자열로 포맷합니다.
 * @param date Date 객체
 * @returns "YYYY-MM-DD HH:mm" 형식
 */
export function formatSessionDateTime(date: Date): string {
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Discord 임베드 필드 value 최대 길이 */
const EMBED_FIELD_VALUE_MAX = 1024;

/**
 * userId 배열을 Discord 멘션 형식(<@id>)으로 변환합니다.
 * 클릭 시 해당 유저 프로필/멘션 참조가 가능합니다.
 */
function formatMentions(userIds: string[]): string {
  if (userIds.length === 0) return "(없음)";
  const mentions = userIds.map((id) => `<@${id}>`).join(" ");
  return mentions.length > EMBED_FIELD_VALUE_MAX
    ? mentions.slice(0, EMBED_FIELD_VALUE_MAX - 3) + "..."
    : mentions;
}

/**
 * DB 문서 `_id`를 공지에 표시할 문자열로 (없으면 표시 안 함)
 */
export function sessionDocumentId(session: Session): string | undefined {
  if (session._id === undefined || session._id === null) return undefined;
  const s = String(session._id);
  return s.length > 0 ? s : undefined;
}

/**
 * 세션 공지용 임베드를 생성합니다.
 * 세션명, 일시, 마감, 참석/불참 집계 수 및 명단(Discord 멘션)을 포함합니다.
 * @param session 세션 데이터
 * @param counts 집계 수
 * @param yesIds 참석자 유저 ID 목록 (선택)
 * @param noIds 불참자 유저 ID 목록 (선택)
 * @param sessionIdOverride `_id`가 세션 객체에 없을 때(생성 직후 등) 직접 넘김
 * @returns EmbedBuilder
 */
export function buildSessionEmbed(
  session: Session,
  counts: ResponseCounts,
  yesIds?: string[],
  noIds?: string[],
  sessionIdOverride?: string
): EmbedBuilder {
  const sessionId = sessionIdOverride ?? sessionDocumentId(session);
  const formatWithMentions = (count: number, ids: string[] | undefined) => {
    if (!ids || ids.length === 0) return `${count}명`;
    const mentions = ids.map((id) => `<@${id}>`).join(" ");
    const truncated =
      mentions.length > EMBED_FIELD_VALUE_MAX - 20
        ? mentions.slice(0, EMBED_FIELD_VALUE_MAX - 23) + "..."
        : mentions;
    return `${count}명\n${truncated}`;
  };

  const embed = new EmbedBuilder()
    .setTitle(session.title)
    .setColor(EMBED_COLOR)
    .addFields(
      {
        name: "세션 일시",
        value: formatSessionDateTime(session.targetDateTime),
        inline: true,
      },
      {
        name: "응답 마감",
        value: formatSessionDateTime(session.closeDateTime),
        inline: true,
      },
      {
        name: "참석",
        value: formatWithMentions(counts.yes, yesIds),
        inline: false,
      },
      {
        name: "불참",
        value: formatWithMentions(counts.no, noIds),
        inline: false,
      },
      ...(sessionId
        ? [
            {
              name: "세션 ID",
              value: `\`${sessionId}\`\n※ \`/${SCHEDULE_ROOT}\` 관리 명령에서 특정할 때 사용`,
              inline: false,
            } as const,
          ]
        : [])
    )
    .setFooter({ text: "아직 응답하지 않은 인원이 있을 수 있습니다." })
    .setTimestamp(session.closeDateTime);

  return embed;
}

/**
 * 최종 결과용 임베드를 생성합니다.
 * 참석/불참/무응답 명단을 Discord 멘션(@태그) 형식으로 표시합니다.
 * @param session 세션 데이터
 * @param yesIds 참석자 유저 ID 목록
 * @param noIds 불참자 유저 ID 목록
 * @param noResponseIds 무응답자 유저 ID 목록
 * @returns EmbedBuilder
 */
export function buildResultEmbed(
  session: Session,
  yesIds: string[],
  noIds: string[],
  noResponseIds: string[]
): EmbedBuilder {
  const fmt = (ids: string[]) =>
    ids.length === 0 ? "(없음)" : ids.map((id) => `<@${id}>`).join(" ");
  const truncate = (s: string) =>
    s.length > EMBED_FIELD_VALUE_MAX ? s.slice(0, EMBED_FIELD_VALUE_MAX - 3) + "..." : s;

  const sessionId = sessionDocumentId(session);

  return new EmbedBuilder()
    .setTitle(`📋 ${session.title} - 최종 결과`)
    .setColor(EMBED_COLOR)
    .addFields(
      {
        name: "세션 일시",
        value: formatSessionDateTime(session.targetDateTime),
        inline: true,
      },
      {
        name: "참석",
        value: truncate(fmt(yesIds)),
        inline: false,
      },
      {
        name: "불참",
        value: truncate(fmt(noIds)),
        inline: false,
      },
      {
        name: "무응답",
        value: truncate(fmt(noResponseIds)),
        inline: false,
      },
      ...(sessionId
        ? [
            {
              name: "세션 ID",
              value: `\`${sessionId}\``,
              inline: false,
            } as const,
          ]
        : [])
    )
    .setFooter({ text: "마감되었습니다. 응답 변경이 불가합니다." })
    .setTimestamp();
}
