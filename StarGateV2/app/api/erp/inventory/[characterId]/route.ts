import { NextResponse } from "next/server";

import type { CreateInventoryInput } from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import {
  addToInventory,
  findMasterItemById,
  listCharacterInventory,
} from "@/lib/db/inventory";
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
    requireRole(session.user.role, "V");
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

  // itemId 형식 검증 — ObjectId 가 아니면 400. master_items _id 는 ObjectId.
  if (!body.itemId?.trim() || !isValidObjectId(body.itemId)) {
    return NextResponse.json(
      { error: "itemId가 올바른 ObjectId 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (typeof body.quantity !== "number" || body.quantity < 1) {
    return NextResponse.json(
      { error: "quantity는 1 이상이어야 합니다." },
      { status: 400 },
    );
  }

  // master 실재성 + 가용성 검증 — 클라이언트가 임의 itemId/itemName 으로 인벤토리를
  // 오염시키지 못하도록 서버에서 master 를 한 번 더 끌어와 기준값으로 사용한다.
  const masterItem = await findMasterItemById(body.itemId);
  if (!masterItem) {
    return NextResponse.json(
      { error: "마스터 아이템을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (masterItem.isAvailable === false) {
    return NextResponse.json(
      { error: "현재 지급 불가 상태인 아이템입니다." },
      { status: 400 },
    );
  }

  try {
    const entry = await addToInventory({
      characterId,
      characterCodename: character.codename,
      itemId: body.itemId,
      // itemName 은 클라이언트 입력 무시 — master 의 정식 명칭만 사용.
      itemName: masterItem.name,
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
