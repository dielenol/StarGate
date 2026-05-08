/**
 * stock_prices + stock_holdings CRUD
 *
 * tia_bot 의 주식 도메인.
 * - stock_prices: ticker 별 단일 가격 문서. price/prevPrice 는 정수.
 * - stock_holdings: user × ticker 보유. shares < 0 금지 (atomic guard).
 *   avgPrice 는 가중평균 정수 절사.
 */

import type {
  StockHolding,
  StockPrice,
} from "../types/index.js";

import {
  stockHoldingsCol,
  stockPricesCol,
} from "../collections.js";

/* ── stock_prices ── */

export async function getStockPrices(): Promise<StockPrice[]> {
  const col = await stockPricesCol();
  return col.find().sort({ ticker: 1 }).toArray();
}

export async function getStockPrice(ticker: string): Promise<StockPrice | null> {
  const col = await stockPricesCol();
  return col.findOne({ ticker });
}

/**
 * 가격 문서가 없으면 initialPrice 로 생성, 있으면 그대로 반환 (멱등).
 *
 * - initialLastUpdateKst: 호출자가 KST 타임스탬프 문자열을 주입 (빈 sentinel 폐기).
 * - initialEventText: 기본 "상장" (tia_bot `_init_prices` 동등).
 */
export async function ensureStockPrice(
  ticker: string,
  initialPrice: number,
  initialLastUpdateKst: string,
  initialEventText: string = "상장",
): Promise<StockPrice> {
  const col = await stockPricesCol();
  const existing = await col.findOne({ ticker });
  if (existing) return existing;

  const doc: StockPrice = {
    ticker,
    price: initialPrice,
    prevPrice: initialPrice,
    eventText: initialEventText,
    lastUpdate: initialLastUpdateKst,
  };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/**
 * 다수 ticker 의 시세 문서를 일괄 멱등 시드 (이미 있는 ticker 는 건드리지 않음).
 *
 * - initialLastUpdateKst: 호출자가 KST 타임스탬프 문자열을 주입.
 * - initialEventText: 기본 "상장".
 */
export async function ensureStockPrices(
  seeds: { ticker: string; price: number }[],
  initialLastUpdateKst: string,
  initialEventText: string = "상장",
): Promise<void> {
  if (seeds.length === 0) return;
  const col = await stockPricesCol();

  const ops = seeds.map((seed) => ({
    updateOne: {
      filter: { ticker: seed.ticker },
      update: {
        $setOnInsert: {
          ticker: seed.ticker,
          price: seed.price,
          prevPrice: seed.price,
          eventText: initialEventText,
          lastUpdate: initialLastUpdateKst,
        },
      },
      upsert: true,
    },
  }));
  await col.bulkWrite(ops, { ordered: false });
}

/**
 * 가격을 newPrice 로 갱신.
 *
 * aggregation pipeline 으로 read-then-write 없이 atomic 갱신:
 * - 기존 price 를 prevPrice 로 백업.
 * - price/eventText/lastUpdate 동시 set.
 *
 * 미존재 ticker 면 throw.
 */
export async function updateStockPrice(
  ticker: string,
  newPrice: number,
  eventText: string,
  lastUpdateKst: string,
): Promise<StockPrice> {
  const col = await stockPricesCol();
  const result = await col.findOneAndUpdate(
    { ticker },
    [
      {
        $set: {
          prevPrice: "$price",
          price: newPrice,
          eventText,
          lastUpdate: lastUpdateKst,
        },
      },
    ],
    { returnDocument: "after" },
  );
  if (!result) {
    throw new Error(`Stock price not found: ${ticker}`);
  }
  return result;
}

/* ── stock_holdings ── */

/**
 * 활성 보유만 (shares > 0). 일반 표시/조회용.
 * 0 shares 잔여 row 가 있어도 제외.
 */
export async function getHoldings(userId: string): Promise<StockHolding[]> {
  const col = await stockHoldingsCol();
  return col
    .find({ userId, shares: { $gt: 0 } })
    .sort({ ticker: 1 })
    .toArray();
}

/**
 * 0 shares 포함 전체 보유 (감사/마이그용).
 */
export async function getHoldingsRaw(userId: string): Promise<StockHolding[]> {
  const col = await stockHoldingsCol();
  return col.find({ userId }).sort({ ticker: 1 }).toArray();
}

export async function getHolding(
  userId: string,
  ticker: string,
): Promise<StockHolding | null> {
  const col = await stockHoldingsCol();
  return col.findOne({ userId, ticker });
}

/**
 * 매수 — 가중평균 매수단가 갱신.
 *
 * newAvg = floor((oldShares * oldAvg + shares * buyPrice) / (oldShares + shares))
 *
 * 신규 보유 시 avgPrice = buyPrice.
 *
 * aggregation pipeline upsert 단일 호출로 read-then-write race window 제거.
 * 동일 (userId, ticker) 의 동시 매수에서도 oldShares stale 없음 —
 * mongo 가 문서 단위 atomic 으로 pipeline 을 평가.
 */
export async function buyHolding(
  userId: string,
  ticker: string,
  shares: number,
  buyPrice: number,
): Promise<StockHolding> {
  if (shares <= 0) {
    throw new Error(`buyHolding: shares must be positive, got ${shares}`);
  }
  const col = await stockHoldingsCol();

  // aggregation pipeline upsert 로 read+write 단일화 — race window 제거.
  // 가중평균: newAvg = floor((oldShares * oldAvg + shares * buyPrice) / (oldShares + shares))
  // 신규 문서 (oldShares == 0): avgPrice = buyPrice
  const result = await col.findOneAndUpdate(
    { userId, ticker },
    [
      {
        $set: {
          shares: { $add: [{ $ifNull: ["$shares", 0] }, shares] },
          avgPrice: {
            $let: {
              vars: {
                oldS: { $ifNull: ["$shares", 0] },
                oldA: { $ifNull: ["$avgPrice", 0] },
              },
              in: {
                $cond: [
                  { $gt: ["$$oldS", 0] },
                  {
                    $floor: {
                      $divide: [
                        {
                          $add: [
                            { $multiply: ["$$oldS", "$$oldA"] },
                            shares * buyPrice,
                          ],
                        },
                        { $add: ["$$oldS", shares] },
                      ],
                    },
                  },
                  buyPrice,
                ],
              },
            },
          },
          updatedAt: new Date(),
          userId: { $ifNull: ["$userId", userId] },
          ticker: { $ifNull: ["$ticker", ticker] },
        },
      },
    ],
    { upsert: true, returnDocument: "after" },
  );

  // upsert + returnDocument:"after" → result 는 항상 truthy. 단, 드라이버 타입은 nullable.
  if (!result) {
    throw new Error(`buyHolding: unexpected null result for ${userId} ${ticker}`);
  }
  return result;
}

/**
 * 매도 — atomic 차감.
 *
 * - shares >= 매도수량 일 때만 매치.
 * - 부족 시 ok=false + remainingShares (현재 보유) 반환.
 * - avgPrice 는 매도 시 변경하지 않음 (매수단가 유지).
 * - 매도 후 shares == 0 이면 race-aware deleteOne (tia_bot 원본 DELETE 시맨틱 보존).
 */
export async function sellHolding(
  userId: string,
  ticker: string,
  shares: number,
): Promise<{ ok: boolean; remainingShares: number }> {
  if (shares <= 0) {
    throw new Error(`sellHolding: shares must be positive, got ${shares}`);
  }
  const col = await stockHoldingsCol();

  const result = await col.findOneAndUpdate(
    { userId, ticker, shares: { $gte: shares } },
    {
      $inc: { shares: -shares },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );

  if (!result) {
    const current = await col.findOne({ userId, ticker });
    return { ok: false, remainingShares: current?.shares ?? 0 };
  }
  if (result.shares === 0) {
    // race-aware delete: 다른 호출이 그 사이 +shares 했으면 매치 안 되어 보존됨.
    await col.deleteOne({ _id: result._id, shares: 0 });
  }
  return { ok: true, remainingShares: result.shares };
}

/**
 * 특정 ticker 의 활성 보유자 (shares > 0) 전체.
 * 폭락/IPO/배당 등 이벤트 알림 대상 산출용. 호출 컨텍스트 무관하게 활성 보유자 반환.
 */
export async function getActiveHoldersByTicker(ticker: string): Promise<StockHolding[]> {
  const col = await stockHoldingsCol();
  return col.find({ ticker, shares: { $gt: 0 } }).toArray();
}

export async function getAllHoldings(): Promise<StockHolding[]> {
  const col = await stockHoldingsCol();
  return col.find().toArray();
}
