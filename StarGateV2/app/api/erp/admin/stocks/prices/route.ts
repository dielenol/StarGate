/**
 * POST /api/erp/admin/stocks/prices — GM stock quote override.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  ensureStockPrice,
  getStockPrice,
  recordStockPriceHistory,
  updateStockPrice,
} from "@/lib/db/stocks";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { notifyStockManualIntervention } from "@/lib/stocks/market-wire";
import { kstNowTag } from "@/lib/stocks/time";

interface PostBody {
  ticker?: string;
  price?: number;
  eventText?: string;
}

const MIN_PRICE = 1;
const MAX_PRICE = 999_999_999;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as PostBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const ticker = body.ticker?.trim().toUpperCase();
  if (!ticker || !findStockByTicker(ticker)) {
    return NextResponse.json(
      { error: "주식 카탈로그에 없는 종목입니다." },
      { status: 400 },
    );
  }

  const price = body.price;
  if (
    typeof price !== "number" ||
    !Number.isInteger(price) ||
    price < MIN_PRICE ||
    price > MAX_PRICE
  ) {
    return NextResponse.json(
      {
        error: `price는 ${MIN_PRICE}~${MAX_PRICE.toLocaleString()} 사이의 정수여야 합니다.`,
      },
      { status: 400 },
    );
  }

  const eventText = body.eventText?.trim() || "GM 시세 조정";
  if (eventText.length > 80) {
    return NextResponse.json(
      { error: "eventText는 80자 이하로 입력해주세요." },
      { status: 400 },
    );
  }

  const previous = await getStockPrice(ticker);
  const lastUpdate = kstNowTag();
  const updated = previous
    ? await updateStockPrice(ticker, price, eventText, lastUpdate)
    : await ensureStockPrice(ticker, price, lastUpdate, eventText);

  await recordStockPriceHistory({
    ticker,
    price: updated.price,
    prevPrice: previous?.price ?? updated.prevPrice,
    eventText,
    source: "gm-event",
  });
  const marketWire = await notifyStockManualIntervention({
    ticker,
    previousPrice: previous?.price ?? updated.prevPrice,
    price: updated.price,
    eventText,
    actor: {
      displayName: session.user.displayName,
      role: session.user.role,
    },
  });

  return NextResponse.json({
    item: {
      ticker: updated.ticker,
      price: updated.price,
      prevPrice: updated.prevPrice,
      eventText: updated.eventText,
      lastUpdate: updated.lastUpdate,
    },
    marketWire,
  });
}

