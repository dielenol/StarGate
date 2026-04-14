import { NextResponse } from "next/server";

import type { CreateInventoryInput } from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { listCharacterInventory, addToInventory } from "@/lib/db/inventory";
import { findCharacterById } from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { characterId } = await params;
  if (!isValidObjectId(characterId)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  try {
    const inventory = await listCharacterInventory(characterId);
    return NextResponse.json({ inventory });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "인벤토리 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { characterId } = await params;
  if (!isValidObjectId(characterId)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  const character = await findCharacterById(characterId);
  if (!character) {
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const body = (await request.json()) as Partial<CreateInventoryInput>;

  if (!body.itemId?.trim() || !body.itemName?.trim()) {
    return NextResponse.json(
      { error: "itemId와 itemName은 필수입니다." },
      { status: 400 },
    );
  }

  if (typeof body.quantity !== "number" || body.quantity < 1) {
    return NextResponse.json(
      { error: "quantity는 1 이상이어야 합니다." },
      { status: 400 },
    );
  }

  try {
    const entry = await addToInventory({
      characterId,
      characterCodename: character.codename,
      itemId: body.itemId,
      itemName: body.itemName,
      quantity: body.quantity,
      acquiredAt: new Date(),
      note: body.note ?? "",
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "아이템 지급 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
