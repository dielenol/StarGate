import "@/lib/db/init";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  findUsersByDiscordIds,
  listActiveTrpgGuildMembers,
} from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { toTrpgMemberViews } from "@/lib/discord/avatar";
import { TRPG_GUILD_ID } from "@/lib/env";

import { RouletteClient } from "./RouletteClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "다채 룰렛 | TRPG 세션 캘린더",
  description: "Discord 프로필 마블 경주로 참가자를 추첨합니다.",
};

export default async function RoulettePage() {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    redirect("/login");
  }

  const rawMembers = await listActiveTrpgGuildMembers(TRPG_GUILD_ID).catch(
    () => [],
  );
  const linkedUsers = await findUsersByDiscordIds(
    rawMembers.map((member) => member.discordUserId),
  ).catch(() => []);
  const initialMembers = toTrpgMemberViews(rawMembers, {
    linkedUsers,
    currentUserDiscordId: session.user.discordUserId,
    currentUserAvatarUrl: session.user.image,
  });

  return (
    <RouletteClient
      currentUserDiscordId={session.user.discordUserId}
      currentUserName={session.user.name ?? session.user.discordUserId}
      initialMembers={initialMembers}
    />
  );
}
