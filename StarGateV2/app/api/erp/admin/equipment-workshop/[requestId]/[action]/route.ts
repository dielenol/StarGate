import { NextResponse, after } from "next/server";
import { characterInventoryCol, masterItemsCol } from "@stargate/shared-db";
import { ObjectId } from "mongodb";

import { isValidIdempotencyKey, readIdempotencyKey } from "@/lib/api/idempotency";
import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import {
  findEquipmentWorkshopBlueprintById,
} from "@/lib/db/equipment-workshop-blueprints";
import {
  findEquipmentWorkshopRequestById,
  serializeAdminEquipmentWorkshopRequest,
  updateEquipmentWorkshopQuote,
} from "@/lib/db/equipment-workshop-requests";
import {
  buildEquipmentWorkshopResultTags,
  parseEquipmentWorkshopQuote,
  resolveEquipmentWorkshopSpecialist,
} from "@/lib/equipment-shop/workshop-request";
import {
  approveWorkshopReloadInTransaction,
  cancelWorkshopInTransaction,
  prepareWorkshopReloadLocks,
  prepareWorkshopOperationLocks,
  WorkshopOperationError,
} from "@/lib/equipment-shop/workshop-operations";
import { notifyUser } from "@/lib/notifications/events";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { findShopItemBySlug } from "@/lib/shop/catalog";

interface RouteContext {
  params: Promise<{ requestId: string; action: string }>;
}

function procurementUnitPrice(item: {
  slug?: string;
  price: number | string;
}): number | null {
  const shopPrice = item.slug ? findShopItemBySlug(item.slug)?.price : undefined;
  const numeric = shopPrice ?? Number(item.price);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(numeric.toFixed(2));
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
  if (current.kind === "reload") return NextResponse.json({ error: "재장전 요청에는 제작 견적을 발행할 수 없습니다." }, { status: 400 });
  if (current.kind === "upgrade" && !current.inventoryEntryId) return NextResponse.json({ error: "강화 대상 인벤토리 정보가 없습니다." }, { status: 409 });
  if (!["IN_REVIEW", "APPROVED", "QUOTED"].includes(current.status)) return NextResponse.json({ error: "먼저 요청 검토를 시작한 뒤 견적을 발행해 주세요." }, { status: 409 });
  if (validation.input.expectedVersion !== (current.quote?.version ?? 0)) return NextResponse.json({ error: "다른 운영자가 견적을 먼저 수정했습니다.", code: "QUOTE_CHANGED" }, { status: 409 });

  let referencedBlueprint: Awaited<
    ReturnType<typeof findEquipmentWorkshopBlueprintById>
  > = null;
  if (validation.input.blueprintRef) {
    referencedBlueprint = await findEquipmentWorkshopBlueprintById(
      validation.input.blueprintRef.id,
    );
    if (
      !referencedBlueprint ||
      referencedBlueprint.status !== "DRAFT" ||
      referencedBlueprint.slug !== validation.input.blueprintRef.slug ||
      referencedBlueprint.version !== validation.input.blueprintRef.version
    ) {
      return NextResponse.json(
        { error: "선택한 설계안이 수정되었거나 보관되었습니다.", code: "BLUEPRINT_CHANGED" },
        { status: 409 },
      );
    }
  }

  let sourceItemId = current.sourceItemId;
  let sourceSlot = current.sourceSlot;
  if (current.kind === "upgrade" && (!sourceItemId || !sourceSlot)) {
    if (!current.inventoryEntryId || !ObjectId.isValid(current.inventoryEntryId)) {
      return NextResponse.json({ error: "강화 대상 인벤토리 식별자가 올바르지 않습니다." }, { status: 409 });
    }
    const sourceEntry = await (await characterInventoryCol()).findOne({
      _id: new ObjectId(current.inventoryEntryId),
      characterId: current.characterId,
      equippedSlot: { $in: ["WEAPON", "ARMOR"] },
      quantity: { $gte: 1 },
    });
    if (!sourceEntry?.equippedSlot) {
      return NextResponse.json({ error: "접수된 강화 대상 장비가 더 이상 장착되어 있지 않습니다.", code: "SOURCE_ITEM_CHANGED" }, { status: 409 });
    }
    sourceItemId = sourceEntry.itemId;
    sourceSlot = sourceEntry.equippedSlot;
  }

  const materialIds = validation.input.materials
    .map((material) => material.itemId)
    .filter((id): id is string => Boolean(id));
  const materialSlugs = validation.input.materials
    .map((material) => material.slug)
    .filter((slug): slug is string => Boolean(slug));
  const ids = [
    ...(sourceItemId ? [sourceItemId] : []),
    ...materialIds,
  ];
  if (ids.some((id) => !ObjectId.isValid(id))) {
    return NextResponse.json(
      { error: "원본 장비 또는 재료 식별자가 올바르지 않습니다." },
      { status: 409 },
    );
  }
  const items = await masterItemsCol();
  const lookupClauses = [
      ...(ids.length > 0
        ? [{ _id: { $in: ids.map((id) => new ObjectId(id)) } }]
        : []),
      ...(materialSlugs.length > 0
        ? [{ slug: { $in: materialSlugs } }]
        : []),
    ];
  const masters = lookupClauses.length > 0
    ? await items.find({ $or: lookupClauses }).toArray()
    : [];
  const byId = new Map(masters.map((item) => [String(item._id), item]));
  const bySlug = new Map(
    masters
      .filter((item): item is typeof item & { slug: string } => Boolean(item.slug))
      .map((item) => [item.slug, item]),
  );
  const source = sourceItemId ? byId.get(sourceItemId) : undefined;
  if (
    current.kind === "upgrade" &&
    (!source ||
      !sourceSlot ||
      (source.category !== "WEAPON" && source.category !== "ARMOR") ||
      (current.sourceCategory !== undefined && source.category !== current.sourceCategory) ||
      source.category !== sourceSlot)
  ) {
    return NextResponse.json({ error: "원본 마스터 장비 분류가 접수 시점과 다릅니다.", code: "SOURCE_ITEM_CHANGED" }, { status: 409 });
  }

  const resultCategory = current.kind === "upgrade"
    ? sourceSlot
    : validation.input.result.category;
  if (resultCategory !== "WEAPON" && resultCategory !== "ARMOR") {
    return NextResponse.json({ error: "신규 제작 결과 장비 분류를 선택해 주세요." }, { status: 400 });
  }
  if (current.kind === "upgrade" && validation.input.result.category && validation.input.result.category !== resultCategory) {
    return NextResponse.json({ error: "강화 결과 장비 분류는 원본 장착 슬롯과 같아야 합니다." }, { status: 400 });
  }
  if (referencedBlueprint) {
    const sourceSlugMatches =
      referencedBlueprint.applicability.sourceSlugs.length === 0 ||
      Boolean(source?.slug && referencedBlueprint.applicability.sourceSlugs.includes(source.slug));
    const sourceCategoryMatches =
      referencedBlueprint.applicability.sourceCategories.length === 0 ||
      Boolean(source?.category && referencedBlueprint.applicability.sourceCategories.includes(source.category as "WEAPON" | "ARMOR"));
    if (
      !referencedBlueprint.applicability.kinds.includes(current.kind) ||
      !sourceSlugMatches ||
      !sourceCategoryMatches ||
      referencedBlueprint.applicability.resultCategory !== resultCategory
    ) {
      return NextResponse.json(
        { error: "선택한 설계안은 이 요청 또는 원본 장비와 호환되지 않습니다.", code: "BLUEPRINT_INCOMPATIBLE" },
        { status: 400 },
      );
    }
  }

  const resolvedMaterials = validation.input.materials.map((material) => ({
    input: material,
    item: material.slug ? bySlug.get(material.slug) : byId.get(material.itemId ?? ""),
  }));
  if (
    resolvedMaterials.some(
      ({ item }) => !item || item.isPublic === false || !item.slug,
    )
  ) {
    return NextResponse.json({ error: "등록되지 않았거나 비공개인 재료가 포함되어 있습니다." }, { status: 400 });
  }
  if (
    sourceItemId &&
    resolvedMaterials.some(({ item }) => String(item?._id) === sourceItemId)
  ) {
    return NextResponse.json({ error: "강화 대상 장비를 재료로 지정할 수 없습니다." }, { status: 400 });
  }
  const incompatibleSpecialMaterial = resolvedMaterials.find(({ item }) => (
    (item?.slug === "force_core" && validation.input.modificationDomain !== "ENERGY_EXPLOSIVE_OUTPUT") ||
    (item?.slug === "vf_blood" && validation.input.modificationDomain !== "BIO_REGEN_REPAIR")
  ));
  if (incompatibleSpecialMaterial) {
    return NextResponse.json(
      {
        error: incompatibleSpecialMaterial.item?.slug === "force_core"
          ? "포스코어는 에너지장·폭발·출력 계통 개조에만 사용할 수 있습니다."
          : "VF혈액팩은 생체 접속·재생·자기수복 계통 개조에만 사용할 수 있습니다.",
      },
      { status: 400 },
    );
  }
  const materials = resolvedMaterials.map(({ input: material, item }) => {
    if (!item) return null;
    const unitPrice = procurementUnitPrice(item);
    if (unitPrice === null) return null;
    return {
      itemId: String(item._id),
      slug: item.slug,
      itemName: item.name,
      category: item.category,
      quantity: material.quantity,
      unitPrice,
      subtotal: Number((unitPrice * material.quantity).toFixed(2)),
    };
  });
  if (materials.some((item) => item === null)) {
    return NextResponse.json(
      { error: "재료의 현재 조달가가 올바르지 않아 견적을 발행할 수 없습니다." },
      { status: 409 },
    );
  }

  const specialistCodename = validation.input.specialistWorkflow?.[0]?.specialistCodename
    ?? validation.input.specialistCodename
    ?? resolveEquipmentWorkshopSpecialist({
      category: source?.category ?? resultCategory,
      tags: source?.tags,
    });
  const specialistWorkflow = validation.input.specialistWorkflow ?? [
    { specialistCodename, task: "주 담당" },
  ];
  const materialCost = materials.reduce(
    (total, item) => total + (item?.subtotal ?? 0),
    0,
  );
  const totalCost = Number((materialCost + validation.input.creditCost).toFixed(2));
  const resultItemId = current.quote?.result.itemId ?? new ObjectId().toHexString();
  const generation = current.kind === "upgrade"
    ? (source?.workshop?.generation ?? 0) + 1
    : 1;
  const now = new Date();
  const quote = {
    version: validation.input.expectedVersion + 1,
    creditCost: validation.input.creditCost,
    durationMinutes: validation.input.durationMinutes,
    specialistCodename,
    specialistWorkflow,
    ...(validation.input.specialistNote
      ? { specialistNote: validation.input.specialistNote }
      : {}),
    modificationDomain: validation.input.modificationDomain,
    materials: materials.filter((item): item is NonNullable<typeof item> => item !== null),
    materialCost,
    totalCost,
    ...(validation.input.blueprintRef
      ? { blueprintRef: validation.input.blueprintRef }
      : {}),
    result: {
      itemId: resultItemId,
      slug: `workshop-${resultItemId}`,
      name: validation.input.result.name,
      description: validation.input.result.description,
      category: resultCategory,
      ...(validation.input.result.damage ? { damage: validation.input.result.damage } : {}),
      ...(validation.input.result.effect ? { effect: validation.input.result.effect } : {}),
      tags: buildEquipmentWorkshopResultTags({
        tags: validation.input.result.tags ?? [],
        kind: current.kind,
        specialistWorkflow,
        characterCodename: current.characterCodename,
      }),
      ...(validation.input.result.previewImage ? { previewImage: validation.input.result.previewImage } : {}),
      ...(validation.input.result.equipmentAction
        ? { equipmentAction: validation.input.result.equipmentAction }
        : {}),
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
    ...(current.kind === "upgrade" && source && sourceItemId && sourceSlot
      ? {
          sourceSnapshot: {
            sourceItemId,
            sourceCategory: source.category,
            sourceSlot,
            ...(source.damage ? { sourceDamage: source.damage } : {}),
            ...(source.previewImage ? { sourcePreviewImage: source.previewImage } : {}),
          },
        }
      : {}),
    actorId: auth.session.id,
    actorName: auth.session.displayName,
  });
  if (!updated) return NextResponse.json({ error: "다른 운영자가 요청 또는 견적 상태를 변경했습니다." }, { status: 409 });
  scheduleGmAdminAudit({
    action: `공방 ${current.kind === "upgrade" ? "강화" : "신규 제작"} 견적 발행`,
    actor: { id: auth.session.id, displayName: auth.session.displayName, role: auth.session.role },
    summary: `총 ${quote.totalCost.toLocaleString()} CR · 공임 ${quote.creditCost.toLocaleString()} CR · ${quote.durationMinutes}분 · v${quote.version}`,
    target: `${updated.characterCodename} · ${updated.equipmentName ?? quote.result.name}`,
    timestamp: now,
  });
  after(() => notifyUser({ userId: updated.userId, type: "SYSTEM", title: `공방 ${current.kind === "upgrade" ? "강화" : "제작"} 견적이 도착했습니다`, message: `${updated.characterCodename} · ${quote.result.name} · 총부담 ${quote.totalCost.toLocaleString()} CR · ${specialistWorkflow.map((step) => step.specialistCodename).join(" → ")}`, link: "/erp/equipment-shop/custom" }).catch((error) => console.error("[equipment-workshop] quote notification failed", error)));
  return NextResponse.json({ request: serializeAdminEquipmentWorkshopRequest(updated) });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireGm();
  if ("response" in auth) return auth.response;
  const { requestId, action } = await context.params;
  if (
    !isValidIdempotencyKey(requestId) ||
    !["cancel", "approve-reload"].includes(action)
  ) {
    return NextResponse.json({ error: "잘못된 공방 운영 경로입니다." }, { status: 400 });
  }
  const operationId = readIdempotencyKey(request);
  if (!operationId) return NextResponse.json({ error: "유효한 Idempotency-Key 헤더가 필요합니다." }, { status: 400 });
  const current = await findEquipmentWorkshopRequestById(requestId);
  if (!current) return NextResponse.json({ error: "공방 요청을 찾을 수 없습니다." }, { status: 404 });

  if (action === "approve-reload") {
    try {
      await prepareWorkshopReloadLocks(current);
      const response = await executeEconomicOperation({
        requestId: operationId,
        domain: "equipment-workshop-reload",
        actorId: auth.session.id,
        payload: { workshopRequestId: requestId },
        run: async (mongoSession) => {
          const updated = await approveWorkshopReloadInTransaction({
            requestId,
            actorId: auth.session.id,
            actorName: auth.session.displayName,
            session: mongoSession,
          });
          return {
            status: 200,
            body: { request: serializeAdminEquipmentWorkshopRequest(updated) },
          };
        },
      });
      if (response.ok && response.headers.get("X-Idempotency-Replayed") !== "true") {
        scheduleGmAdminAudit({
          action: "공방 재장전 관료 결재 승인",
          actor: {
            id: auth.session.id,
            displayName: auth.session.displayName,
            role: auth.session.role,
          },
          summary: `${current.reload?.creditCost.toLocaleString() ?? "0"} CR · ${current.reload?.actionCode ?? "장비 액션"}`,
          target: `${current.characterCodename} · ${current.equipmentName ?? "장비"}`,
          timestamp: new Date(),
        });
        after(() => notifyUser({
          userId: current.userId,
          type: "SYSTEM",
          title: "공방 재장전 결재가 승인되었습니다",
          message: `${current.characterCodename} · ${current.equipmentName ?? "장비"} · ${current.reload?.actionCode ?? "장비 액션"} 충전 복구`,
          link: "/erp/equipment-shop/custom",
        }).catch((error) => console.error("[equipment-workshop] reload notification failed", error)));
      }
      return response;
    } catch (error) {
      if (error instanceof WorkshopOperationError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.code === "REQUEST_NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 409 },
        );
      }
      if (error instanceof Error && error.message.includes("음수 잔액")) {
        return NextResponse.json(
          { error: "재장전 비용을 결제할 잔액이 부족합니다.", code: "INSUFFICIENT_BALANCE" },
          { status: 400 },
        );
      }
      console.error("[equipment-workshop] reload approval failed", error);
      return NextResponse.json({ error: "재장전 결재를 처리하지 못했습니다." }, { status: 500 });
    }
  }

  const body = (await request.json().catch(() => null)) as { note?: unknown } | null;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note || note.length > 1000) return NextResponse.json({ error: "취소 사유를 1~1000자로 입력해 주세요." }, { status: 400 });
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
      scheduleGmAdminAudit({ action: `공방 ${current.kind === "upgrade" ? "강화" : "신규 제작"} 취소`, actor: { id: auth.session.id, displayName: auth.session.displayName, role: auth.session.role }, summary: note, target: `${current.characterCodename} · ${current.equipmentName ?? current.kind}`, timestamp: new Date() });
      after(() => notifyUser({ userId: current.userId, type: "SYSTEM", title: `공방 ${current.kind === "upgrade" ? "강화" : "제작"}이 취소되었습니다`, message: `${current.characterCodename} · ${note} · 비용과 물품 반환`, link: "/erp/equipment-shop/custom" }).catch((error) => console.error("[equipment-workshop] cancel notification failed", error)));
    }
    return response;
  } catch (error) {
    if (error instanceof WorkshopOperationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "REQUEST_NOT_FOUND" ? 404 : 409 });
    console.error("[equipment-workshop] admin cancellation failed", error);
    return NextResponse.json({ error: "공방 취소를 처리하지 못했습니다. 서버 로그를 확인해 주세요." }, { status: 500 });
  }
}
