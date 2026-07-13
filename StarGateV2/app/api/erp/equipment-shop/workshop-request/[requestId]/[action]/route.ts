import { NextResponse, after } from "next/server";

import { isValidIdempotencyKey, readIdempotencyKey } from "@/lib/api/idempotency";
import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { getActiveSession } from "@/lib/auth/active-session";
import {
  findEquipmentWorkshopRequestById,
  serializeEquipmentWorkshopRequest,
  transitionEquipmentWorkshopRequest,
} from "@/lib/db/equipment-workshop-requests";
import {
  acceptWorkshopQuoteInTransaction,
  claimWorkshopResultInTransaction,
  prepareWorkshopOperationLocks,
  WorkshopOperationError,
} from "@/lib/equipment-shop/workshop-operations";
import { notifyUser } from "@/lib/notifications/events";

interface RouteContext {
  params: Promise<{ requestId: string; action: string }>;
}

function operationError(error: unknown): NextResponse | null {
  if (!(error instanceof WorkshopOperationError)) return null;
  const status = error.code === "FORBIDDEN" ? 403 : error.code === "REQUEST_NOT_FOUND" ? 404 : 409;
  const code = {
    REQUEST_NOT_FOUND: "REQUEST_NOT_FOUND",
    FORBIDDEN: "FORBIDDEN",
    INVALID_STATE: "REQUEST_STATE_CHANGED",
    QUOTE_CHANGED: "QUOTE_CHANGED",
    TARGET_CHANGED: "SOURCE_ITEM_CHANGED",
    MATERIAL_SHORTAGE: "INSUFFICIENT_MATERIALS",
    NOT_READY: "WORKSHOP_NOT_READY",
  }[error.code];
  return NextResponse.json({ error: error.message, code }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getActiveSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { requestId, action } = await context.params;
  if (!isValidIdempotencyKey(requestId) || !["accept", "decline", "claim"].includes(action)) {
    return NextResponse.json({ error: "잘못된 공방 작업 경로입니다." }, { status: 400 });
  }
  const operationId = readIdempotencyKey(request);
  if (!operationId) return NextResponse.json({ error: "유효한 Idempotency-Key 헤더가 필요합니다." }, { status: 400 });
  const actorName = session.user.displayName || session.user.username || `user-${session.user.id.slice(0, 6)}`;
  const current = await findEquipmentWorkshopRequestById(requestId);
  if (!current) return NextResponse.json({ error: "공방 요청을 찾을 수 없습니다." }, { status: 404 });
  if (current.userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { expectedQuoteVersion?: unknown } | null;
  const expectedQuoteVersion = body?.expectedQuoteVersion;
  if (
    (action === "accept" || action === "decline") &&
    (!Number.isInteger(expectedQuoteVersion) || Number(expectedQuoteVersion) < 1)
  ) {
    return NextResponse.json({ error: "확인한 견적 버전이 필요합니다." }, { status: 400 });
  }

  if (action === "decline") {
    if (current.status !== "QUOTED") return NextResponse.json({ error: "거절 가능한 견적 상태가 아닙니다." }, { status: 409 });
    if (current.quote?.version !== expectedQuoteVersion) return NextResponse.json({ error: "견적이 변경되었습니다. 최신 내용을 다시 확인해 주세요.", code: "QUOTE_CHANGED" }, { status: 409 });
    const updated = await transitionEquipmentWorkshopRequest({
      requestId,
      currentStatus: "QUOTED",
      status: "DECLINED",
      actorId: session.user.id,
      actorName,
      expectedQuoteVersion: Number(expectedQuoteVersion),
    });
    if (!updated) return NextResponse.json({ error: "다른 요청이 먼저 견적 상태를 변경했습니다." }, { status: 409 });
    return NextResponse.json({ request: serializeEquipmentWorkshopRequest(updated) });
  }

  try {
    await prepareWorkshopOperationLocks(current);
    const response = await executeEconomicOperation({
      requestId: operationId,
      domain: `equipment-workshop-${action}`,
      actorId: session.user.id,
      payload: { workshopRequestId: requestId, expectedQuoteVersion: expectedQuoteVersion ?? null },
      run: async (mongoSession) => {
        const updated = action === "accept"
          ? await acceptWorkshopQuoteInTransaction({
              requestId,
              expectedQuoteVersion: Number(expectedQuoteVersion),
              actorId: session.user.id,
              actorName,
              session: mongoSession,
            })
          : await claimWorkshopResultInTransaction({
              requestId,
              actorId: session.user.id,
              actorName,
              session: mongoSession,
            });
        return { status: 200, body: { request: serializeEquipmentWorkshopRequest(updated) } };
      },
    });
    if (response.ok && response.headers.get("X-Idempotency-Replayed") !== "true") {
      after(() =>
        notifyUser({
          userId: session.user.id,
          type: "SYSTEM",
          title: action === "accept" ? "공방 강화 제작이 시작되었습니다" : "공방 강화 장비를 수령했습니다",
          message: `${current.characterCodename} · ${current.quote?.result.name ?? current.equipmentName ?? "장비"}`,
          link: "/erp/equipment-shop/custom",
        }).catch((error) => console.error("[equipment-workshop] player action notification failed", error)),
      );
    }
    return response;
  } catch (error) {
    const mapped = operationError(error);
    if (mapped) return mapped;
    if (error instanceof Error && error.message.includes("음수 잔액")) {
      return NextResponse.json({ error: "잔액이 부족합니다.", code: "INSUFFICIENT_BALANCE" }, { status: 400 });
    }
    console.error("[equipment-workshop] player operation failed", error);
    return NextResponse.json({ error: "공방 작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
