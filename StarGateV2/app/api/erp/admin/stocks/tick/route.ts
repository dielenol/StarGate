import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { applyScheduledStockTick } from "@/lib/stocks/scheduled-tick";

interface PostBody {
  force?: boolean;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as PostBody;
  const summary = await applyScheduledStockTick({ force: Boolean(body.force) });
  return NextResponse.json(summary);
}

