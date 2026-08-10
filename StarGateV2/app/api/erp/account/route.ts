import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { ERP_GUEST_USER } from "@/lib/auth/guest";
import { getCurrentAccountResponse } from "@/lib/erp/current-account";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.isGuest) {
    return NextResponse.json({
      id: ERP_GUEST_USER.id,
      username: ERP_GUEST_USER.username,
      displayName: ERP_GUEST_USER.displayName,
      discordId: null,
      discordUsername: null,
      discordGlobalName: null,
      discordAvatar: null,
      role: ERP_GUEST_USER.role,
      status: "ACTIVE",
      lastLoginAt: null,
      passwordChangedAt: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
  }

  try {
    const account = await getCurrentAccountResponse(session.user.id);
    if (!account) {
      return NextResponse.json(
        { error: "계정을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json(account);
  } catch (error) {
    console.error("[account] GET failed", error);
    return NextResponse.json(
      { error: "계정 정보를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
