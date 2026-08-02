import { createHash } from "node:crypto";

import { MongoServerError, type UpdateFilter } from "mongodb";

import {
  SHOP_CATALOG,
  resolveShopOpenState,
  type ShopCatalogItem,
  type ShopRuntimeOpenState,
} from "@stargate/core/domain/shop-catalog";
import { findStockByTicker } from "@stargate/core/domain/stock-catalog";
import { formatSignedStockValue } from "@stargate/core/domain/stock-pricing";
import type { ScheduledStockTickSummary } from "@stargate/core/operations/stocks-tick";
import { getDb } from "@stargate/shared-db";

import type { DiscordWebhookPayload } from "../outbox/discord-client.js";

const SHOP_STATE_ID = "daily-shop-restock";
const STOCK_STATE_ID = "scheduled";
const SHOP_URL = "https://www.ordonet.co.kr/erp/shop";
const STOCK_URL = "https://www.ordonet.co.kr/erp/stock";
const FIELD_VALUE_MAX = 1_000;
const SHOP_FIELDS_PER_PAYLOAD = 5;

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
  const updated = await col.updateOne(
    {
      _id: input.stateId,
      $or: [
        { desiredDate: { $exists: false } },
        { desiredDate: { $lte: input.date } },
      ],
    },
    mutation,
  );
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
    return inserted.upsertedCount === 1 ? "requested" : "current";
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11_000) {
      return "current";
    }
    throw error;
  }
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
  const fields = summary.results.map((result) => {
    const meta = findStockByTicker(result.ticker);
    const signedPercent = `${result.changePercent >= 0 ? "+" : ""}${result.changePercent.toFixed(2)}%`;
    return {
      name: `${meta?.name ?? result.ticker} · ${result.ticker}`,
      value: [
        `${result.price.toLocaleString("ko-KR")} CR`,
        signedPercent,
        sanitize(result.eventText),
      ]
        .join(" · ")
        .slice(0, FIELD_VALUE_MAX),
      inline: false,
    };
  });
  const payload: DiscordWebhookPayload = {
    username: "NOVUS Market Wire",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `정기 시황 공시 · ${summary.date}`,
        url: STOCK_URL,
        description: [
          "NOVUS ORDO 거래소 정오 기준가가 갱신되었습니다.",
          `변동 종목 ${summary.results.filter((item) => item.status !== "skipped").length}개`,
        ].join("\n"),
        color: 0x5ea3c5,
        fields,
        footer: {
          text: `KST ${summary.slot} · ${formatSignedStockValue(
            summary.results.reduce(
              (total, item) => total + item.changePercent,
              0,
            ) / Math.max(summary.results.length, 1),
            "%",
          )}`,
        },
        timestamp: now.toISOString(),
      },
    ],
  };
  const sourceRevision =
    summary.sourceRevision ??
    createHash("sha256").update(JSON.stringify(summary.results)).digest("hex");
  return requestDesiredState({
    collectionName: "stock_discord_market_wires",
    stateId: STOCK_STATE_ID,
    date: summary.date,
    sourceRevision,
    payloads: [payload],
  });
}
