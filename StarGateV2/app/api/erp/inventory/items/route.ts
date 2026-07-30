import { NextResponse } from "next/server";
import { getClient } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import { createMasterItem, listVisibleMasterItems } from "@/lib/db/inventory";
import { equipmentShopItemZone } from "@/lib/equipment-shop/catalog";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { enqueueShopProductLaunchWebhook } from "@/lib/outbox/integration";
import { findShopItemBySlug } from "@/lib/shop/catalog";
import {
  normalizeCatalogItemCreateBody,
  shouldAnnounceShopProductLaunch,
} from "@/lib/shop/catalog-item-input";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await listVisibleMasterItems({
      userId: session.user.id,
      includePrivate: hasRole(session.user.role, "V"),
    });
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

  const body = await request.json().catch(() => null);
  const normalized = normalizeCatalogItemCreateBody(body);
  if (!normalized.ok) {
    return NextResponse.json(
      { error: normalized.error },
      { status: 400 },
    );
  }

  const armoryZone = equipmentShopItemZone({
    category: normalized.value.input.category,
    slug: normalized.value.input.slug,
    tags: normalized.value.input.tags,
  });
  if (armoryZone && normalized.value.target !== "armory") {
    return NextResponse.json(
      {
        error:
          "병기부 품목은 target과 armoryZone을 명시해 운영 카탈로그 검증을 통과해야 합니다.",
        code: "ARMORY_TARGET_REQUIRED",
      },
      { status: 400 },
    );
  }
  const requiresGm = Boolean(normalized.value.target || armoryZone);
  if (requiresGm) {
    try {
      requireRole(session.user.role, "GM");
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (
    normalized.value.input.slug &&
    findShopItemBySlug(normalized.value.input.slug)
  ) {
    return NextResponse.json(
      {
        error:
          "기본 편의점 품목 slug는 운영 화면에서 다시 등록할 수 없습니다.",
        code: "STATIC_SHOP_SLUG_RESERVED",
      },
      { status: 409 },
    );
  }

  try {
    const timestamp = new Date();
    const auditPayload = {
      action: "마스터 아이템 생성",
      actor: {
        id: session.user.id,
        displayName: session.user.displayName,
        role: session.user.role,
      },
      summary: `${normalized.value.input.category} · ${normalized.value.input.isAvailable === false ? "지급 불가" : "지급 가능"}`,
      target: `${normalized.value.input.name} (${normalized.value.input.slug ?? "slug 없음"})`,
      timestamp,
    } as const;
    const shopLaunchPayload =
      shouldAnnounceShopProductLaunch(normalized.value) &&
      normalized.value.input.slug &&
      normalized.value.input.shopMeta &&
      typeof normalized.value.input.price === "number"
        ? {
            item: {
              slug: normalized.value.input.slug,
              name: normalized.value.input.name,
              icon: normalized.value.input.shopMeta.icon ?? "◈",
              price: normalized.value.input.price,
              pageGroup:
                normalized.value.input.shopMeta.pageGroup ?? "BASIC",
              description: normalized.value.input.description,
              ...(normalized.value.input.effect
                ? { effect: normalized.value.input.effect }
                : {}),
              ...(normalized.value.input.previewImage
                ? { previewImage: normalized.value.input.previewImage }
                : {}),
            },
            launchedAt: timestamp,
          }
        : null;

    let item;
    if (session.user.role === "GM") {
      const client = await getClient();
      const mongoSession = client.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          const createdItem = await createMasterItem(normalized.value.input, {
            session: mongoSession,
          });
          item = createdItem;
          await scheduleGmAdminAudit(auditPayload, {
            session: mongoSession,
          });
          if (shopLaunchPayload) {
            if (!createdItem._id) {
              throw new Error(
                "신제품 출시 알림 식별자를 생성하지 못했습니다.",
              );
            }
            await enqueueShopProductLaunchWebhook(
              shopLaunchPayload,
              `shop-product-launch:${createdItem._id.toHexString()}`,
              { session: mongoSession },
            );
          }
        });
      } finally {
        await mongoSession.endSession();
      }
    } else {
      item = await createMasterItem(normalized.value.input);
    }

    if (!item) {
      throw new Error("마스터 아이템 생성이 완료되지 않았습니다.");
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return NextResponse.json(
        {
          error: "이미 사용 중인 slug입니다. 다른 slug를 입력하세요.",
          code: "ITEM_SLUG_EXISTS",
        },
        { status: 409 },
      );
    }
    const message =
      err instanceof Error ? err.message : "아이템 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
