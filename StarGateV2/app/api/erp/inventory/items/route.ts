import { NextResponse } from "next/server";
import { ITEM_CATEGORIES } from "@stargate/shared-db";

import type { CreateMasterItemInput, ItemCategory } from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { listMasterItems, createMasterItem } from "@/lib/db/inventory";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

function isItemCategory(value: unknown): value is ItemCategory {
  return (
    typeof value === "string" &&
    (ITEM_CATEGORIES as readonly string[]).includes(value)
  );
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

function normalizeLore(value: unknown): CreateMasterItemInput["lore"] {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const lore = {
    background: trimOptional(raw.background),
    acquisition: trimOptional(raw.acquisition),
    notes: trimOptional(raw.notes),
  };
  return lore.background || lore.acquisition || lore.notes ? lore : undefined;
}

function normalizePrice(value: unknown): number | string {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  return 0;
}

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
          "Cache-Control": "private, max-age=1800, stale-while-revalidate=3600",
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

  if (!isItemCategory(body.category)) {
    return NextResponse.json(
      { error: "유효한 category를 선택하세요." },
      { status: 400 },
    );
  }

  try {
    const item = await createMasterItem({
      slug: trimOptional(body.slug),
      name: body.name.trim(),
      category: body.category,
      description: trimOptional(body.description) ?? "",
      price: normalizePrice(body.price),
      damage: trimOptional(body.damage),
      effect: trimOptional(body.effect),
      tags: normalizeTags(body.tags),
      previewImage: trimOptional(body.previewImage),
      isAvailable: body.isAvailable ?? true,
      isPublic: body.isPublic ?? true,
      lore: normalizeLore(body.lore),
      loreMd: trimOptional(body.loreMd),
      source: body.source ?? "manual",
      authorId: trimOptional(body.authorId),
      authorName: trimOptional(body.authorName),
    });

    scheduleGmAdminAudit({
      action: "마스터 아이템 생성",
      actor: {
        id: session.user.id,
        displayName: session.user.displayName,
        role: session.user.role,
      },
      summary: `${item.category} · ${item.isAvailable === false ? "지급 불가" : "지급 가능"}`,
      target: `${item.name} (${item.slug})`,
      timestamp: new Date(),
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "아이템 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
