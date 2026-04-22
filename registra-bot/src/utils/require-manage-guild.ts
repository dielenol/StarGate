import {
  type ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { config } from "../config.js";
import { D } from "../constants/registrar-voice.js";

/**
 * 미니세션 마스터 Role 보유 여부.
 * `config.miniSessionMasterRoleId` 미설정 시 항상 false — 기존 동작 보존.
 */
function hasMiniSessionMasterRole(member: GuildMember): boolean {
  const roleId = config.miniSessionMasterRoleId;
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

/**
 * 인터랙션 페이로드만으로 판별 가능하면 true/false, 아니면 `null`(멤버 fetch 필요).
 *
 * Role 체크는 `GuildMember` 인스턴스에서만 수행. 페이로드가 raw
 * `APIInteractionGuildMember`일 때는 `null`을 돌려 `fetch` 경로로 위임한다.
 */
function syncManageGuild(
  interaction: ChatInputCommandInteraction
): boolean | null {
  const p = interaction.memberPermissions;
  if (p?.has(PermissionFlagsBits.Administrator)) return true;
  if (p?.has(PermissionFlagsBits.ManageGuild)) return true;
  const mem = interaction.member;
  if (mem instanceof GuildMember) {
    if (mem.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (mem.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    if (hasMiniSessionMasterRole(mem)) return true;
    return false;
  }
  return null;
}

/**
 * `deferReply` 이후 호출. 서버 관리·관리자 권한 또는 미니세션 마스터 Role 여부.
 * 페이로드만으로 판별 불가하면 `guild.members.fetch`로 보강합니다.
 */
export async function hasManageGuildAfterDeferred(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  const s = syncManageGuild(interaction);
  if (s !== null) return s;
  if (!interaction.guildId) return false;
  try {
    const m = await interaction.guild!.members.fetch(interaction.user.id);
    return (
      m.permissions.has(PermissionFlagsBits.Administrator) ||
      m.permissions.has(PermissionFlagsBits.ManageGuild) ||
      hasMiniSessionMasterRole(m)
    );
  } catch {
    return false;
  }
}

/**
 * 길드 슬래시에서 **먼저** 에페메랄 연기 후 서버 관리 권한 검사.
 * 3초 초과로 인한 "애플리케이션이 응답하지 않습니다" 완화.
 */
export async function deferReplyAndRequireManageGuild(
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

  const ok = await hasManageGuildAfterDeferred(interaction);
  if (!ok) {
    await interaction.editReply({ content: D.permManage });
    return false;
  }
  return true;
}
