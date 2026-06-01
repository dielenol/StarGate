/**
 * GET /api/erp/stocks/wire?days=&limit= — 전 종목 최근 공시 피드.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";

import { buildMarketWireResponse } from "@/app/(erp)/erp/stock/_data";

function parseBoundedInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = parseBoundedInt(url.searchParams.get("days"), 7, 1, 30);
  const limit = parseBoundedInt(url.searchParams.get("limit"), 12, 1, 50);

  try {
    const response = await buildMarketWireResponse(days, limit);
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "공시 피드 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
