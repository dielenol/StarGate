import { NextResponse } from "next/server";

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
    APPROVAL_PENDING: "WORKSHOP_APPROVAL_PENDING",
    APPROVAL_INVALID: "WORKSHOP_APPROVAL_INVALID",
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
  const guildId = process.env.GUILD_ID?.trim();
  if (action === "accept" && current.quote?.approvalGate && !guildId) {
    return NextResponse.json(
      {
        error: "관료 표결 길드 설정이 없어 이 견적을 시작할 수 없습니다.",
        code: "WORKSHOP_APPROVAL_INVALID",
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { expectedQuoteVersion?: unknown } | null;
  const expectedQuoteVersion = body?.expectedQuoteVersion;
  if (
    (action === "accept" || action === "decline") &&
    (!Number.isInteger(expectedQuoteVersion) || Number(expectedQuoteVersion) < 1)
  ) {
    return NextResponse.json({ error: "확인한 견적 버전이 필요합니다." }, { status: 400 });
  }

  if (action === "decline") {
    try {
      return await executeEconomicOperation({
        requestId: operationId,
        domain: "equipment-workshop-decline",
        actorId: session.user.id,
        payload: {
          workshopRequestId: requestId,
          expectedQuoteVersion: Number(expectedQuoteVersion),
        },
        run: async (mongoSession) => {
          const latest = await findEquipmentWorkshopRequestById(requestId, {
            session: mongoSession,
          });
          if (!latest) {
            throw new WorkshopOperationError(
              "REQUEST_NOT_FOUND",
              "공방 요청을 찾을 수 없습니다.",
            );
          }
          if (latest.userId !== session.user.id) {
            throw new WorkshopOperationError(
              "FORBIDDEN",
              "본인의 공방 요청만 거절할 수 있습니다.",
            );
          }
          if (latest.status !== "QUOTED") {
            throw new WorkshopOperationError(
              "INVALID_STATE",
              "거절 가능한 견적 상태가 아닙니다.",
            );
          }
          if (latest.quote?.version !== expectedQuoteVersion) {
            throw new WorkshopOperationError(
              "QUOTE_CHANGED",
              "견적이 변경되었습니다. 최신 내용을 다시 확인해 주세요.",
            );
          }
          const updated = await transitionEquipmentWorkshopRequest({
            requestId,
            currentStatus: "QUOTED",
            status: "DECLINED",
            actorId: session.user.id,
            actorName,
            actorKind: "PLAYER",
            expectedQuoteVersion: Number(expectedQuoteVersion),
            session: mongoSession,
          });
          if (!updated) {
            throw new WorkshopOperationError(
              "INVALID_STATE",
              "다른 요청이 먼저 견적 상태를 변경했습니다.",
            );
          }
          return {
            status: 200,
            body: { request: serializeEquipmentWorkshopRequest(updated) },
          };
        },
      });
    } catch (error) {
      const mapped = operationError(error);
      if (mapped) return mapped;
      console.error("[equipment-workshop] decline failed", error);
      return NextResponse.json(
        { error: "견적 거절을 처리하지 못했습니다." },
        { status: 500 },
      );
    }
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
              actorRole: session.user.role,
              guildId,
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
      await notifyUser({
        userId: session.user.id,
        type: "SYSTEM",
        title: action === "accept"
          ? `공방 ${current.kind === "upgrade" ? "강화" : "신규 제작"}이 시작되었습니다`
          : `공방 ${current.kind === "upgrade" ? "강화" : "제작"} 장비를 수령했습니다`,
        message: `${current.characterCodename} · ${current.quote?.result.name ?? current.equipmentName ?? "장비"}`,
        link: "/erp/equipment-shop/custom",
      }).catch((error) =>
        console.error(
          "[equipment-workshop] player action notification failed",
          error,
        ),
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
