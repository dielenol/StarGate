import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  getClient,
  initServerless,
  stockPriceHistoryCol,
  stockPricesCol,
} from "../packages/shared-db/dist/index.js";

import { STOCK_CATALOG } from "../StarGateV2/lib/stocks/catalog.ts";
import { rollStockMarketEvent } from "../StarGateV2/lib/stocks/events.ts";

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const DAYS = Number.parseInt(readArg("--days") ?? "7", 10);
const STEPS_PER_DAY = 4;
const STEP_HOURS = 6;
const TICKS = DAYS * STEPS_PER_DAY;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_SEED = "stargate-stock-backfill-2026-05-week";
const SEED = readArg("--seed") ?? DEFAULT_SEED;

if (!Number.isInteger(DAYS) || DAYS <= 0 || DAYS > 30) {
  console.error("--days must be an integer from 1 to 30");
  process.exit(1);
}

if (EXECUTE && !YES) {
  console.error("--execute requires --yes");
  process.exit(1);
}

loadEnv(resolve(process.cwd(), "StarGateV2", ".env"));
loadEnv(resolve(process.cwd(), "StarGateV2", ".env.local"));

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? process.env.MONGODB_DB_NAME ?? "stargate";

if (!MONGODB_URI) {
  console.error("MONGODB_URI missing");
  process.exit(1);
}

Math.random = seededRandom(SEED);

await initServerless({ uri: MONGODB_URI, dbName: DB_NAME });
const client = await getClient();
const pricesCol = await stockPricesCol();
const historyCol = await stockPriceHistoryCol();

try {
  const slots = buildRecentSlots(TICKS);
  const tickers = STOCK_CATALOG.map((meta) => meta.ticker);
  const start = slots[0].createdAt;
  const end = slots[slots.length - 1].createdAt;
  const targetExisting = await historyCol.countDocuments({
    ticker: { $in: tickers },
    createdAt: { $gte: start, $lte: end },
  });

  const currentPrices = await pricesCol
    .find({}, { projection: { _id: 0, ticker: 1, price: 1, prevPrice: 1 } })
    .sort({ ticker: 1 })
    .toArray();
  const currentByTicker = new Map(currentPrices.map((row) => [row.ticker, row]));

  const { rows, finalByTicker, summaries } = simulateRows(slots, currentByTicker);

  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? "execute" : "dry-run",
        dbName: DB_NAME,
        days: DAYS,
        seed: SEED,
        startKst: slots[0].tag,
        endKst: slots[slots.length - 1].tag,
        rowsPlanned: rows.length,
        targetExisting,
        summaries,
      },
      null,
      2,
    ),
  );

  if (!EXECUTE) {
    console.log("dry-run complete");
    process.exitCode = 0;
  } else {
    if (targetExisting > 0) {
      console.error(
        `target window already has ${targetExisting} history rows; aborting`,
      );
      process.exit(1);
    }

    const insertResult = await historyCol.insertMany(rows, { ordered: false });
    const finalSlot = slots[slots.length - 1];
    const ops = STOCK_CATALOG.map((meta) => {
      const final = finalByTicker.get(meta.ticker);
      if (!final) throw new Error(`missing final row for ${meta.ticker}`);
      return {
        updateOne: {
          filter: { ticker: meta.ticker },
          update: {
            $set: {
              ticker: meta.ticker,
              price: final.price,
              prevPrice: final.prevPrice,
              eventText: final.eventText,
              lastUpdate: finalSlot.tag,
            },
          },
          upsert: true,
        },
      };
    });
    const updateResult = await pricesCol.bulkWrite(ops, { ordered: false });

    const verifyCount = await historyCol.countDocuments({
      ticker: { $in: tickers },
      createdAt: { $gte: start, $lte: end },
    });
    const latestPrices = await pricesCol
      .find(
        { ticker: { $in: tickers } },
        {
          projection: {
            _id: 0,
            ticker: 1,
            price: 1,
            prevPrice: 1,
            lastUpdate: 1,
          },
        },
      )
      .sort({ ticker: 1 })
      .toArray();

    console.log(
      JSON.stringify(
        {
          inserted: insertResult.insertedCount,
          matched: updateResult.matchedCount,
          modified: updateResult.modifiedCount,
          upserted: updateResult.upsertedCount,
          verifyCount,
          latestPrices,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await client.close();
}

function readArg(prefix) {
  const arg = process.argv.find((item) => item.startsWith(`${prefix}=`));
  return arg ? arg.slice(prefix.length + 1) : undefined;
}

function loadEnv(path) {
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      let value = trimmed.slice(eqIdx + 1);
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Optional local env file.
  }
}

function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRecentSlots(count) {
  const now = new Date();
  const kstNowMs = now.getTime() + KST_OFFSET_MS;
  const kstNow = new Date(kstNowMs);
  const latestSlotHour =
    Math.floor(kstNow.getUTCHours() / STEP_HOURS) * STEP_HOURS;
  const latestSlotKstMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
    latestSlotHour,
    0,
    0,
    0,
  );
  const slots = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const slotKstMs = latestSlotKstMs - i * STEP_HOURS * 60 * 60 * 1000;
    slots.push({
      tag: formatKstTag(slotKstMs),
      createdAt: new Date(slotKstMs - KST_OFFSET_MS),
    });
  }
  return slots;
}

function formatKstTag(kstMs) {
  const iso = new Date(kstMs).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function randomMagnitude() {
  const samples = 4;
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    sum += Math.random();
  }
  return sum / samples;
}

function volatilityForBasePrice(basePrice) {
  if (basePrice >= 500) return 0.045;
  if (basePrice >= 100) return 0.055;
  return 0.075;
}

function signForDirection(direction) {
  return direction === "up" ? 1 : -1;
}

function rollDirection() {
  return Math.random() < 0.5 ? "up" : "down";
}

function calculateRoutinePercent(currentPrice, basePrice, direction) {
  const volatility = volatilityForBasePrice(basePrice);
  const directionSign = signForDirection(direction);
  const distanceFromBase = (basePrice - currentPrice) / Math.max(basePrice, 1);
  const movesTowardBase = directionSign * distanceFromBase > 0;
  const meanReversionBias = Math.min(0.25, Math.abs(distanceFromBase) * 0.12);
  const baseMagnitude = Math.max(0.006, randomMagnitude() * volatility);
  const adjustedMagnitude =
    baseMagnitude * (movesTowardBase ? 1 + meanReversionBias : 1 - meanReversionBias);
  const rawPercent = directionSign * adjustedMagnitude;
  return Math.max(-0.09, Math.min(0.09, rawPercent));
}

function calculateNextPrice(currentPrice, basePrice, percent) {
  let delta = Math.round(currentPrice * percent);
  if (delta === 0 && Math.abs(percent) >= 0.01) {
    delta = percent > 0 ? 1 : -1;
  }
  const upperBound = Math.max(basePrice * 5, basePrice + 10);
  return Math.max(1, Math.min(upperBound, currentPrice + delta));
}

function changePercent(prevPrice, price) {
  return prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
}

function simulateRows(slots, currentByTicker) {
  const rows = [];
  const finalByTicker = new Map();
  const summaries = [];

  for (const meta of STOCK_CATALOG) {
    let price = currentByTicker.get(meta.ticker)?.price ?? meta.basePrice;
    const startPrice = price;
    const tickerRows = [];

    for (const slot of slots) {
      const direction = rollDirection();
      const routinePercent = calculateRoutinePercent(
        price,
        meta.basePrice,
        direction,
      );
      const event = rollStockMarketEvent(meta.ticker, routinePercent, direction);
      const nextPrice = calculateNextPrice(
        price,
        meta.basePrice,
        event.percent,
      );
      const percent = changePercent(price, nextPrice);
      const eventText = `${event.text} ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
      const row = {
        ticker: meta.ticker,
        price: nextPrice,
        prevPrice: price,
        eventText,
        source: "scheduled",
        createdAt: slot.createdAt,
      };
      rows.push(row);
      tickerRows.push(row);
      finalByTicker.set(meta.ticker, row);
      price = nextPrice;
    }

    summaries.push({
      ticker: meta.ticker,
      startPrice,
      endPrice: price,
      min: Math.min(...tickerRows.map((row) => row.price)),
      max: Math.max(...tickerRows.map((row) => row.price)),
      rows: tickerRows.length,
    });
  }

  return { rows, finalByTicker, summaries };
}
