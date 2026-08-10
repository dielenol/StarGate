import { createHash } from "node:crypto";

import { MongoServerError, type UpdateFilter } from "mongodb";

import {
  SHOP_CATALOG,
  resolveShopOpenState,
  type ShopCatalogItem,
  type ShopRuntimeOpenState,
} from "@stargate/core/domain/shop-catalog";
import {
  STOCK_CATALOG,
  findStockByTicker,
} from "@stargate/core/domain/stock-catalog";
import {
  formatSignedStockValue,
  formatStockValue,
} from "@stargate/core/domain/stock-pricing";
import type {
  ScheduledStockTickResult,
  ScheduledStockTickSummary,
} from "@stargate/core/operations/stocks-tick";
import { getDb } from "@stargate/shared-db";

import type { DiscordWebhookPayload } from "../outbox/discord-client.js";

const SHOP_STATE_ID = "daily-shop-restock";
const STOCK_STATE_ID = "scheduled";
const SHOP_URL = "https://www.ordonet.co.kr/erp/shop";
const STOCK_URL = "https://www.ordonet.co.kr/erp/stock";
const FIELD_VALUE_MAX = 1_000;
const SHOP_FIELDS_PER_PAYLOAD = 5;
const STOCK_MARKET_INDEX_CODE = "NOVEX";
const STOCK_MARKET_INDEX_BASE_VALUE = 1_000;
const MARKET_WIRE_COLOR = 0xc5a059;
const MARKET_WIRE_POSITIVE = 0x2fbf71;
const MARKET_WIRE_NEGATIVE = 0xd95f5f;

interface MarketWireOfficer {
  name: string;
  romanizedName: string;
  code: string;
  weekday: string;
  noticeLine: string;
}

const MARKET_WIRE_OFFICERS: Record<number, MarketWireOfficer> = {
  0: {
    weekday: "일요일",
    name: "소피아 마르코비치",
    romanizedName: "Sofia Markovic",
    code: "FIN-SUN-07",
    noticeLine: "휴일 당직 기준으로 필수 변동 사항만 공시합니다.",
  },
  1: {
    weekday: "월요일",
    name: "한서진",
    romanizedName: "Han Seo-jin",
    code: "FIN-MON-01",
    noticeLine: "주간 개장 기준에 따라 정기 시세 갱신 내역을 통지합니다.",
  },
  2: {
    weekday: "화요일",
    name: "아미나 오카포르",
    romanizedName: "Amina Okafor",
    code: "FIN-TUE-02",
    noticeLine: "거래 지표 중심으로 변동 폭과 특이사항을 정리합니다.",
  },
  3: {
    weekday: "수요일",
    name: "마테오 알바레스",
    romanizedName: "Mateo Alvarez",
    code: "FIN-WED-03",
    noticeLine: "중간장 점검 결과를 ORDO-NET 시장기록에 반영합니다.",
  },
  4: {
    weekday: "목요일",
    name: "프리야 라만",
    romanizedName: "Priya Raman",
    code: "FIN-THU-04",
    noticeLine: "기업 동향과 가격 변동의 연결 항목을 우선 기록합니다.",
  },
  5: {
    weekday: "금요일",
    name: "레일라 하다드",
    romanizedName: "Leila Haddad",
    code: "FIN-FRI-05",
    noticeLine: "주간 마감 전 시세 변동과 위험 신호를 함께 고지합니다.",
  },
  6: {
    weekday: "토요일",
    name: "닐스 소렌센",
    romanizedName: "Nils Sorensen",
    code: "FIN-SAT-06",
    noticeLine: "주말 당직 관제 기준으로 시장 변동을 기록합니다.",
  },
};

interface DesiredMessageState {
  _id: string;
  requestedRevision: number;
  syncedRevision: number;
  desiredDate: string;
  desiredSourceRevision?: string;
  desiredPayloads: DiscordWebhookPayload[];
  createdAt: Date;
  updatedAt: Date;
}

function sanitize(value: string): string {
  return value
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<(@[!&]?|#)(\d+)>/g, "<$1​$2>");
}

function truncateField(value: string): string {
  if (value.length <= FIELD_VALUE_MAX) return value;
  return `${value.slice(0, FIELD_VALUE_MAX - 1)}…`;
}

function getMarketWireOfficer(date: string): MarketWireOfficer {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return MARKET_WIRE_OFFICERS[weekday];
}

function formatPercent(value: number): string {
  if (Math.abs(value) < 0.005) return "0.00%";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function stockName(ticker: string): string {
  const meta = findStockByTicker(ticker);
  return meta ? `${meta.name} (${ticker})` : ticker;
}

function directionIcon(result: ScheduledStockTickResult): string {
  if (result.price > result.previousPrice) return "▲";
  if (result.price < result.previousPrice) return "▼";
  return "·";
}

function directionLabel(result: ScheduledStockTickResult): string {
  if (result.price > result.previousPrice) return "상승";
  if (result.price < result.previousPrice) return "하락";
  return "보합";
}

function tierLabel(result: ScheduledStockTickResult): string {
  if (result.eventTier === "shock") return "충격";
  if (result.eventTier === "scenario") return "특이";
  return "정기";
}

function formatStockLedgerLine(result: ScheduledStockTickResult): string {
  const delta = result.price - result.previousPrice;
  const statusLabel =
    result.status === "initialized" ? " · 신규 등록" : "";
  return `${directionIcon(result)} ${directionLabel(result)} · **${stockName(result.ticker)}**\n${formatStockValue(result.previousPrice)}C → ${formatStockValue(result.price)}C (${formatSignedStockValue(delta, "C")} / ${formatPercent(result.changePercent)})${statusLabel}`;
}

function marketBiasLabel(input: {
  upCount: number;
  downCount: number;
  flatCount: number;
}): string {
  if (input.upCount > input.downCount) return "상승 우세";
  if (input.downCount > input.upCount) return "하락 우세";
  if (input.flatCount > 0 && input.upCount === 0 && input.downCount === 0) {
    return "보합 관측";
  }
  return "혼조";
}

function buildStockMarketIndex(summary: ScheduledStockTickSummary): {
  value: number;
  changePercent: number;
} {
  const quoteByTicker = new Map(
    summary.results.map((result) => [result.ticker, result]),
  );
  let totalMarketCap = 0;
  let previousTotalMarketCap = 0;
  let baseMarketCap = 0;
  for (const meta of STOCK_CATALOG) {
    const quote = quoteByTicker.get(meta.ticker);
    const price = quote?.price ?? meta.basePrice;
    const previousPrice = quote?.previousPrice ?? price;
    totalMarketCap += price * meta.sharesOutstanding;
    previousTotalMarketCap += previousPrice * meta.sharesOutstanding;
    baseMarketCap += meta.basePrice * meta.sharesOutstanding;
  }
  const value =
    baseMarketCap > 0
      ? Math.round(
          (totalMarketCap / baseMarketCap) *
            STOCK_MARKET_INDEX_BASE_VALUE *
            100,
        ) / 100
      : STOCK_MARKET_INDEX_BASE_VALUE;
  const previousValue =
    baseMarketCap > 0
      ? Math.round(
          (previousTotalMarketCap / baseMarketCap) *
            STOCK_MARKET_INDEX_BASE_VALUE *
            100,
        ) / 100
      : value;
  return {
    value,
    changePercent:
      previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0,
  };
}

export function buildStockMarketWireDesiredPayloads(
  summary: ScheduledStockTickSummary,
  now: Date,
): DiscordWebhookPayload[] {
  const changed = summary.results.filter((result) => result.status !== "skipped");
  if (changed.length === 0) return [];

  const officer = getMarketWireOfficer(summary.date);
  const rising = changed.filter((result) => result.price > result.previousPrice);
  const falling = changed.filter((result) => result.price < result.previousPrice);
  const flat = changed.filter((result) => result.price === result.previousPrice);
  const upCount = rising.length;
  const downCount = falling.length;
  const flatCount = flat.length;
  const initializedCount = changed.filter(
    (result) => result.status === "initialized",
  ).length;
  const averagePercent =
    changed.reduce((sum, result) => sum + result.changePercent, 0) /
    changed.length;
  const netDelta = changed.reduce(
    (sum, result) => sum + result.price - result.previousPrice,
    0,
  );
  const marketIndex = buildStockMarketIndex(summary);
  const color =
    upCount > downCount || netDelta > 0
      ? MARKET_WIRE_POSITIVE
      : downCount > upCount || netDelta < 0
        ? MARKET_WIRE_NEGATIVE
        : MARKET_WIRE_COLOR;
  const timestamp = now.toISOString();
  const basePayload = {
    username: "재무기구 시장감시실",
    ...(process.env.DISCORD_WEBHOOK_STOCK_AVATAR_URL?.trim()
      ? { avatar_url: process.env.DISCORD_WEBHOOK_STOCK_AVATAR_URL.trim() }
      : {}),
    allowed_mentions: { parse: [] },
  };
  const eventLines = changed
    .filter(
      (result) => result.eventTier !== "routine" && result.status === "updated",
    )
    .map(
      (result) =>
        `${tierLabel(result)} · ${directionLabel(result)} · **${stockName(result.ticker)}**\n${sanitize(result.eventText)}`,
    );

  const payloads: DiscordWebhookPayload[] = [
    {
      ...basePayload,
      content: `ORDO-NET 주식 거래소 바로가기: ${STOCK_URL}`,
      embeds: [
        {
          title: `재무기구 정기 시세 공시 · ${summary.date}`,
          url: STOCK_URL,
          description: [
            "ORDO-NET MARKET WIRE",
            `문서번호: ${officer.code}-${summary.date}`,
            `${officer.weekday} 당직: ${officer.name} (${officer.romanizedName})`,
            officer.noticeLine,
          ].join("\n"),
          color,
          fields: [
            {
              name: "공시 개요",
              value: [
                `기준 슬롯: ${summary.slot} KST`,
                `처리 종목: ${changed.length}건`,
                initializedCount > 0 ? `신규 등록: ${initializedCount}건` : null,
              ]
                .filter(Boolean)
                .join("\n"),
              inline: true,
            },
            {
              name: "시장 방향",
              value: [
                marketBiasLabel({ upCount, downCount, flatCount }),
                `상승 ${upCount} · 하락 ${downCount} · 보합 ${flatCount}`,
                `평균 변동률 ${formatPercent(averagePercent)}`,
              ].join("\n"),
              inline: true,
            },
            {
              name: `${STOCK_MARKET_INDEX_CODE} 종합지수`,
              value: `${marketIndex.changePercent > 0 ? "▲" : marketIndex.changePercent < 0 ? "▼" : "·"} ${marketIndex.value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${formatPercent(marketIndex.changePercent)})`,
              inline: true,
            },
          ],
          timestamp,
        },
      ],
    },
    {
      ...basePayload,
      embeds: [
        {
          title: "상승 마감 장부",
          url: STOCK_URL,
          color: MARKET_WIRE_POSITIVE,
          fields: [
            {
              name: "상승 종목",
              value: truncateField(
                rising.length > 0
                  ? rising.map(formatStockLedgerLine).join("\n\n")
                  : "상승 마감 종목 없음",
              ),
            },
          ],
          footer: { text: `${officer.code} · ${summary.slot} KST · 상승 장부` },
          timestamp,
        },
      ],
    },
    {
      ...basePayload,
      embeds: [
        {
          title: "하락 마감 장부",
          url: STOCK_URL,
          color: MARKET_WIRE_NEGATIVE,
          fields: [
            {
              name: "하락 종목",
              value: truncateField(
                falling.length > 0
                  ? falling.map(formatStockLedgerLine).join("\n\n")
                  : "하락 마감 종목 없음",
              ),
            },
          ],
          footer: { text: `${officer.code} · ${summary.slot} KST · 하락 장부` },
          timestamp,
        },
      ],
    },
    {
      ...basePayload,
      embeds: [
        {
          title: "보합 및 감시실 특이사항",
          url: STOCK_URL,
          description: "가격은 ORDO-NET 거래소 기준입니다.",
          color: MARKET_WIRE_COLOR,
          fields: [
            ...(flat.length > 0
              ? [
                  {
                    name: "보합 / 초기화",
                    value: truncateField(
                      flat.map(formatStockLedgerLine).join("\n\n"),
                    ),
                  },
                ]
              : []),
            {
              name: "감시실 특이사항",
              value: truncateField(
                eventLines.length > 0
                  ? eventLines.join("\n\n")
                  : "특이 공시 없음 · 정기 변동만 반영되었습니다.",
              ),
            },
          ],
          footer: { text: `${officer.code} · ${summary.slot} KST · 시장감시실` },
          timestamp,
        },
      ],
    },
  ];
  return [
    {
      ...payloads[0],
      embeds: payloads.flatMap((payload) => payload.embeds),
    },
  ];
}

async function requestDesiredState(input: {
  collectionName: string;
  stateId: string;
  date: string;
  sourceRevision: string;
  payloads: DiscordWebhookPayload[];
}): Promise<"requested" | "current"> {
  const db = await getDb();
  const col = db.collection<DesiredMessageState>(input.collectionName);
  const current = await col.findOne(
    { _id: input.stateId },
    { projection: { desiredDate: 1, desiredSourceRevision: 1 } },
  );
  if (
    current?.desiredDate === input.date &&
    current.desiredSourceRevision === input.sourceRevision
  ) {
    return "current";
  }

  const now = new Date();
  const mutation: UpdateFilter<DesiredMessageState> = {
    $inc: { requestedRevision: 1 },
    $setOnInsert: { syncedRevision: 0, createdAt: now },
    $set: {
      desiredDate: input.date,
      desiredSourceRevision: input.sourceRevision,
      desiredPayloads: input.payloads,
      updatedAt: now,
    },
    $unset: { lastError: "", nextAttemptAt: "" },
  };
  const monotonicFilter = {
    _id: input.stateId,
    $or: [
      { desiredDate: { $exists: false } },
      { desiredDate: { $lte: input.date } },
    ],
  };
  const updateMonotonically = () =>
    col.updateOne(monotonicFilter, mutation);
  const updated = await updateMonotonically();
  if (updated.matchedCount === 1) return "requested";

  try {
    const inserted = await col.updateOne(
      { _id: input.stateId },
      {
        $setOnInsert: {
          requestedRevision: 1,
          syncedRevision: 0,
          desiredDate: input.date,
          desiredSourceRevision: input.sourceRevision,
          desiredPayloads: input.payloads,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    if (inserted.upsertedCount === 1) return "requested";
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11_000) {
      throw error;
    }
  }

  const raced = await updateMonotonically();
  return raced.matchedCount === 1 ? "requested" : "current";
}

function shopStatusLine(
  open: ReturnType<typeof resolveShopOpenState>,
): string {
  if (open.mode === "open") {
    return "지금은 GM이 문 열어뒀어요. 필요한 거 있으면 바로 들러요.";
  }
  if (open.mode === "closed") {
    return "지금은 GM이 잠깐 셔터 내려뒀어요. 새 물건은 미리 봐둬도 돼요.";
  }
  return open.isOpen
    ? "지금은 문 열려 있어요. 필요한 거 있으면 바로 들러요."
    : "지금은 영업 시간이 아니에요. 새 물건은 미리 봐둬도 돼요.";
}

function chunkDiscordFieldLines(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const segments = Array.from(
      { length: Math.ceil(line.length / FIELD_VALUE_MAX) },
      (_, index) =>
        line.slice(
          index * FIELD_VALUE_MAX,
          (index + 1) * FIELD_VALUE_MAX,
        ),
    );
    for (const segment of segments) {
      const candidate = current ? `${current}\n${segment}` : segment;
      if (candidate.length > FIELD_VALUE_MAX) {
        if (current) chunks.push(current);
        current = segment;
      } else {
        current = candidate;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildShopRestockDesiredPayloads(input: {
  date: string;
  now: Date;
  catalog: readonly ShopCatalogItem[];
  stockBySlug: ReadonlyMap<string, number>;
  runtimeState: ShopRuntimeOpenState | null;
}): DiscordWebhookPayload[] {
  const groupLabels = {
    BASIC: "기본 물품",
    RECOVERY: "회복 물품",
    LUXURY: "기호품",
    RARE: "희귀 물품",
  } as const;
  const itemFields: DiscordWebhookPayload["embeds"][number]["fields"] = [];
  for (const group of ["BASIC", "RECOVERY", "LUXURY", "RARE"] as const) {
    const lines = input.catalog
      .filter((item) => item.pageGroup === group)
      .map((item) => {
        const stock = input.stockBySlug.get(item.slug) ?? 0;
        return `${item.icon} ${sanitize(item.name)} x${stock} · ${item.price.toLocaleString("ko-KR")}C`;
      })
      .filter((line) => !line.includes(" x0 "));
    const values = chunkDiscordFieldLines(lines);
    itemFields.push(
      ...values.map((value, index) => ({
        name:
          index === 0
            ? groupLabels[group]
            : `${groupLabels[group]} (${index + 1})`,
        value,
      })),
    );
  }

  const payloadCount = Math.max(
    1,
    Math.ceil(itemFields.length / SHOP_FIELDS_PER_PAYLOAD),
  );
  const open = resolveShopOpenState(input.now, input.runtimeState);
  return Array.from({ length: payloadCount }, (_, index) => {
    const fields = itemFields.slice(
      index * SHOP_FIELDS_PER_PAYLOAD,
      (index + 1) * SHOP_FIELDS_PER_PAYLOAD,
    );
    fields.push({
      name: "편의점으로 가기",
      value: `[띠아 편의점 들어가기](${SHOP_URL})`,
    });
    return {
      username: "띠아",
      ...(process.env.DISCORD_WEBHOOK_SHOP_AVATAR_URL?.trim()
        ? {
            avatar_url:
              process.env.DISCORD_WEBHOOK_SHOP_AVATAR_URL.trim(),
          }
        : {}),
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title:
            payloadCount === 1
              ? "편의점 입고 알림"
              : `편의점 입고 알림 (${index + 1}/${payloadCount})`,
          url: SHOP_URL,
          description: `오늘 새로 들어온 물건들이에요.\n${shopStatusLine(open)}`,
          color: 0xc5a059,
          fields,
          footer: {
            text:
              payloadCount === 1
                ? `${input.date} KST`
                : `${input.date} KST · ${index + 1}/${payloadCount}`,
          },
          timestamp: input.now.toISOString(),
        },
      ],
    };
  });
}

export async function requestDailyShopRestockState(
  date: string,
  now: Date,
  catalog: readonly ShopCatalogItem[] = SHOP_CATALOG,
): Promise<"requested" | "current"> {
  const db = await getDb();
  const [stocks, runtimeState] = await Promise.all([
    db
      .collection<{ itemId: string; stock: number; lastRefresh: string }>(
        "shop_daily_stock",
      )
      .find({ lastRefresh: date })
      .toArray(),
    db
      .collection<{
        _id: string;
        forceOpen?: boolean;
        forceClosed?: boolean;
        updatedAt?: Date;
      }>(
        "shop_runtime_state",
      )
      .findOne({ _id: "open-state" }),
  ]);
  const stockBySlug = new Map(
    stocks.map((stock) => [stock.itemId, stock.stock]),
  );
  const missing = catalog.filter(
    (item) => !stockBySlug.has(item.slug),
  );
  if (missing.length > 0) {
    throw new Error(
      `편의점 desired-state 생성 전에 ${missing.length}개 품목 재고가 누락됐습니다.`,
    );
  }

  const payloads = buildShopRestockDesiredPayloads({
    date,
    now,
    catalog,
    stockBySlug,
    runtimeState,
  });
  const openState = resolveShopOpenState(now, runtimeState);
  const sourceRevision = createHash("sha256")
    .update(
      JSON.stringify(
        {
          stock: [...stockBySlug.entries()].sort(([left], [right]) =>
            left.localeCompare(right),
          ),
          openState,
        },
      ),
    )
    .digest("hex");
  return requestDesiredState({
    collectionName: "shop_restock_notifications",
    stateId: SHOP_STATE_ID,
    date,
    sourceRevision,
    payloads,
  });
}

export async function requestStockMarketWireState(
  summary: ScheduledStockTickSummary,
  now: Date,
): Promise<"requested" | "current"> {
  const payloads = buildStockMarketWireDesiredPayloads(summary, now);
  if (payloads.length === 0) return "current";
  const sourceRevision =
    summary.sourceRevision ??
    createHash("sha256").update(JSON.stringify(summary.results)).digest("hex");
  return requestDesiredState({
    collectionName: "stock_discord_market_wires",
    stateId: STOCK_STATE_ID,
    date: summary.date,
    sourceRevision,
    payloads,
  });
}
