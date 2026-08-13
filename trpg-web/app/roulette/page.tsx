import "@/lib/db/init";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listActiveTrpgGuildMembers } from "@stargate/shared-db";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import { auth } from "@/lib/auth/config";
import { TRPG_GUILD_ID } from "@/lib/env";

import { RouletteClient } from "./RouletteClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "마블 룰렛 | TRPG 세션 캘린더",
  description: "구슬 경주로 참가자 한 명을 무작위 추첨합니다.",
};

export default async function RoulettePage() {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    redirect("/login");
  }

  const rawMembers = await listActiveTrpgGuildMembers(TRPG_GUILD_ID).catch(
    () => [],
  );
  const initialMembers: TrpgMemberView[] = rawMembers.map((member) => ({
    discordUserId: member.discordUserId,
    displayName: member.displayName,
    discordUsername: member.discordUsername,
    avatarUrl:
      member.discordAvatarUrl ??
      (member.discordUserId === session.user.discordUserId
        ? (session.user.image ?? null)
        : null),
  }));

  return (
    <RouletteClient
      currentUserDiscordId={session.user.discordUserId}
      currentUserName={session.user.name ?? session.user.discordUserId}
      initialMembers={initialMembers}
    />
  );
}
