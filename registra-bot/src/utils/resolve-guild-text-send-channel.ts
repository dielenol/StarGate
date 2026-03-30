/**
 * 길드 내에서 봇이 메시지를 보낼 수 있는 텍스트 기반 채널을 해석합니다.
 *
 * @module utils/resolve-guild-text-send-channel
 */

import type { Guild, TextChannel } from "discord.js";

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
      message:
        "❌ 메시지를 보낼 채널을 정할 수 없습니다. 텍스트 채널에서 명령하거나 **채널** 옵션으로 지정해 주세요.",
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
      message:
        "❌ 해당 채널을 찾을 수 없거나, **텍스트·공지 채널** 또는 **스레드**에만 올릴 수 있습니다.",
    };
  }

  return { ok: true, channel: channel as TextChannel };
}
