import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { getAdminIntegrationStatusResponse } from "@/lib/erp/admin-integration-status";

export async function GET() {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasRole(session.user.role, "GM")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await getAdminIntegrationStatusResponse(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[admin/integration-status] status query failed", error);
    return NextResponse.json(
      { error: "Discord 연동 현황을 불러오지 못했습니다." },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
