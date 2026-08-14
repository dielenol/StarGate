import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  cancelStockDisclosure,
  listStockDisclosures,
  StockCorporateActionDisclosureError,
  StockDisclosureCutoffError,
  StockDisclosureConflictError,
  updateStockDisclosure,
} from "@/lib/db/stock-market";
import { enqueueGmAdminAudit } from "@/lib/outbox/integration";
import {
  parseStockDisclosurePayload,
  serializeStockDisclosure,
} from "@/lib/stocks/disclosures";
import { isNovexV2Enabled } from "@/lib/stocks/market";

interface RouteContext {
  params: Promise<{ disclosureId: string }>;
}

async function requireGm() {
  const session = await auth();
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  try {
    requireRole(session.user.role, "GM");
  } catch {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session };
}

function targetFromEffects(
  effects: Array<{ scope: "MARKET" | "TICKER"; ticker?: string }>,
) {
  const market = effects.some((effect) => effect.scope === "MARKET");
  return {
    scope: market ? ("MARKET" as const) : ("TICKERS" as const),
    tickers: Array.from(
      new Set(
        effects
          .map((effect) => effect.ticker)
          .filter((ticker): ticker is string => Boolean(ticker)),
      ),
    ),
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireGm();
  if ("response" in access) return access.response;
  const { session } = access;
  if (!isNovexV2Enabled()) {
    return NextResponse.json(
      { error: "NOVEX 2.0 enabled 모드에서만 공시를 변경할 수 있습니다." },
      { status: 409 },
    );
  }
  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다." },
      { status: 400 },
    );
  }
  const { disclosureId } = await context.params;
  const patch = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!patch) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const current = (
    await listStockDisclosures({
      now: new Date(),
      includeDrafts: true,
      limit: 500,
    })
  ).find((item) => item._id === disclosureId);
  if (!current) {
    return NextResponse.json({ error: "공시를 찾을 수 없습니다." }, { status: 404 });
  }
  const target = targetFromEffects(current.effects);
  const merged = {
    status: current.status,
    kind: current.kind,
    ...target,
    publishAt: current.publishAt?.toISOString(),
    headline: current.title,
    body: current.body,
    effects: current.effects,
    forceCooldown: current.forceCooldown === true,
    ...patch,
  };
  const parsed = parseStockDisclosurePayload(merged);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const operation = await executeEconomicOperationResult({
      requestId,
      domain: "stock-disclosure-update",
      actorId: session.user.id,
      payload: { disclosureId, ...parsed.value },
      run: async (dbSession) => {
        const now = new Date();
        const item = await updateStockDisclosure(
          disclosureId,
          {
            title: parsed.value.headline,
            body: parsed.value.body,
            kind: parsed.value.kind,
            status: parsed.value.status,
            effects: parsed.value.effects,
            publishAt: parsed.value.publishAt,
            slotKey: parsed.value.slotKey,
            shock: parsed.value.effects.some(
              (effect) => Math.abs(effect.changePercent ?? 0) >= 12,
            ),
            forceCooldown: parsed.value.forceCooldown,
          },
          now,
          dbSession,
        );
        if (!item) throw new Error("DISCLOSURE_NOT_EDITABLE");
        await enqueueGmAdminAudit(
          {
            action: "NOVEX 공시 수정",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: parsed.value.headline,
            target: disclosureId,
            details: [],
            timestamp: now,
          },
          {
            session: dbSession,
            dedupeKey: `stock-disclosure:${requestId}:update-audit`,
          },
        );
        return {
          status: 200,
          body: { item: serializeStockDisclosure(item, { admin: true }) },
        };
      },
    });
    return NextResponse.json(operation.body, {
      status: operation.status,
      headers: operation.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    if (error instanceof StockDisclosureConflictError) {
      return NextResponse.json(
        { error: "같은 종목·가격 회차에 이미 가격 연동 공시가 있습니다." },
        { status: 409 },
      );
    }
    if (error instanceof StockDisclosureCutoffError) {
      return NextResponse.json(
        { error: "공시 예약 회차가 이미 시작되었거나 지났습니다." },
        { status: 409 },
      );
    }
    if (error instanceof StockCorporateActionDisclosureError) {
      return NextResponse.json(
        { error: "기업행동 공시는 기업행동 메뉴에서만 변경할 수 있습니다." },
        { status: 409 },
      );
    }
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        { error: "동일 Idempotency-Key 요청이 처리 중이거나 충돌했습니다." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "DISCLOSURE_NOT_EDITABLE") {
      return NextResponse.json(
        { error: "공개·취소되었거나 편집 마감 시각이 지난 공시입니다." },
        { status: 409 },
      );
    }
    console.error("[admin/stocks/disclosures] update failed:", error);
    return NextResponse.json(
      { error: "NOVEX 공시 수정에 실패했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireGm();
  if ("response" in access) return access.response;
  const { session } = access;
  if (!isNovexV2Enabled()) {
    return NextResponse.json(
      { error: "NOVEX 2.0 enabled 모드에서만 공시를 변경할 수 있습니다." },
      { status: 409 },
    );
  }
  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다." },
      { status: 400 },
    );
  }
  const { disclosureId } = await context.params;

  try {
    const operation = await executeEconomicOperationResult({
      requestId,
      domain: "stock-disclosure-cancel",
      actorId: session.user.id,
      payload: { disclosureId },
      run: async (dbSession) => {
        const now = new Date();
        const item = await cancelStockDisclosure(
          disclosureId,
          now,
          dbSession,
        );
        if (!item) throw new Error("DISCLOSURE_NOT_CANCELLABLE");
        await enqueueGmAdminAudit(
          {
            action: "NOVEX 공시 취소",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: item.title,
            target: disclosureId,
            details: [],
            timestamp: now,
          },
          {
            session: dbSession,
            dedupeKey: `stock-disclosure:${requestId}:cancel-audit`,
          },
        );
        return {
          status: 200,
          body: { item: serializeStockDisclosure(item, { admin: true }) },
        };
      },
    });
    return NextResponse.json(operation.body, {
      status: operation.status,
      headers: operation.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    if (error instanceof StockDisclosureCutoffError) {
      return NextResponse.json(
        { error: "공시 예약 회차가 이미 시작되었거나 지났습니다." },
        { status: 409 },
      );
    }
    if (error instanceof StockCorporateActionDisclosureError) {
      return NextResponse.json(
        { error: "기업행동 공시는 기업행동 메뉴에서만 취소할 수 있습니다." },
        { status: 409 },
      );
    }
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        { error: "동일 Idempotency-Key 요청이 처리 중이거나 충돌했습니다." },
        { status: 409 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "DISCLOSURE_NOT_CANCELLABLE"
    ) {
      return NextResponse.json(
        { error: "공개·취소되었거나 취소 마감 시각이 지난 공시입니다." },
        { status: 409 },
      );
    }
    console.error("[admin/stocks/disclosures] cancel failed:", error);
    return NextResponse.json(
      { error: "NOVEX 공시 취소에 실패했습니다." },
      { status: 500 },
    );
  }
}
