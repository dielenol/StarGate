import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { getAdminInventoryOverviewResponse } from "@/lib/erp/admin-inventory-overview";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasRole(session.user.role, "V")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await getAdminInventoryOverviewResponse());
  } catch (error) {
    console.error("[admin/inventory/overview] GET failed", error);
    return NextResponse.json(
      { error: "인벤토리 운용 현황을 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
