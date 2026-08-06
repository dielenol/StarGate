/**
 * POST /api/erp/shop/consume — 보유 편의점 아이템 N개 소비.
 *
 * 개인 인벤토리 차감과 소비 결과를 같은 멱등 Mongo transaction에 저장한다.
 * 재시도는 최초 응답을 replay하므로 소다 판정과 차감이 모두 한 번만 확정된다.
 */

import { NextResponse } from "next/server";
import { charactersCol, masterItemsCol, usersCol } from "@stargate/shared-db";
import { ObjectId } from "mongodb";

import { auth } from "@/lib/auth/config";
import {
  isValidIdempotencyKey,
  readIdempotencyKey,
} from "@/lib/api/idempotency";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  findMasterItemBySlug,
  prepareCharacterInventoryItemLocks,
  removeFromInventory,
} from "@/lib/db/inventory";
import { notifyUser } from "@/lib/notifications/events";
import {
  resolveConsumableOutcomes,
  type MrBeastSodaConsumptionOutcome,
} from "@/lib/shop/mrbeast-soda-consumption";
import { findRuntimeShopItemBySlug } from "@/lib/shop/runtime-catalog";

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 1000;

interface ConsumeBody {
  slug?: unknown;
  quantity?: unknown;
  requestId?: unknown;
}

interface ConsumeOperationBody {
  remaining?: number;
  outcomes?: MrBeastSodaConsumptionOutcome[];
  error?: string;
  code?: string;
  committedOwnerId?: string;
  committedCodename?: string;
  committedItemName?: string;
}

function normalizeBodyRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isValidIdempotencyKey(trimmed) ? trimmed : null;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ConsumeBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const rawHeaderRequestId = request.headers.get("Idempotency-Key")?.trim();
  const headerRequestId = readIdempotencyKey(request);
  const bodyRequestId = normalizeBodyRequestId(body.requestId);
  if (
    (rawHeaderRequestId && !headerRequestId) ||
    (body.requestId !== undefined && !bodyRequestId) ||
    (headerRequestId && bodyRequestId && headerRequestId !== bodyRequestId)
  ) {
    return NextResponse.json(
      {
        error: "유효하고 일치하는 Idempotency-Key 또는 requestId가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400 },
    );
  }
  const requestId = headerRequestId ?? bodyRequestId;
  if (!requestId) {
    return NextResponse.json(
      {
        error: "유효한 Idempotency-Key 또는 requestId가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400 },
    );
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const quantity = body.quantity;
  if (!slug) {
    return NextResponse.json(
      { error: "slug는 필수입니다." },
      { status: 400 },
    );
  }
  if (!(await findRuntimeShopItemBySlug(slug))) {
    return NextResponse.json(
      { error: "편의점 카탈로그에 없는 아이템입니다." },
      { status: 400 },
    );
  }
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < MIN_QUANTITY ||
    quantity > MAX_QUANTITY
  ) {
    return NextResponse.json(
      {
        error: `quantity는 ${MIN_QUANTITY}~${MAX_QUANTITY} 사이의 정수여야 합니다.`,
      },
      { status: 400 },
    );
  }

  let mainChar;
  try {
    mainChar = await findMainCharacterByOwner(session.user.id);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "메인 캐릭터 조회 실패 (정합성 위반)";
    return NextResponse.json(
      { error: message, code: "MAIN_CHARACTER_INTEGRITY" },
      { status: 409 },
    );
  }
  if (!mainChar) {
    return NextResponse.json(
      {
        error: "메인 AGENT 캐릭터가 등록되어 있지 않아 사용할 수 없습니다.",
        code: "NO_MAIN_CHARACTER",
      },
      { status: 400 },
    );
  }

  const masterItem = await findMasterItemBySlug(slug);
  if (!masterItem?._id) {
    return NextResponse.json(
      {
        error:
          "마스터 아이템 시드가 없습니다 (운영자에게 seed:shop 실행을 요청하세요).",
      },
      { status: 500 },
    );
  }

  const characterId = String(mainChar._id);
  const itemId = String(masterItem._id);
  try {
    await prepareCharacterInventoryItemLocks(characterId, [itemId]);
    const operation =
      await executeEconomicOperationResult<ConsumeOperationBody>({
        requestId,
        domain: "shop-consume-personal",
        actorId: session.user.id,
        payload: { characterId, itemId, slug, quantity },
        run: async (dbSession) => {
          if (!ObjectId.isValid(session.user.id)) {
            return {
              status: 409,
              body: {
                error: "ACTIVE 사용자의 MAIN AGENT 캐릭터가 필요합니다.",
                code: "MAIN_CHARACTER_CHANGED",
              },
            };
          }

          const characters = await charactersCol();
          const activeUser = await (await usersCol()).findOne(
            { _id: new ObjectId(session.user.id), status: "ACTIVE" },
            { session: dbSession, projection: { _id: 1, role: 1 } },
          );
          const currentMains = await characters
            .find(
              {
                ownerId: session.user.id,
                type: "AGENT",
                $or: [{ tier: "MAIN" }, { tier: { $exists: false } }],
              },
              { session: dbSession },
            )
            .project({ _id: 1, codename: 1, ownerId: 1 })
            .limit(2)
            .toArray();
          let currentMain = currentMains.length === 1 ? currentMains[0] : null;
          if (
            activeUser?.role === "GM" &&
            currentMains.length === 0
          ) {
            const ownedNpcs = await characters
              .find(
                { ownerId: session.user.id, type: "NPC" },
                { session: dbSession },
              )
              .project({ _id: 1, codename: 1, ownerId: 1 })
              .limit(2)
              .toArray();
            currentMain = ownedNpcs.length === 1 ? ownedNpcs[0] : null;
          }
          if (
            !activeUser ||
            currentMains.length > 1 ||
            !currentMain?._id ||
            String(currentMain._id) !== characterId ||
            currentMain.ownerId !== session.user.id
          ) {
            return {
              status: 409,
              body: {
                error:
                  "소비 처리 중 MAIN AGENT 캐릭터 소유권이 변경되었습니다.",
                code: "MAIN_CHARACTER_CHANGED",
              },
            };
          }

          const committedItem = await (await masterItemsCol()).findOne(
            {
              _id: new ObjectId(itemId),
              slug,
              category: "CONSUMABLE",
            },
            {
              session: dbSession,
              projection: { name: 1, slug: 1 },
            },
          );
          if (!committedItem?.slug) {
            return {
              status: 409,
              body: {
                error: "소비 처리 중 편의점 아이템 정보가 변경되었습니다.",
                code: "MASTER_ITEM_CHANGED",
              },
            };
          }

          const { ok, remaining } = await removeFromInventory(
            characterId,
            itemId,
            quantity,
            { session: dbSession },
          );
          if (!ok) {
            return {
              status: 400,
              body: {
                error: "보유한 수량이 부족합니다.",
                code: "INSUFFICIENT_QUANTITY",
              },
            };
          }

          return {
            status: 200,
            body: {
              remaining,
              outcomes: resolveConsumableOutcomes(
                committedItem.slug,
                quantity,
              ),
              committedOwnerId: currentMain.ownerId,
              committedCodename: currentMain.codename,
              committedItemName: committedItem.name,
            },
          };
        },
      });

    const headers = operation.replayed
      ? { "X-Idempotency-Replayed": "true" }
      : undefined;
    if (
      operation.status === 200 &&
      operation.body.remaining !== undefined &&
      operation.body.committedOwnerId &&
      operation.body.committedCodename &&
      operation.body.committedItemName &&
      !operation.replayed
    ) {
      await notifyUser({
        userId: operation.body.committedOwnerId,
        type: "CONSUMABLE_USED",
        title: `${operation.body.committedItemName} 사용이 기록되었습니다`,
        message: [
          `${operation.body.committedCodename} · ${operation.body.committedItemName} x${quantity}`,
          `잔여 ${operation.body.remaining}`,
          "ERP 편의점",
        ].join(" · "),
        link: `/erp/inventory/${characterId}`,
      }).catch((error) => {
        console.warn("[shop/consume] failed to notify committed consumption", {
          characterId,
          itemId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const responseBody = { ...operation.body };
    delete responseBody.committedOwnerId;
    delete responseBody.committedCodename;
    delete responseBody.committedItemName;
    return NextResponse.json(responseBody, {
      status: operation.status,
      headers,
    });
  } catch (error) {
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error:
            error.reason === "processing"
              ? "동일한 소비 요청이 처리 중입니다."
              : "동일 Idempotency-Key가 다른 소비 요청에 사용되었습니다.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 },
      );
    }
    console.error("[shop/consume] failed", error);
    return NextResponse.json(
      { error: "아이템 소비 처리에 실패했습니다." },
      { status: 500 },
    );
  }
}
