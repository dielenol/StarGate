/**
 * DM 우선 → 실패 시 폴백 채널 멘션 발송 유틸
 *
 * 흐름:
 *   1. `users.fetch(userId)` → `user.send(payload)` 시도.
 *   2. 실패 (DM 차단 등) 시, 폴백 채널을 fetch 해 `<@userId>` 멘션 + 동일 페이로드 발송.
 *   3. 폴백마저 실패 시 `{ method: "failed", error }` 반환 (호출처가 로그 적재).
 *
 * @module utils/dm-with-fallback
 */

import { ChannelType } from "discord.js";

import type {
  BaseMessageOptions,
  Client,
  MessagePayload,
} from "discord.js";

export type DmResult = {
  method: "dm" | "fallback" | "failed";
  error?: string;
};

type SendableContent = MessagePayload | BaseMessageOptions;

function errorToString(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}

/**
 * DM 우선 발송, 실패 시 폴백 채널 멘션.
 *
 * @param client - 활성 Discord Client
 * @param userId - 발송 대상 디스코드 user id
 * @param payload - `user.send` / `channel.send` 둘 다에 그대로 전달 가능한 페이로드
 * @param options.fallbackChannelId - DM 실패 시 멘션을 보낼 채널 id
 * @param options.mentionUser - 폴백 채널 발송 시 본문 앞에 `<@userId>` 멘션을 prepend
 *
 * `content` 필드만 mention prefix 가 가능. embed/files-only 페이로드는 mention 없이
 * 동일 페이로드만 발송 + 추가 content 로 mention 만 따로 prepend.
 */
export async function sendDmOrFallback(
  client: Client,
  userId: string,
  payload: SendableContent,
  options: { fallbackChannelId: string; mentionUser: boolean },
): Promise<DmResult> {
  // 1차: DM
  try {
    const user = await client.users.fetch(userId);
    await user.send(payload);
    return { method: "dm" };
  } catch (dmErr) {
    // DM 차단·계정 비활성 등 — 폴백 진입
    const dmErrorMessage = errorToString(dmErr);

    try {
      const channel = await client.channels.fetch(options.fallbackChannelId);
      if (!channel) {
        return {
          method: "failed",
          error: `${dmErrorMessage} | fallback channel ${options.fallbackChannelId} not found`,
        };
      }
      // DM/카테고리/포럼 등 직접 send 불가 채널 차단
      if (
        channel.isDMBased() ||
        channel.type === ChannelType.GuildCategory ||
        channel.type === ChannelType.GuildForum
      ) {
        return {
          method: "failed",
          error: `${dmErrorMessage} | fallback channel type=${channel.type} not sendable`,
        };
      }
      if (!channel.isTextBased() || !("send" in channel)) {
        return {
          method: "failed",
          error: `${dmErrorMessage} | fallback channel type=${channel.type} has no send()`,
        };
      }

      const mentionContent = options.mentionUser ? `<@${userId}>` : null;

      if (mentionContent) {
        // payload 가 string 이거나 BaseMessageOptions 이거나 다양 — 안전하게 별도 메시지로 멘션을 먼저 보내고 본문 발송
        // 단, embeds/files 만 있는 경우 단일 send 가 더 자연스러우므로 가능한 합친다.
        if (typeof payload === "string") {
          await channel.send({
            content: `${mentionContent}\n${payload}`,
          });
        } else if (
          payload &&
          typeof payload === "object" &&
          "content" in payload &&
          payload.content !== undefined
        ) {
          // BaseMessageOptions with content — mention prepend
          const merged: BaseMessageOptions = {
            ...(payload as BaseMessageOptions),
            content: `${mentionContent}\n${payload.content}`,
          };
          await channel.send(merged);
        } else {
          // payload 에 content 가 없는 경우 — 멘션을 content 로 추가
          const merged: BaseMessageOptions = {
            ...(payload as BaseMessageOptions),
            content: mentionContent,
          };
          await channel.send(merged);
        }
      } else {
        await channel.send(payload);
      }

      return { method: "fallback", error: dmErrorMessage };
    } catch (fallbackErr) {
      return {
        method: "failed",
        error: `${dmErrorMessage} | fallback: ${errorToString(fallbackErr)}`,
      };
    }
  }
}
