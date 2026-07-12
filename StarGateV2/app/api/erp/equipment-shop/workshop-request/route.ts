import { NextResponse, after } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { listCharacterInventoryEntries } from "@/lib/db/inventory";
import { listUsers } from "@/lib/db/users";
import { notifyEquipmentWorkshopRequest } from "@/lib/discord";
import {
  getEquipmentWorkshopRequestLabel,
  parseEquipmentWorkshopRequest,
  type EquipmentWorkshopRequestResponse,
} from "@/lib/equipment-shop/workshop-request";
import { notifyUser, notifyUsers } from "@/lib/notifications/events";

export async function POST(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  await Promise.all([
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
  };
  return NextResponse.json(response, { status: 201 });
}
