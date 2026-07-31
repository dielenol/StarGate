import { NextResponse } from "next/server";
import { getClient } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  getMrBeastLotteryAdminConfig,
  getMrBeastLotteryReadiness,
  serializeMrBeastLotteryAdminConfig,
  updateMrBeastLotteryConfig,
} from "@/lib/db/mrbeast-lottery";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { parseMrBeastLotteryConfigUpdate } from "@/lib/shop/mrbeast-lottery";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function json(
  body: unknown,
  init: { status?: number } = {},
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: NO_STORE_HEADERS,
  });
}

function forbidUnlessGM(
  role: Parameters<typeof requireRole>[0],
): NextResponse | null {
  try {
    requireRole(role, "GM");
    return null;
  } catch {
    return json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const forbidden = forbidUnlessGM(session.user.role);
  if (forbidden) return forbidden;

  try {
    return json(await getMrBeastLotteryAdminConfig());
  } catch (error) {
    console.error("[shop/admin/lottery] GET failed", error);
    return json(
      { error: "복권 이벤트 설정을 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const forbidden = forbidUnlessGM(session.user.role);
  if (forbidden) return forbidden;

  const validation = parseMrBeastLotteryConfigUpdate(
    await request.json().catch(() => null),
  );
  if (!validation.ok) {
    return json({ error: validation.error }, { status: 400 });
  }

  try {
    const readiness = await getMrBeastLotteryReadiness({
      freshIndexes: validation.input.enabled,
    });
    if (validation.input.enabled && !readiness.ready) {
      return json(
        {
          error: "복권 필수 준비 항목을 해결한 뒤 활성화할 수 있습니다.",
          code: "LOTTERY_NOT_READY",
          readiness,
        },
        { status: 503 },
      );
    }

    const client = await getClient();
    const mongoSession = client.startSession();
    let changed = false;
    let result: Awaited<
      ReturnType<typeof getMrBeastLotteryAdminConfig>
    > | null = null;
    try {
      await mongoSession.withTransaction(async () => {
        changed = false;
        result = null;
        const updated = await updateMrBeastLotteryConfig({
          ...validation.input,
          updatedById: session.user.id,
          updatedByName: session.user.displayName,
          session: mongoSession,
        });
        if (!updated) return;

        result = serializeMrBeastLotteryAdminConfig(updated, readiness);
        await scheduleGmAdminAudit(
          {
            action: "미스터비스트 복권 이벤트 설정 변경",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `${result.enabled ? "활성화" : "비활성화"} · ${result.eventId} · ${result.startAt} ~ ${result.endAt} · v${result.version}`,
            target: "띠아 편의점 미스터비스트 복권",
            timestamp: updated.updatedAt,
          },
          { session: mongoSession },
        );
        changed = true;
      });
    } finally {
      await mongoSession.endSession();
    }

    if (!changed || !result) {
      return json(
        {
          error: "다른 GM이 복권 이벤트 설정을 먼저 변경했습니다.",
          code: "LOTTERY_CONFIG_CHANGED",
        },
        { status: 409 },
      );
    }
    return json(result);
  } catch (error) {
    console.error("[shop/admin/lottery] PATCH failed", error);
    return json(
      { error: "복권 이벤트 설정을 저장할 수 없습니다." },
      { status: 500 },
    );
  }
}
