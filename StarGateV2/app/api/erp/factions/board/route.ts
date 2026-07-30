import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { hasLocalErpPreviewAccess } from "@/lib/erp/local-page-access";
import { getFactionBoardData } from "@/app/(erp)/erp/factions/_data";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canPreview =
    hasRole(session.user.role, "GM") || (await hasLocalErpPreviewAccess());
  if (!canPreview) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(
      await getFactionBoardData(session.user.role),
    );
  } catch (error) {
    console.error("[factions/board] GET failed", error);
    return NextResponse.json(
      { error: "세력 관계도를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
