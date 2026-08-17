import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  claimStockMarketMigrationReady,
  createStockDisclosure,
  listStockDisclosures,
  StockDisclosureCutoffError,
  StockDisclosureConflictError,
  StockMarketMigrationNotReadyError,
} from "@/lib/db/stock-market";
import { enqueueGmAdminAudit } from "@/lib/outbox/integration";
import {
  parseStockDisclosurePayload,
  serializeStockDisclosure,
} from "@/lib/stocks/disclosures";
import { isNovexV2Enabled } from "@/lib/stocks/market";

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

export async function GET() {
  const access = await requireGm();
  if ("response" in access) return access.response;
  const now = new Date();
  const rows = await listStockDisclosures({
    now,
    includeDrafts: true,
    limit: 500,
  });
  return NextResponse.json({
    items: rows.map((row) => serializeStockDisclosure(row, { admin: true })),
    generatedAt: now.toISOString(),
  });
}

export async function POST(request: Request) {
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
  const parsed = parseStockDisclosurePayload(
    await request.json().catch(() => null),
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const operation = await executeEconomicOperationResult({
      requestId,
      domain: "stock-disclosure-create",
      actorId: session.user.id,
      payload: parsed.value,
      run: async (dbSession) => {
        await claimStockMarketMigrationReady(dbSession);
        const now = new Date();
        const item = await createStockDisclosure(
          {
            id: `stock-disclosure:${requestId}`,
            title: parsed.value.headline,
            body: parsed.value.body,
            kind: parsed.value.kind,
            status: parsed.value.status,
            source: "GM",
            effects: parsed.value.effects,
            publishAt: parsed.value.publishAt,
            slotKey: parsed.value.slotKey,
            shock: parsed.value.effects.some(
              (effect) => Math.abs(effect.changePercent ?? 0) >= 12,
            ),
            forceCooldown: parsed.value.forceCooldown,
            companyProfileUpdate: parsed.value.companyProfileUpdate,
            createdById: session.user.id,
            now,
          },
          dbSession,
        );
        await enqueueGmAdminAudit(
          {
            action: "NOVEX 공시 생성",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `${parsed.value.kind} · ${parsed.value.headline}`,
            target: `${parsed.value.scope} · ${
              parsed.value.publishAt?.toISOString() ?? "즉시 공개"
            }`,
            details: [
              {
                name: "대상 종목",
                value: parsed.value.tickers.join(", ") || "시장 전체",
              },
            ],
            timestamp: now,
          },
          {
            session: dbSession,
            dedupeKey: `stock-disclosure:${requestId}:create-audit`,
          },
        );
        return {
          status: 201,
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
    if (error instanceof StockMarketMigrationNotReadyError) {
      return NextResponse.json(
        { error: "NOVEX 2.0 migration READY 확인 전에는 공시를 생성할 수 없습니다." },
        { status: 409 },
      );
    }
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
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        { error: "동일 Idempotency-Key가 다른 요청에 사용되었습니다." },
        { status: 409 },
      );
    }
    console.error("[admin/stocks/disclosures] create failed:", error);
    return NextResponse.json(
      { error: "NOVEX 공시 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}
