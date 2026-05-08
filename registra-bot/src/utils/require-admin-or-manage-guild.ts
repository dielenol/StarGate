/**
 * Discord 네이티브 Administrator 또는 ManageGuild 권한만 통과시키는 헬퍼.
 *
 * `require-manage-guild.ts` 가 Role(미니세션 마스터)까지 폭넓게 인정하는 반면,
 * 본 헬퍼는 **Discord 네이티브 권한**만 체크한다(`config.miniSessionMasterRoleId` ❌).
 *
 * 크레딧 명령(`/크레딧 ...`) 의 GM 게이트로 사용한다 — 운영 자금에 영향을 주는
 * 절차이므로, 일반 마스터 Role 까지 위임 권한을 확장하지 않는다는 정책 결정.
 *
 * @module utils/require-admin-or-manage-guild
 */

import {
  type ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { D } from "../constants/registrar-voice.js";

/**
 * 인터랙션 페이로드만으로 판별 가능하면 true/false, 아니면 `null`(멤버 fetch 필요).
 */
function syncAdminOrManageGuild(
  interaction: ChatInputCommandInteraction
): boolean | null {
  const p = interaction.memberPermissions;
  if (p?.has(PermissionFlagsBits.Administrator)) return true;
  if (p?.has(PermissionFlagsBits.ManageGuild)) return true;
  const mem = interaction.member;
  if (mem instanceof GuildMember) {
    if (mem.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (mem.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    return false;
  }
  return null;
}

/**
 * `deferReply` 이후 호출. 서버 관리·관리자 권한 여부.
 * 페이로드만으로 판별 불가하면 `guild.members.fetch`로 보강한다.
 */
export async function hasAdminOrManageGuildAfterDeferred(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  const s = syncAdminOrManageGuild(interaction);
  if (s !== null) return s;
  if (!interaction.guildId) return false;
  try {
    const m = await interaction.guild!.members.fetch(interaction.user.id);
    return (
      m.permissions.has(PermissionFlagsBits.Administrator) ||
      m.permissions.has(PermissionFlagsBits.ManageGuild)
    );
  } catch {
    return false;
  }
}

/**
 * 길드 슬래시에서 **먼저** 에페메랄 연기 후 권한 검사.
 * 3초 초과로 인한 "애플리케이션이 응답하지 않습니다" 완화.
 */
export async function deferReplyAndRequireAdminOrManageGuild(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: D.guildOnly,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ok = await hasAdminOrManageGuildAfterDeferred(interaction);
  if (!ok) {
    await interaction.editReply({ content: D.permManage });
    return false;
  }
  return true;
}
