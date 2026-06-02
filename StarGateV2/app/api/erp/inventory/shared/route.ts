import { NextResponse } from "next/server";

import type { CreateSharedInventoryInput } from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  addToSharedInventory,
  findMasterItemById,
  listSharedInventory,
  SHARED_INVENTORY_SCOPE,
} from "@/lib/db/inventory";
import { isValidObjectId } from "@/lib/db/utils";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const inventory = await listSharedInventory();
    return NextResponse.json({ inventory });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "공용 인벤토리 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "V");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Partial<CreateSharedInventoryInput>;

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

  const masterItem = await findMasterItemById(body.itemId);
  if (!masterItem) {
    return NextResponse.json(
      { error: "마스터 아이템을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (masterItem.isAvailable === false) {
    return NextResponse.json(
      { error: "현재 지급 불가 상태의 아이템입니다." },
      { status: 400 },
    );
  }

  try {
    const entry = await addToSharedInventory({
      scope: SHARED_INVENTORY_SCOPE,
      itemId: body.itemId,
      itemName: masterItem.name,
      quantity: body.quantity,
      acquiredAt: new Date(),
      note: body.note ?? "",
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "공용 인벤토리 지급 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
