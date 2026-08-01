/**
 * stock_prices + stock_holdings CRUD
 *
 * tia_bot 의 주식 도메인.
 * - stock_prices: ticker 별 단일 가격 문서. price/prevPrice 는 0.01 단위 숫자.
 * - stock_holdings: character × ticker 보유. shares < 0 금지 (atomic guard).
 *   avgPrice 는 가중평균 0.01 단위 반올림.
 *
 * Phase 2 ledger 가 character 단위로 전환되어 holdings 도 characterId 단위.
 */

import { MongoServerError, type ClientSession } from "mongodb";

import type {
  CreateStockPriceHistoryInput,
  StockHolding,
  StockPrice,
  StockPriceHistory,
} from "../types/index.js";

import {
  stockHoldingsCol,
  stockPriceHistoryCol,
  stockPricesCol,
} from "../collections.js";
import { getClient } from "../client.js";

/* ── stock_prices ── */

export async function getStockPrices(): Promise<StockPrice[]> {
  const col = await stockPricesCol();
  return col.find().sort({ ticker: 1 }).toArray();
}

export async function getStockPrice(
  ticker: string,
  options: { session?: ClientSession } = {},
): Promise<StockPrice | null> {
  const col = await stockPricesCol();
  return col.findOne({ ticker }, { session: options.session });
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
  options: { session?: ClientSession } = {},
): Promise<StockPrice> {
  const col = await stockPricesCol();
  const doc: StockPrice = {
    ticker,
    price: initialPrice,
    prevPrice: initialPrice,
    eventText: initialEventText,
    lastUpdate: initialLastUpdateKst,
  };
  const result = await col.findOneAndUpdate(
    { ticker },
    { $setOnInsert: doc },
    {
      upsert: true,
      returnDocument: "after",
      session: options.session,
    },
  );
  if (!result) {
    throw new Error(`Failed to ensure stock price: ${ticker}`);
  }
  return result;
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
  options: { session?: ClientSession } = {},
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
    { returnDocument: "after", session: options.session },
  );
  if (!result) {
    throw new Error(`Stock price not found: ${ticker}`);
  }
  return result;
}

export interface ScheduledStockPriceMutation {
  price: number;
  eventText: string;
  eventTier: NonNullable<StockPriceHistory["eventTier"]>;
}

export interface ApplyScheduledStockPriceMutationInput<TContext = undefined> {
  ticker: string;
  operationKey: string;
  initialPrice: number;
  initialLastUpdateKst: string;
  initialEventText?: string;
  loadContext?: (session: ClientSession) => Promise<TContext>;
  calculate: (
    current: StockPrice,
    context: TContext,
  ) => ScheduledStockPriceMutation;
}

export interface ApplyScheduledStockPriceMutationResult {
  applied: boolean;
  initialized: boolean;
  price: StockPrice;
  history: StockPriceHistory;
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11_000;
}

/**
 * ticker의 예약 가격 변경과 append-only history를 단일 Mongo transaction으로 묶는다.
 *
 * operationKey unique 제약이 동시 실행의 DB-level 승자를 결정한다. transaction retry 시
 * calculate가 다시 호출될 수 있으므로 호출자는 같은 current에 항상 같은 값을 반환해야 한다.
 */
export async function applyScheduledStockPriceMutation<TContext = undefined>(
  input: ApplyScheduledStockPriceMutationInput<TContext>,
): Promise<ApplyScheduledStockPriceMutationResult> {
  if (!input.operationKey.trim()) {
    throw new Error("Scheduled stock operationKey must not be empty");
  }
  if (!Number.isFinite(input.initialPrice) || input.initialPrice <= 0) {
    throw new Error(
      `Scheduled stock initialPrice must be positive: ${input.initialPrice}`,
    );
  }

  const client = await getClient();
  const session = client.startSession();
  let outcome: ApplyScheduledStockPriceMutationResult | null = null;

  try {
    try {
      await session.withTransaction(async () => {
        const prices = await stockPricesCol();
        const history = await stockPriceHistoryCol();
        const existingHistory = await history.findOne(
          { operationKey: input.operationKey },
          { session },
        );
        const current = await prices.findOne(
          { ticker: input.ticker },
          { session },
        );

        if (existingHistory) {
          if (!current) {
            throw new Error(
              `Scheduled stock history exists without price: ${input.operationKey}`,
            );
          }
          outcome = {
            applied: false,
            initialized:
              existingHistory.eventText ===
              (input.initialEventText ?? "정기 시세 초기화"),
            price: current,
            history: existingHistory,
          };
          return;
        }

        const createdAt = new Date();
        if (!current) {
          const initialEventText =
            input.initialEventText ?? "정기 시세 초기화";
          const priceDoc: StockPrice = {
            ticker: input.ticker,
            price: input.initialPrice,
            prevPrice: input.initialPrice,
            eventText: initialEventText,
            lastUpdate: input.initialLastUpdateKst,
          };
          const priceInsert = await prices.insertOne(priceDoc, { session });
          const savedPrice = { ...priceDoc, _id: priceInsert.insertedId };
          const historyDoc: StockPriceHistory = {
            operationKey: input.operationKey,
            ticker: input.ticker,
            price: input.initialPrice,
            prevPrice: input.initialPrice,
            eventText: initialEventText,
            eventTier: "routine",
            source: "scheduled",
            createdAt,
          };
          const historyInsert = await history.insertOne(historyDoc, {
            session,
          });
          outcome = {
            applied: true,
            initialized: true,
            price: savedPrice,
            history: { ...historyDoc, _id: historyInsert.insertedId },
          };
          return;
        }

        const context = input.loadContext
          ? await input.loadContext(session)
          : (undefined as TContext);
        const mutation = input.calculate(current, context);
        if (!Number.isFinite(mutation.price) || mutation.price <= 0) {
          throw new Error(
            `Scheduled stock calculated invalid price: ${mutation.price}`,
          );
        }
        const savedPrice = await prices.findOneAndUpdate(
          { ticker: input.ticker },
          {
            $set: {
              prevPrice: current.price,
              price: mutation.price,
              eventText: mutation.eventText,
              lastUpdate: input.initialLastUpdateKst,
            },
          },
          { returnDocument: "after", session },
        );
        if (!savedPrice) {
          throw new Error(`Stock price not found: ${input.ticker}`);
        }

        const historyDoc: StockPriceHistory = {
          operationKey: input.operationKey,
          ticker: input.ticker,
          price: savedPrice.price,
          prevPrice: current.price,
          eventText: mutation.eventText,
          eventTier: mutation.eventTier,
          source: "scheduled",
          createdAt,
        };
        const historyInsert = await history.insertOne(historyDoc, { session });
        outcome = {
          applied: true,
          initialized: false,
          price: savedPrice,
          history: { ...historyDoc, _id: historyInsert.insertedId },
        };
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const history = await stockPriceHistoryCol();
      const prices = await stockPricesCol();
      const [existingHistory, current] = await Promise.all([
        history.findOne({ operationKey: input.operationKey }),
        prices.findOne({ ticker: input.ticker }),
      ]);
      if (!existingHistory || !current) throw error;
      outcome = {
        applied: false,
        initialized:
          existingHistory.eventText ===
          (input.initialEventText ?? "정기 시세 초기화"),
        price: current,
        history: existingHistory,
      };
    }

    if (!outcome) {
      throw new Error(
        `Scheduled stock mutation returned no result: ${input.operationKey}`,
      );
    }
    return outcome;
  } finally {
    await session.endSession();
  }
}

/* ── stock_holdings ── */

/**
 * 활성 보유만 (shares > 0). 일반 표시/조회용.
 * 0 shares 잔여 row 가 있어도 제외.
 */
export async function getHoldings(characterId: string): Promise<StockHolding[]> {
  const col = await stockHoldingsCol();
  return col
    .find({ characterId, shares: { $gt: 0 } })
    .sort({ ticker: 1 })
    .toArray();
}

/**
 * 0 shares 포함 전체 보유 (감사/마이그용).
 */
export async function getHoldingsRaw(characterId: string): Promise<StockHolding[]> {
  const col = await stockHoldingsCol();
  return col.find({ characterId }).sort({ ticker: 1 }).toArray();
}

export async function getHolding(
  characterId: string,
  ticker: string,
): Promise<StockHolding | null> {
  const col = await stockHoldingsCol();
  return col.findOne({ characterId, ticker });
}

/**
 * 매수 — 가중평균 매수단가 갱신.
 *
 * newAvg = round((oldShares * oldAvg + shares * buyPrice) / (oldShares + shares), 2)
 *
 * 신규 보유 시 avgPrice = buyPrice.
 *
 * aggregation pipeline upsert 단일 호출로 read-then-write race window 제거.
 * 동일 (characterId, ticker) 의 동시 매수에서도 oldShares stale 없음 —
 * mongo 가 문서 단위 atomic 으로 pipeline 을 평가.
 */
export async function buyHolding(
  characterId: string,
  ticker: string,
  shares: number,
  buyPrice: number,
  options: { session?: ClientSession } = {},
): Promise<StockHolding> {
  if (shares <= 0) {
    throw new Error(`buyHolding: shares must be positive, got ${shares}`);
  }
  const col = await stockHoldingsCol();

  // aggregation pipeline upsert 로 read+write 단일화 — race window 제거.
  // 가중평균: newAvg = round((oldShares * oldAvg + shares * buyPrice) / (oldShares + shares), 2)
  // 신규 문서 (oldShares == 0): avgPrice = buyPrice
  const result = await col.findOneAndUpdate(
    { characterId, ticker },
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
                $round: [
                  {
                    $cond: [
                      { $gt: ["$$oldS", 0] },
                      {
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
                      buyPrice,
                    ],
                  },
                  2,
                ],
              },
            },
          },
          updatedAt: new Date(),
          characterId: { $ifNull: ["$characterId", characterId] },
          ticker: { $ifNull: ["$ticker", ticker] },
        },
      },
    ],
    { upsert: true, returnDocument: "after", session: options.session },
  );

  // upsert + returnDocument:"after" → result 는 항상 truthy. 단, 드라이버 타입은 nullable.
  if (!result) {
    throw new Error(
      `buyHolding: unexpected null result for ${characterId} ${ticker}`,
    );
  }
  return result;
}

/**
 * 매도 — atomic 차감.
 *
 * - shares >= 매도수량 일 때만 매치.
 * - 부족 시 ok=false + remainingShares (현재 보유) 반환.
 * - avgPrice 는 매도 시 변경하지 않음 (매수단가 유지) — 매도 후 ledger profit 계산용으로 노출.
 * - 매도 후 shares == 0 이면 race-aware deleteOne (tia_bot 원본 DELETE 시맨틱 보존).
 *
 * 반환: ok / remainingShares + 매도 직전 보유의 avgPrice (호출자 ledger profit 산출용).
 * - ok=true: 매치 성공한 row 의 avgPrice 그대로.
 * - ok=false: 부족 분기 — 현재 row 가 있으면 그 avgPrice, 없으면 0.
 */
export async function sellHolding(
  characterId: string,
  ticker: string,
  shares: number,
  options: { session?: ClientSession } = {},
): Promise<{ ok: boolean; remainingShares: number; avgPrice: number }> {
  if (shares <= 0) {
    throw new Error(`sellHolding: shares must be positive, got ${shares}`);
  }
  const col = await stockHoldingsCol();

  const result = await col.findOneAndUpdate(
    { characterId, ticker, shares: { $gte: shares } },
    {
      $inc: { shares: -shares },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after", session: options.session },
  );

  if (!result) {
    const current = await col.findOne(
      { characterId, ticker },
      { session: options.session },
    );
    return {
      ok: false,
      remainingShares: current?.shares ?? 0,
      avgPrice: current?.avgPrice ?? 0,
    };
  }
  if (result.shares === 0) {
    // race-aware delete: 다른 호출이 그 사이 +shares 했으면 매치 안 되어 보존됨.
    await col.deleteOne(
      { _id: result._id, shares: 0 },
      { session: options.session },
    );
  }
  return {
    ok: true,
    remainingShares: result.shares,
    avgPrice: result.avgPrice,
  };
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

/* ── stock_price_history ── */

/**
 * 가격 변동 시계열 1건 append (M1: ERP 차트 표시용).
 *
 * - createdAt 은 기본 now이며 transaction retry에서 동일 시각이 필요하면 options로 고정한다.
 * - source 분류는 호출자가 결정 ("scheduled" | "trade" | "gm-event").
 * - TTL 인덱스가 30 일 후 자동 만료.
 */
export async function recordStockPriceHistory(
  input: CreateStockPriceHistoryInput,
  options: { session?: ClientSession; createdAt?: Date } = {},
): Promise<StockPriceHistory> {
  const col = await stockPriceHistoryCol();
  const doc: StockPriceHistory = {
    ...input,
    createdAt: options.createdAt ?? new Date(),
  };
  const result = await col.insertOne(doc, { session: options.session });
  return { ...doc, _id: result.insertedId };
}

/**
 * 특정 ticker 의 최근 N 일 가격 시계열을 createdAt 오름차순으로 반환 (차트 X축 정합).
 *
 * - days: 조회 기간 (기본 30 일, TTL 와 동일).
 * - 인덱스: `{ ticker: 1, createdAt: -1 }` 활용 (sort reverse 는 mongo 가 처리).
 * - limit(500) 안전벨트: 차트는 30~100 포인트로 충분. 30일치라도 GM 폭주
 *   이벤트가 분당 단위로 쌓이는 비정상 상황에서 응답 비대를 차단한다.
 */
export async function listStockPriceHistory(
  ticker: string,
  days: number = 30,
): Promise<StockPriceHistory[]> {
  const col = await stockPriceHistoryCol();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return col
    .find({ ticker, createdAt: { $gte: since } })
    .sort({ createdAt: 1 })
    .limit(500)
    .toArray();
}

/**
 * 다수 ticker 의 최근 N 일 scheduled-source 시계열 행을 일괄 조회.
 *
 * 정기 틱(scheduled-tick)의 "오늘 슬롯 기처리 여부" 검사용 — 종목별
 * `listStockPriceHistory` 개별 호출(N+1)을 단일 `$in` 쿼리로 대체한다.
 * source 필터를 DB 로 내렸을 뿐, 판정(슬롯 태그 비교)은 호출자가 수행한다.
 *
 * - 빈 배열 입력은 즉시 short-circuit.
 * - 인덱스: `{ ticker: 1, createdAt: -1 }` 활용.
 */
export async function listScheduledStockPriceHistoryBulk(
  tickers: string[],
  days: number = 2,
): Promise<Pick<StockPriceHistory, "ticker" | "createdAt" | "source">[]> {
  if (tickers.length === 0) return [];
  const col = await stockPriceHistoryCol();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return col
    .find({
      ticker: { $in: tickers },
      createdAt: { $gte: since },
      source: "scheduled",
    })
    .project<Pick<StockPriceHistory, "ticker" | "createdAt" | "source">>({
      ticker: 1,
      createdAt: 1,
      source: 1,
    })
    .toArray();
}

/**
 * KST 일자 복구처럼 명시적인 UTC 구간이 필요한 호출자를 위한 scheduled 장부 조회.
 * 정기 틱의 Discord 공시 요청 저장이 실패해도 가격을 다시 굴리지 않고 당시 결과를
 * 재구성할 수 있도록 가격·문구·eventTier를 포함한 원본 행을 반환한다.
 */
export async function listScheduledStockPriceHistoryRange(
  start: Date,
  end: Date,
): Promise<StockPriceHistory[]> {
  const col = await stockPriceHistoryCol();
  return col
    .find({
      source: "scheduled",
      createdAt: { $gte: start, $lt: end },
    })
    .sort({ createdAt: 1 })
    .toArray();
}

/**
 * 다수 ticker 의 최근 N 일 sparkline 시계열을 일괄 조회 (카드 미니 차트용).
 *
 * 단일 호출로 N 종목 시계열을 반환해 카드별 N+1 fetch 함정을 회피한다.
 *
 * - tickers: 조회 대상. 빈 배열이면 즉시 `[]` 반환 (round-trip 절약).
 * - days: 조회 기간 (기본 7 일).
 * - 인덱스: `{ ticker: 1, createdAt: -1 }` 활용. `$in` 매칭 후 createdAt 오름차순.
 * - 반환은 입력 ticker 순서를 보장하지 않는다 (호출자가 Map 으로 인덱싱).
 *   ticker 가 시계열을 갖지 않으면 결과 배열에서 누락 (빈 points 항목으로 채우지 않음).
 */
export async function listStockPriceHistoryBulk(
  tickers: string[],
  days: number = 7,
): Promise<Array<{ ticker: string; points: Array<{ ts: Date; price: number }> }>> {
  if (tickers.length === 0) return [];
  const col = await stockPriceHistoryCol();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const result = await col
    .aggregate<{ _id: string; points: Array<{ ts: Date; price: number }> }>([
      { $match: { ticker: { $in: tickers }, createdAt: { $gte: since } } },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: "$ticker",
          points: {
            $push: { ts: "$createdAt", price: "$price" },
          },
        },
      },
    ])
    .toArray();

  return result.map((row) => ({ ticker: row._id, points: row.points }));
}

/**
 * 다수 ticker 의 최근 N 일 가격 이력 "원본 행"을 단일 `$in` 쿼리로 일괄 조회.
 *
 * `listStockPriceHistory` 의 종목별 루프 호출(N+1) 대체용 — 시장 공시 피드(wire)와
 * 종합지수 시계열처럼 prevPrice / eventText / source 등 원본 필드가 필요한 경로 전용.
 * (ts/price 포인트만 필요하면 `listStockPriceHistoryBulk` 사용.)
 *
 * - tickers: 조회 대상. 빈 배열이면 즉시 `[]` 반환 (round-trip 절약).
 * - days: 조회 기간 (기본 7 일 — 단건 `listStockPriceHistory` 의 기본 30 일과 다름).
 * - 반환은 전체 ticker 를 섞은 flat 배열 · createdAt 오름차순 — ticker 별 그룹핑은 호출자 몫.
 * - limit: `500 * tickers.length` 글로벌 캡 — semantics 가 아니라 payload 가드.
 *   단건의 per-ticker 500 상한과의 truncation 경계 차이는 가드가 발동하는
 *   비정상 볼륨(종목당 7일 500행 초과)에서만 존재한다.
 * - 인덱스: `{ ticker: 1, createdAt: -1 }` 활용.
 */
export async function listStockPriceHistoryRowsBulk(
  tickers: string[],
  days: number = 7,
): Promise<StockPriceHistory[]> {
  if (tickers.length === 0) return [];
  const col = await stockPriceHistoryCol();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return col
    .find({ ticker: { $in: tickers }, createdAt: { $gte: since } })
    .sort({ createdAt: 1 })
    .limit(500 * tickers.length)
    .toArray();
}
