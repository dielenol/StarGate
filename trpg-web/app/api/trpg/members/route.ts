/**
 * GET /api/trpg/members — TRPG 길드 활성 멤버 목록.
 *
 * 참가자 선택 UI 의 후보 풀로 사용된다. 탈퇴자는 제외.
 */

import "@/lib/db/init";

import { NextResponse } from "next/server";

import { listActiveTrpgGuildMembers } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { TRPG_GUILD_ID } from "@/lib/env";

export interface TrpgMemberView {
  discordUserId: string;
  displayName: string;
  discordUsername: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const members = await listActiveTrpgGuildMembers(TRPG_GUILD_ID);

    const payload: TrpgMemberView[] = members.map((m) => ({
      discordUserId: m.discordUserId,
      displayName: m.displayName,
      discordUsername: m.discordUsername,
    }));

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "멤버 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
