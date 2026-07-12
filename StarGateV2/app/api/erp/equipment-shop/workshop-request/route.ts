import { NextResponse, after } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import {
  findEquipmentWorkshopRequestById,
  insertEquipmentWorkshopRequest,
  listActiveEquipmentWorkshopRequests,
  listEquipmentWorkshopRequests,
  serializeEquipmentWorkshopRequest,
  updateEquipmentWorkshopRequestStatus,
  type EquipmentWorkshopRequestDoc,
} from "@/lib/db/equipment-workshop-requests";
import { getEquipmentResearchCapabilities } from "@/lib/db/equipment-research";
import { listCharacterInventoryEntries } from "@/lib/db/inventory";
import { listUsers } from "@/lib/db/users";
import { notifyEquipmentWorkshopRequest } from "@/lib/discord";
import {
  canTransitionEquipmentWorkshopRequestStatus,
  getEquipmentWorkshopRequestLabel,
  isEquipmentWorkshopRequestStatus,
  isSameEquipmentWorkshopRequestPayload,
  parseEquipmentWorkshopRequest,
  requiresEquipmentWorkshopOperatorNote,
  type EquipmentWorkshopRequestResponse,
} from "@/lib/equipment-shop/workshop-request";
import { notifyUser, notifyUsers } from "@/lib/notifications/events";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

interface UpdateWorkshopRequestBody {
  requestId?: unknown;
  status?: unknown;
  operatorNote?: unknown;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function GET() {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isGM = hasRole(session.user.role, "GM");
  const requests = isGM
    ? await Promise.all([
        listActiveEquipmentWorkshopRequests(),
        listEquipmentWorkshopRequests({ limit: 30 }),
      ]).then(([active, recent]) => [
        ...active,
        ...recent.filter(
          (request) => !active.some((entry) => entry._id === request._id),
        ),
      ])
    : await listEquipmentWorkshopRequests({ userId: session.user.id });
  return NextResponse.json(
    { requests: requests.map(serializeEquipmentWorkshopRequest) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다." },
      { status: 400 },
    );
  }

  const validation = parseEquipmentWorkshopRequest(
    await request.json().catch(() => null),
  );
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const mainCharacter = await findMainCharacterByOwner(session.user.id);
  if (!mainCharacter || mainCharacter.type !== "AGENT") {
    return NextResponse.json(
      { error: "메인 AGENT가 없어 공방 요청을 접수할 수 없습니다." },
      { status: 400 },
    );
  }

  if (
    validation.input.kind === "custom" &&
    !hasRole(session.user.role, "GM")
  ) {
    const capabilities = await getEquipmentResearchCapabilities(
      String(mainCharacter._id),
    );
    if (!capabilities.customWeaponSlot) {
      return NextResponse.json(
        {
          error: "전용무기 설계 슬롯 연구를 완료해야 제작 의뢰를 보낼 수 있습니다.",
          code: "CUSTOM_WEAPON_SLOT_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  let equipmentName: string | undefined;
  if (validation.input.kind === "upgrade") {
    const { entries } = await listCharacterInventoryEntries(
      String(mainCharacter._id),
    );
    const equippedEntry = entries.find(
      (entry) =>
        entry._id === validation.input.inventoryEntryId &&
        Boolean(entry.equippedSlot),
    );
    if (!equippedEntry) {
      return NextResponse.json(
        { error: "현재 장착 중인 장비만 강화 문의를 보낼 수 있습니다." },
        { status: 400 },
      );
    }
    equipmentName = equippedEntry.itemName;
  }

  const characterId = String(mainCharacter._id);
  const requestLabel = getEquipmentWorkshopRequestLabel(validation.input.kind);
  const requesterName =
    session.user.displayName ||
    session.user.username ||
    `user-${session.user.id.slice(0, 6)}`;
  const operatorMessage = [
    mainCharacter.codename,
    equipmentName,
    requesterName,
    validation.input.details,
  ]
    .filter(Boolean)
    .join(" · ");
  const users = await listUsers();
  const operators = users.filter(
    (user) =>
      user.status === "ACTIVE" &&
      user.role === "GM" &&
      user._id !== session.user.id,
  );

  const now = new Date();
  const requestDoc: EquipmentWorkshopRequestDoc = {
    _id: requestId,
    kind: validation.input.kind,
    userId: session.user.id,
    userName: requesterName,
    characterId,
    characterCodename: mainCharacter.codename,
    ...(validation.input.kind === "upgrade"
      ? { inventoryEntryId: validation.input.inventoryEntryId }
      : {}),
    ...(equipmentName ? { equipmentName } : {}),
    details: validation.input.details,
    status: "REQUESTED",
    createdAt: now,
    updatedAt: now,
    history: [
      {
        status: "REQUESTED",
        at: now,
        actorId: session.user.id,
        actorName: requesterName,
      },
    ],
  };

  try {
    await insertEquipmentWorkshopRequest(requestDoc);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await findEquipmentWorkshopRequestById(requestId);
    if (!existing || existing.userId !== session.user.id) throw error;
    if (!isSameEquipmentWorkshopRequestPayload(existing, requestDoc)) {
      return NextResponse.json(
        { error: "동일 요청 식별자가 다른 공방 요청에 사용되었습니다." },
        { status: 409 },
      );
    }
    const response: EquipmentWorkshopRequestResponse = {
      ok: true,
      kind: existing.kind,
      message: "이미 접수된 공방 요청입니다.",
      request: serializeEquipmentWorkshopRequest(existing),
    };
    return NextResponse.json(response);
  }

  const notificationResults = await Promise.allSettled([
    notifyUsers(
      operators.map((user) => ({
        userId: user._id,
        type: "SYSTEM" as const,
        title: `공방 ${requestLabel}`,
        message: operatorMessage,
        link: `/erp/characters/${characterId}`,
      })),
    ),
    notifyUser({
      userId: session.user.id,
      type: "SYSTEM",
      title: `공방 ${requestLabel} 접수`,
      message: [mainCharacter.codename, equipmentName, "운영자 확인 대기"]
        .filter(Boolean)
        .join(" · "),
      link: "/erp/equipment-shop/custom",
    }),
  ]);
  for (const result of notificationResults) {
    if (result.status === "rejected") {
      console.error("[equipment-workshop] intake notification failed", result.reason);
    }
  }

  after(() =>
    notifyEquipmentWorkshopRequest({
      kind: validation.input.kind,
      character: {
        id: characterId,
        codename: mainCharacter.codename,
        name: mainCharacter.lore.name,
      },
      requester: {
        id: session.user.id,
        displayName: requesterName,
      },
      details: validation.input.details,
      ...(equipmentName ? { equipmentName } : {}),
      timestamp: new Date(),
    }),
  );

  const response: EquipmentWorkshopRequestResponse = {
    ok: true,
    kind: validation.input.kind,
    message: `${requestLabel}가 접수되었습니다.`,
    request: serializeEquipmentWorkshopRequest(requestDoc),
  };
  return NextResponse.json(response, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasRole(session.user.role, "GM")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | UpdateWorkshopRequestBody
    | null;
  const requestId =
    typeof body?.requestId === "string" ? body.requestId.trim() : "";
  const operatorNote =
    typeof body?.operatorNote === "string" ? body.operatorNote.trim() : "";
  if (
    !requestId ||
    !isEquipmentWorkshopRequestStatus(body?.status) ||
    operatorNote.length > 1000
  ) {
    return NextResponse.json(
      { error: "요청 ID, 상태 또는 운영자 메모가 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (requiresEquipmentWorkshopOperatorNote(body.status) && !operatorNote) {
    return NextResponse.json(
      { error: "반려 또는 완료 처리에는 운영자 메모가 필요합니다." },
      { status: 400 },
    );
  }

  const existing = await findEquipmentWorkshopRequestById(requestId);
  if (!existing) {
    return NextResponse.json(
      { error: "공방 요청을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (!canTransitionEquipmentWorkshopRequestStatus(existing.status, body.status)) {
    return NextResponse.json(
      { error: "현재 상태에서 요청한 상태로 변경할 수 없습니다." },
      { status: 409 },
    );
  }

  const updated = await updateEquipmentWorkshopRequestStatus({
    requestId,
    currentStatus: existing.status,
    status: body.status,
    ...(operatorNote ? { operatorNote } : {}),
    reviewedById: session.user.id,
    reviewedByName: session.user.displayName,
  });
  if (!updated) {
    return NextResponse.json(
      { error: "다른 운영자가 먼저 요청 상태를 변경했습니다." },
      { status: 409 },
    );
  }

  await notifyUser({
    userId: updated.userId,
    type: "SYSTEM",
    title: "공방 요청 상태가 변경되었습니다",
    message: [
      updated.characterCodename,
      updated.equipmentName,
      updated.status,
      updated.operatorNote,
    ]
      .filter(Boolean)
      .join(" · "),
    link: "/erp/equipment-shop/custom",
  }).catch((error) => {
    console.error("[equipment-workshop] status notification failed", error);
  });
  scheduleGmAdminAudit({
    action: "공방 요청 상태 변경",
    actor: {
      id: session.user.id,
      displayName: session.user.displayName,
      role: session.user.role,
    },
    summary: `${existing.status} → ${updated.status}`,
    target: `${updated.characterCodename} · ${updated.equipmentName ?? updated.kind}`,
    details: updated.operatorNote
      ? [{ name: "운영자 메모", value: updated.operatorNote }]
      : undefined,
    timestamp: new Date(),
  });

  return NextResponse.json({
    request: serializeEquipmentWorkshopRequest(updated),
  });
}
