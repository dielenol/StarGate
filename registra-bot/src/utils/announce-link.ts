/**
 * 세션 원본 공지 메시지로의 점프 링크 버튼 유틸
 *
 * 마감/취소/일정변경 채널 알림에 "공지 열람" 링크 버튼을 달기 위해 사용합니다.
 * @module utils/announce-link
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import type { Session } from "../types/session.js";

const ANNOUNCE_LINK_LABEL = "공지 열람";

/**
 * 세션 원본 공지 메시지의 Discord jump URL. messageId가 비어있으면 `null`.
 */
export function sessionAnnounceUrl(session: Session): string | null {
  if (!session.messageId?.trim()) return null;
  return `https://discord.com/channels/${session.guildId}/${session.channelId}/${session.messageId}`;
}

/**
 * 공지 점프 링크 버튼 행. messageId가 없는 세션이면 `null`을 돌려 호출처가 components를 생략하도록 합니다.
 */
export function buildAnnounceLinkRow(
  session: Session
): ActionRowBuilder<ButtonBuilder> | null {
  const url = sessionAnnounceUrl(session);
  if (!url) return null;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel(ANNOUNCE_LINK_LABEL)
      .setURL(url)
  );
}
