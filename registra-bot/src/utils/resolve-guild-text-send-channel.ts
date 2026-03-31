/**
 * 길드 내에서 봇이 메시지를 보낼 수 있는 텍스트 기반 채널을 해석합니다.
 *
 * @module utils/resolve-guild-text-send-channel
 */

import type { Guild, TextChannel } from "discord.js";
import { Channel } from "../constants/registrar-voice.js";

export type ResolveGuildTextSendChannelResult =
  | { ok: true; channel: TextChannel }
  | { ok: false; message: string };

/**
 * 옵션 채널이 있으면 우선하고, 없으면 명령이 실행된 채널을 사용합니다.
 * `getChannel()` 반환 타입은 API 스냅샷이라 `id`만 사용합니다.
 */
export async function resolveGuildTextSendChannel(
  guild: Guild,
  channelFromOpt: { id: string } | null,
  fallbackChannelId: string | null
): Promise<ResolveGuildTextSendChannelResult> {
  const targetId = channelFromOpt?.id ?? fallbackChannelId;
  if (!targetId) {
    return {
      ok: false,
      message: Channel.noTarget,
    };
  }

  let channel;
  try {
    channel = await guild.channels.fetch(targetId);
  } catch {
    channel = null;
  }

  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    return {
      ok: false,
      message: Channel.bad,
    };
  }

  return { ok: true, channel: channel as TextChannel };
}
