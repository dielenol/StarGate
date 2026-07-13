import { NextResponse, after } from "next/server";
import { masterItemsCol } from "@stargate/shared-db";
import { ObjectId } from "mongodb";

import { isValidIdempotencyKey, readIdempotencyKey } from "@/lib/api/idempotency";
import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import {
  findEquipmentWorkshopRequestById,
  serializeAdminEquipmentWorkshopRequest,
  updateEquipmentWorkshopQuote,
} from "@/lib/db/equipment-workshop-requests";
import {
  parseEquipmentWorkshopQuote,
  resolveEquipmentWorkshopSpecialist,
} from "@/lib/equipment-shop/workshop-request";
import {
  cancelWorkshopInTransaction,
  prepareWorkshopOperationLocks,
  WorkshopOperationError,
} from "@/lib/equipment-shop/workshop-operations";
import { notifyUser } from "@/lib/notifications/events";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

interface RouteContext {
  params: Promise<{ requestId: string; action: string }>;
}

async function requireGm() {
  const session = await getActiveSession();
  if (!session?.user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!hasRole(session.user.role, "GM")) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { session: session.user } as const;
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireGm();
  if ("response" in auth) return auth.response;
  const { requestId, action } = await context.params;
  if (!isValidIdempotencyKey(requestId) || action !== "quote") return NextResponse.json({ error: "잘못된 공방 견적 경로입니다." }, { status: 400 });
  const validation = parseEquipmentWorkshopQuote(await request.json().catch(() => null));
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const current = await findEquipmentWorkshopRequestById(requestId);
  if (!current) return NextResponse.json({ error: "공방 요청을 찾을 수 없습니다." }, { status: 404 });
  if (current.kind !== "upgrade" || !current.sourceItemId || !current.sourceCategory || !current.sourceSlot) return NextResponse.json({ error: "장착 장비 강화 요청만 견적을 발행할 수 있습니다." }, { status: 400 });
  if (!["REQUESTED", "IN_REVIEW", "APPROVED", "QUOTED"].includes(current.status)) return NextResponse.json({ error: "견적을 발행할 수 없는 요청 상태입니다." }, { status: 409 });
  if (validation.input.expectedVersion !== (current.quote?.version ?? 0)) return NextResponse.json({ error: "다른 운영자가 견적을 먼저 수정했습니다.", code: "QUOTE_CHANGED" }, { status: 409 });

  const itemIds = [current.sourceItemId, ...validation.input.materials.map((item) => item.itemId)];
  const items = await masterItemsCol();
  const masters = await items.find({ _id: { $in: itemIds.map((id) => new ObjectId(id)) } }).toArray();
  const byId = new Map(masters.map((item) => [String(item._id), item]));
  const source = byId.get(current.sourceItemId);
  if (
    !source ||
    (source.category !== "WEAPON" && source.category !== "ARMOR") ||
    source.category !== current.sourceCategory ||
    source.category !== current.sourceSlot
  ) return NextResponse.json({ error: "원본 마스터 장비 분류가 접수 시점과 다릅니다.", code: "SOURCE_ITEM_CHANGED" }, { status: 409 });
  if (validation.input.materials.some((item) => item.itemId === current.sourceItemId)) return NextResponse.json({ error: "강화 대상 장비를 재료로 지정할 수 없습니다." }, { status: 400 });
  const materials = validation.input.materials.map((material) => {
    const item = byId.get(material.itemId);
    return item ? { itemId: material.itemId, itemName: item.name, category: item.category, quantity: material.quantity } : null;
  });
  if (materials.some((item) => item === null)) return NextResponse.json({ error: "등록되지 않은 재료가 포함되어 있습니다." }, { status: 400 });

  const specialistCodename = resolveEquipmentWorkshopSpecialist({ category: source.category, tags: source.tags });
  const resultItemId = current.quote?.result.itemId ?? new ObjectId().toHexString();
  const generation = (source.workshop?.generation ?? 0) + 1;
  const now = new Date();
  const quote = {
    version: validation.input.expectedVersion + 1,
    creditCost: validation.input.creditCost,
    durationMinutes: validation.input.durationMinutes,
    specialistCodename,
    materials: materials.filter((item): item is NonNullable<typeof item> => item !== null),
    result: {
      itemId: resultItemId,
      slug: `workshop-${resultItemId}`,
      name: validation.input.result.name,
      description: validation.input.result.description,
      category: source.category,
      ...(validation.input.result.damage ? { damage: validation.input.result.damage } : {}),
      ...(validation.input.result.effect ? { effect: validation.input.result.effect } : {}),
      tags: [...new Set([...(validation.input.result.tags ?? []), "공방개조", specialistCodename])],
      ...(validation.input.result.previewImage ? { previewImage: validation.input.result.previewImage } : {}),
      generation,
    },
    issuedAt: now,
    issuedById: auth.session.id,
    issuedByName: auth.session.displayName,
  };
  const updated = await updateEquipmentWorkshopQuote({
    requestId,
    currentStatus: current.status,
    expectedVersion: validation.input.expectedVersion,
    quote,
    internalNote: validation.input.internalNote,
    actorId: auth.session.id,
    actorName: auth.session.displayName,
  });
  if (!updated) return NextResponse.json({ error: "다른 운영자가 요청 또는 견적 상태를 변경했습니다." }, { status: 409 });
  scheduleGmAdminAudit({
    action: "공방 강화 견적 발행",
    actor: { id: auth.session.id, displayName: auth.session.displayName, role: auth.session.role },
    summary: `${quote.creditCost.toLocaleString()} CR · ${quote.durationMinutes}분 · v${quote.version}`,
    target: `${updated.characterCodename} · ${updated.equipmentName ?? quote.result.name}`,
    timestamp: now,
  });
  after(() => notifyUser({ userId: updated.userId, type: "SYSTEM", title: "공방 강화 견적이 도착했습니다", message: `${updated.characterCodename} · ${quote.result.name} · ${specialistCodename}`, link: "/erp/equipment-shop/custom" }).catch((error) => console.error("[equipment-workshop] quote notification failed", error)));
  return NextResponse.json({ request: serializeAdminEquipmentWorkshopRequest(updated) });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireGm();
  if ("response" in auth) return auth.response;
  const { requestId, action } = await context.params;
  if (!isValidIdempotencyKey(requestId) || action !== "cancel") return NextResponse.json({ error: "잘못된 공방 취소 경로입니다." }, { status: 400 });
  const operationId = readIdempotencyKey(request);
  if (!operationId) return NextResponse.json({ error: "유효한 Idempotency-Key 헤더가 필요합니다." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { note?: unknown } | null;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note || note.length > 1000) return NextResponse.json({ error: "취소 사유를 1~1000자로 입력해 주세요." }, { status: 400 });
  const current = await findEquipmentWorkshopRequestById(requestId);
  if (!current) return NextResponse.json({ error: "공방 요청을 찾을 수 없습니다." }, { status: 404 });
  try {
    await prepareWorkshopOperationLocks(current);
    const response = await executeEconomicOperation({
      requestId: operationId,
      domain: "equipment-workshop-cancel",
      actorId: auth.session.id,
      payload: { workshopRequestId: requestId, note },
      run: async (mongoSession) => {
        const updated = await cancelWorkshopInTransaction({ requestId, actorId: auth.session.id, actorName: auth.session.displayName, note, session: mongoSession });
        return { status: 200, body: { request: serializeAdminEquipmentWorkshopRequest(updated) } };
      },
    });
    if (response.ok && response.headers.get("X-Idempotency-Replayed") !== "true") {
      scheduleGmAdminAudit({ action: "공방 강화 제작 취소", actor: { id: auth.session.id, displayName: auth.session.displayName, role: auth.session.role }, summary: note, target: `${current.characterCodename} · ${current.equipmentName ?? current.kind}`, timestamp: new Date() });
      after(() => notifyUser({ userId: current.userId, type: "SYSTEM", title: "공방 강화 제작이 취소되었습니다", message: `${current.characterCodename} · ${note} · 비용과 물품 반환`, link: "/erp/equipment-shop/custom" }).catch((error) => console.error("[equipment-workshop] cancel notification failed", error)));
    }
    return response;
  } catch (error) {
    if (error instanceof WorkshopOperationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "REQUEST_NOT_FOUND" ? 404 : 409 });
    console.error("[equipment-workshop] admin cancellation failed", error);
    return NextResponse.json({ error: "공방 취소를 처리하지 못했습니다. 서버 로그를 확인해 주세요." }, { status: 500 });
  }
}
