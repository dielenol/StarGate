import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

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

  return (
    <RouletteClient
      currentUserName={session.user.name ?? session.user.discordUserId}
    />
  );
}
