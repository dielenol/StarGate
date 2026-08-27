import { after, NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { reconcileCompletedVttHostAudit } from "@/lib/vtt-runtime/host-audit";
import { getVttHostStatus } from "@/lib/vtt-runtime/host-control-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function reconcileCompletedAudit(status: Awaited<ReturnType<typeof getVttHostStatus>>) {
  try {
    await reconcileCompletedVttHostAudit(status);
  } catch (error) {
    console.error("[admin/vtt-hosts] completion audit reconcile failed", {
      requestId: status.lastAction?.requestId ?? null,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function GET() {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasRole(session.user.role, "GM")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = await getVttHostStatus();
  after(() => reconcileCompletedAudit(status));
  return NextResponse.json(status, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
