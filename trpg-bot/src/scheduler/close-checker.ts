/**
 * 마감 스케줄러
 *
 * closeDateTime이 지난 OPEN 세션을 주기적으로 검사하여
 * CLOSED로 전환하고, 버튼 비활성화 및 최종 결과 메시지를 전송합니다.
 * @module scheduler/close-checker
 */

import type { Client, Collection, GuildMember } from "discord.js";
import {
  type TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  findOpenSessionsPastClose,
  updateSessionStatus,
} from "../db/sessions.js";
import { findBySessionId, countByStatus } from "../db/responses.js";
import { buildSessionEmbed, buildResultEmbed } from "../utils/embed.js";
import { getNonResponders } from "../utils/no-response.js";
import type { Session } from "../types/session.js";

/** 마감 체크 주기 (밀리초, 1분) */
const CHECK_INTERVAL_MS = 60 * 1000;

/** 버튼 customId 접두사 */
const PREFIX = "trpg:attend:";

/**
 * 단일 세션에 대해 마감 처리를 수행합니다.
 * @param client Discord 클라이언트
 * @param session 마감 대상 세션
 */
async function processClosedSession(
  client: Client,
  session: Session
): Promise<void> {
  const guild = await client.guilds.fetch(session.guildId);
  const channel = await guild.channels.fetch(session.channelId);
  if (!channel?.isTextBased() || !("send" in channel)) return;

  const sid = String(session._id);

  // members 1회만 fetch (rate limit 방지 — 상위 루프에서 재시도)
  const members = await guild.members.fetch();

  // 1. 세션 상태를 CLOSED로 업데이트
  await updateSessionStatus(sid, "CLOSED");

  // 2. 응답 목록 및 집계
  const responses = await findBySessionId(sid);
  const counts = await countByStatus(sid);

  // 3. 무응답자 계산
  const noResponseIds = await getNonResponders(
    guild,
    session.targetRoleId,
    responses,
    members
  );
  const yesIds = responses
    .filter((r) => r.status === "YES")
    .map((r) => r.userId);
  const noIds = responses
    .filter((r) => r.status === "NO")
    .map((r) => r.userId);

  // 4. 원본 공지 메시지 수정: 버튼 비활성화, 임베드 갱신 (멘션 형식)
  try {
    const msg = await channel.messages.fetch(session.messageId);
    const embed = buildSessionEmbed(session, counts, yesIds, noIds);
    embed.setFooter({ text: "마감되었습니다." });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}${sid}:yes`)
        .setLabel("참석")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}${sid}:no`)
        .setLabel("불참")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    await msg.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error("[close-checker] 공지 메시지 수정 실패:", err);
  }

  // 5. 최종 결과 메시지 전송 (멘션 형식으로 표시)
  const resultEmbed = buildResultEmbed(
    session,
    yesIds,
    noIds,
    noResponseIds
  );

  await (channel as TextChannel).send({ embeds: [resultEmbed] });
}

/**
 * rate limit 에러인지 판별합니다.
 */
function isRateLimitError(err: unknown): err is { data?: { retry_after?: number } } {
  const e = err as { name?: string; data?: { retry_after?: number } };
  return (
    e?.name === "GatewayRateLimitError" ||
    typeof e?.data?.retry_after === "number"
  );
}

/**
 * 마감 스케줄러를 시작합니다.
 * 1분마다 마감 대상 세션을 검사하고 처리합니다.
 * rate limit 시 retry_after만큼 대기 후 재시도합니다.
 * @param client Discord 클라이언트
 */
export function startCloseChecker(client: Client): void {
  setInterval(async () => {
    try {
      const sessions = await findOpenSessionsPastClose();
      for (const session of sessions) {
        try {
          await processClosedSession(client, session);
        } catch (err) {
          if (isRateLimitError(err)) {
            const retryAfter =
              (err.data?.retry_after ?? 30) * 1000;
            console.warn(
              `[close-checker] rate limit, ${retryAfter / 1000}초 후 재시도`
            );
            await new Promise((r) => setTimeout(r, retryAfter));
            await processClosedSession(client, session);
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      console.error("[close-checker] 마감 처리 오류:", err);
    }
  }, CHECK_INTERVAL_MS);
}
