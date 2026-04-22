import { NextResponse } from "next/server";

import type { CreateMasterItemInput } from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { listMasterItems, createMasterItem } from "@/lib/db/inventory";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await listMasterItems();
    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": "private, max-age=120, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "아이템 목록 조회 실패";
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

  const body = (await request.json()) as Partial<CreateMasterItemInput>;

  if (!body.name?.trim()) {
    return NextResponse.json(
      { error: "name은 필수입니다." },
      { status: 400 },
    );
  }

  const validCategories = ["WEAPON", "ARMOR", "CONSUMABLE", "MATERIAL", "SPECIAL"];
  if (!body.category || !validCategories.includes(body.category)) {
    return NextResponse.json(
      { error: "유효한 category를 선택하세요." },
      { status: 400 },
    );
  }

  try {
    const item = await createMasterItem({
      name: body.name.trim(),
      category: body.category,
      description: body.description ?? "",
      price: body.price ?? 0,
      damage: body.damage,
      effect: body.effect,
      isAvailable: body.isAvailable ?? true,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "아이템 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
