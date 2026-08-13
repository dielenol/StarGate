import { NextResponse } from "next/server";

import type { CreateSharedInventoryInput } from "@/types/inventory";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  addToSharedInventory,
  findMasterItemById,
  listSharedInventory,
  SHARED_INVENTORY_SCOPE,
} from "@/lib/db/inventory";
import { isValidObjectId } from "@/lib/db/utils";
import { redactInternalInventoryNote } from "@/lib/inventory/note-visibility";
import { enqueueGmAdminAudit } from "@/lib/outbox/integration";

const MAX_GRANT_QUANTITY = 999;

interface GrantSharedInventoryOperationBody {
  entry: Awaited<ReturnType<typeof addToSharedInventory>>;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const inventory = await listSharedInventory();
    const revealInternalNotes = hasRole(session.user.role, "V");
    return NextResponse.json({
      inventory: inventory.map((entry) =>
        redactInternalInventoryNote(entry, revealInternalNotes),
      ),
    });
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

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      {
        error: "유효한 Idempotency-Key 헤더가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | Partial<CreateSharedInventoryInput>
    | null;

  if (!body?.itemId?.trim() || !isValidObjectId(body.itemId)) {
    return NextResponse.json(
      { error: "itemId가 올바른 ObjectId 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (
    typeof body.quantity !== "number" ||
    !Number.isSafeInteger(body.quantity) ||
    body.quantity < 1 ||
    body.quantity > MAX_GRANT_QUANTITY
  ) {
    return NextResponse.json(
      { error: `quantity는 1~${MAX_GRANT_QUANTITY} 사이의 정수여야 합니다.` },
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

  const itemId = body.itemId.trim();
  const quantity = body.quantity;
  const note = body.note ?? "";
  const auditDedupeKey = `shared-inventory-grant:${requestId}:audit`;
  const createAuditPayload = (timestamp: Date) => ({
    action: "공용 인벤토리 지급",
    actor: {
      id: session.user.id,
      displayName: session.user.displayName,
      role: session.user.role,
    },
    summary: `${masterItem.name} x${quantity}`,
    target: "공용 인벤토리",
    details: note ? [{ name: "메모", value: note }] : undefined,
    timestamp,
  });

  try {
    const acquiredAt = new Date();
    const operation =
      await executeEconomicOperationResult<GrantSharedInventoryOperationBody>({
        requestId,
        domain: "shared-inventory-grant",
        actorId: session.user.id,
        payload: { itemId, quantity, note },
        run: async (dbSession) => {
          const entry = await addToSharedInventory(
            {
              scope: SHARED_INVENTORY_SCOPE,
              itemId,
              itemName: masterItem.name,
              quantity,
              acquiredAt,
              note,
            },
            { session: dbSession },
          );
          await enqueueGmAdminAudit(createAuditPayload(acquiredAt), {
            session: dbSession,
            dedupeKey: auditDedupeKey,
          });
          return { status: 201, body: { entry } };
        },
      });

    if (operation.replayed) {
      await enqueueGmAdminAudit(
        createAuditPayload(new Date(operation.body.entry.acquiredAt)),
        { dedupeKey: auditDedupeKey },
      );
    }

    return NextResponse.json(operation.body, {
      status: operation.status,
      headers: operation.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (err) {
    if (err instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error:
            err.reason === "processing"
              ? "동일한 지급 요청이 처리 중입니다."
              : "동일 Idempotency-Key가 다른 요청에 사용되었습니다.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 },
      );
    }
    const message =
      err instanceof Error ? err.message : "공용 인벤토리 지급 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
