/**
 * DM 우선 → 실패 시 폴백 채널 멘션 발송 유틸
 *
 * 흐름:
 *   1. `users.fetch(userId)` → `user.send(payload)` 시도.
 *   2. DM 실패 시 Discord API 오류 코드로 분기:
 *        - 10013 (Unknown User): 폴백 없이 failed
 *        - 50007 (Cannot send messages to this user): 폴백
 *        - 그 밖의 모든 실패(다른 API 코드·네트워크·타임아웃): 폴백
 *      앱 레벨 재시도는 하지 않는다 — `@discordjs/rest` 가 AbortError·ECONNRESET 을
 *      이미 3회 재시도하므로, 여기서 다시 보내면 사용자당 지연과 중복 DM 위험만 는다.
 *   3. 폴백은 채널을 fetch 해 `<@userId>` 멘션 + 동일 페이로드 발송.
 *      `options.allowFallback === false` 면(길드 탈퇴자 등) 폴백 없이 failed.
 *   4. 폴백마저 실패 시 `{ method: "failed", error }` 반환 (호출처가 로그 적재).
 *
 * @module utils/dm-with-fallback
 */

import { ChannelType, DiscordAPIError } from "discord.js";

import type {
  BaseMessageOptions,
  Client,
  MessagePayload,
} from "discord.js";

/** Discord: Unknown User (존재하지 않거나 삭제된 계정) */
export const DISCORD_UNKNOWN_USER = 10013;
/** Discord: Cannot send messages to this user (DM 차단·서버 공유 없음) */
export const DISCORD_CANNOT_MESSAGE_USER = 50007;

export type DmResult = {
  method: "dm" | "fallback" | "failed";
  error?: string;
  /** DM 실패의 Discord API 오류 코드. 네트워크·타임아웃 계열이거나 성공이면 없음 */
  code?: number;
};

export type SendDmOptions = {
  fallbackChannelId: string;
  mentionUser: boolean;
  /** false 면 DM 실패 시 공개 폴백 멘션을 하지 않는다 (기본 true) */
  allowFallback?: boolean;
};

type SendableContent = MessagePayload | BaseMessageOptions;

function errorToString(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}

/**
 * Discord API 오류 코드. `DiscordAPIError` 의 숫자 코드만 인정한다 — DOMException 의
 * legacy `code`(AbortError 20, TimeoutError 23)나 Node 의 `code: "ECONNRESET"` 은 API
 * 코드가 아니므로 null.
 */
export function discordErrorCode(err: unknown): number | null {
  return err instanceof DiscordAPIError && typeof err.code === "number"
    ? err.code
    : null;
}

/**
 * DM 우선 발송, 실패 시 폴백 채널 멘션.
 *
 * @param client - 활성 Discord Client
 * @param userId - 발송 대상 디스코드 user id
 * @param payload - `user.send` / `channel.send` 둘 다에 그대로 전달 가능한 페이로드
 * @param options.fallbackChannelId - DM 실패 시 멘션을 보낼 채널 id
 * @param options.mentionUser - 폴백 채널 발송 시 본문 앞에 `<@userId>` 멘션을 prepend
 * @param options.allowFallback - false 면 폴백 없이 failed (기본 true)
 *
 * `content` 필드만 mention prefix 가 가능. embed/files-only 페이로드는 mention 없이
 * 동일 페이로드만 발송 + 추가 content 로 mention 만 따로 prepend.
 */
export async function sendDmOrFallback(
  client: Client,
  userId: string,
  payload: SendableContent,
  options: SendDmOptions,
): Promise<DmResult> {
  // 1차: DM
  let dmError: unknown;
  try {
    const user = await client.users.fetch(userId);
    await user.send(payload);
    return { method: "dm" };
  } catch (err) {
    dmError = err;
  }

  const code = discordErrorCode(dmError);
  const dmErrorMessage = errorToString(dmError);
  const failed = (error: string): DmResult =>
    code === null ? { method: "failed", error } : { method: "failed", error, code };

  if (code === DISCORD_UNKNOWN_USER) {
    // 존재하지 않는 계정 — 폴백 멘션도 의미 없다.
    return failed(dmErrorMessage);
  }
  if (options.allowFallback === false) {
    return failed(dmErrorMessage);
  }

  // 2차: 폴백 채널 멘션
  try {
    const channel = await client.channels.fetch(options.fallbackChannelId);
    if (!channel) {
      return failed(
        `${dmErrorMessage} | fallback channel ${options.fallbackChannelId} not found`,
      );
    }
    // DM/카테고리/포럼 등 직접 send 불가 채널 차단
    if (
      channel.isDMBased() ||
      channel.type === ChannelType.GuildCategory ||
      channel.type === ChannelType.GuildForum
    ) {
      return failed(
        `${dmErrorMessage} | fallback channel type=${channel.type} not sendable`,
      );
    }
    if (!channel.isTextBased() || !("send" in channel)) {
      return failed(
        `${dmErrorMessage} | fallback channel type=${channel.type} has no send()`,
      );
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
    return failed(`${dmErrorMessage} | fallback: ${errorToString(fallbackErr)}`);
  }
}
