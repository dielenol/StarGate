import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";

import { buildStockAdminHoldingsResponse } from "@/app/(erp)/erp/admin/stocks/_data";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await buildStockAdminHoldingsResponse();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "주식 보유 현황 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
