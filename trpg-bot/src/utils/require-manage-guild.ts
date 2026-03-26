import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";

/** 슬래시 실행 멤버에게 서버 관리(Manage Guild) 권한이 있는지 */
export function requireManageGuild(
  interaction: ChatInputCommandInteraction
): boolean {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ??
    false
  );
}
