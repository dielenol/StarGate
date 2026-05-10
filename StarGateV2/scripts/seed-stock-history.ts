/**
 * 주식 가격 시계열 dummy seed 스크립트.
 *
 * 목적 — `/erp/stock` list 의 sparkline / 종목 상세 차트가 빈 placeholder 로 표시되는
 * 운영 초기 문제 해결. 실 운영 매매/스케줄러가 history 를 적재할 때까지의 가시성 메움.
 *
 * 정책:
 *   - 끝점 (가장 최근) 가격은 stock_prices.price (= 현재 DB 값) 를 그대로 사용.
 *   - 거꾸로 30일치를 6시간 간격(120 step) random-walk back-fill.
 *   - 종목별 변동성·trend 를 catalog 의 "개잡주 → 우량주" 그라데이션으로 매핑.
 *     · 위(SPZ ¤1,050) = 우량 — 작은 sigma + 약 양 trend
 *     · 아래(TWS ¤1)  = 개잡 — 큰 sigma + 0 trend (저가 정수 truncate 한계)
 *   - source: "scheduled" (스케줄러 시드와 동일 분류 — 차트가 무거운 GM 이벤트로 오인 X).
 *   - eventText: 빈 문자열 (tooltip 노이즈 회피).
 *
 * 사용법:
 *   pnpm tsx scripts/seed-stock-history.ts                       # dry-run (기본)
 *   pnpm tsx scripts/seed-stock-history.ts --execute --yes       # 실제 적재 (기존 시드 위 추가)
 *   pnpm tsx scripts/seed-stock-history.ts --execute --yes --reset
 *                                                                # 기존 history 삭제 후 재적재
 *
 * 환경: MONGODB_URI 필수 (실제 실행 시).
 *
 * 1회성 세팅 권장 — 실 운영 누적이 시작되면 본 스크립트 재실행 X.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import {
  getClient,
  initServerless,
  stockPriceHistoryCol,
  stockPricesCol,
} from "@stargate/shared-db";

import { STOCK_CATALOG } from "../lib/stocks/catalog.ts";

/* ── .env.local 로드 ── */

const envPath = resolve(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  // .env.local 부재 — dry-run 만 가능
}

/* ── CLI 플래그 ── */

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const RESET = process.argv.includes("--reset");
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");
const DRY_RUN = !EXECUTE;

if (EXECUTE && !YES) {
  console.error(
    "[seed-stock-history] --execute 시 --yes 로 명시적 확인이 필요합니다.",
  );
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME ?? "stargate";

/* ── 종목별 변동성 매핑 ── */

interface Volatility {
  /** 일간 returns 의 표준편차. 0.10 = 10%/day. */
  dailySigma: number;
  /** 일간 returns 평균 (drift). 양수 = 상승 추세 / 음수 = 하락. */
  dailyDrift: number;
}

const VOLATILITY: Record<string, Volatility> = {
  // 개잡주 (저가, 출렁 큼)
  TWS: { dailySigma: 0.10, dailyDrift: 0 },        // ¤1 — 정수 truncate 한계, 평탄 불가피
  STM: { dailySigma: 0.10, dailyDrift: -0.013 },   // ¤5 — 폭락 분위기 (현재 -16.67%, 30d ≈ 50% 하락)
  // 중하위 (변동 큼)
  SSR: { dailySigma: 0.09, dailyDrift: 0.002 },    // ¤67
  MSF: { dailySigma: 0.07, dailyDrift: 0 },        // ¤80
  // 중간
  VFP: { dailySigma: 0.06, dailyDrift: 0.0015 },   // ¤206
  BPE: { dailySigma: 0.055, dailyDrift: 0 },       // ¤189
  ART: { dailySigma: 0.05, dailyDrift: 0.001 },    // ¤230
  // 우량
  GN3: { dailySigma: 0.025, dailyDrift: 0.0008 },  // ¤540
  SPZ: { dailySigma: 0.018, dailyDrift: 0.001 },   // ¤1,050
};

/* ── 시계열 파라미터 ── */

const DAYS = 30;
const STEPS_PER_DAY = 4;             // 6h 간격
const STEPS = DAYS * STEPS_PER_DAY;  // 120 step
const INTERVAL_MS = (24 / STEPS_PER_DAY) * 60 * 60 * 1000; // 6h

/* ── 유틸: Box-Muller 정규분포 ── */

function randomNormal(mean: number, stdDev: number): number {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + stdDev * z;
}

/* ── back-fill 알고리즘 ── */

interface HistoryRow {
  ticker: string;
  price: number;
  prevPrice: number;
  eventText: string;
  source: "scheduled";
  createdAt: Date;
}

interface SeedSummary {
  ticker: string;
  startPrice: number;  // 30일 전
  endPrice: number;    // 현재 (DB)
  min: number;
  max: number;
  rows: number;
}

/**
 * 단일 종목의 30일 시계열 back-fill.
 *
 * - prices[STEPS-1] = currentPrice (끝점 고정).
 * - prices[i-1] = prices[i] / (1 + r), r ~ N(drift/STEPS_PER_DAY, sigma/sqrt(STEPS_PER_DAY)).
 * - 정수 round + min(1) clamp.
 * - prevPrice[i] = prices[i-1] (i=0 은 자기 자신).
 * - createdAt[i] = now - (STEPS-1-i) × interval.
 */
function buildSeries(
  ticker: string,
  currentPrice: number,
  vol: Volatility,
  now: Date,
): HistoryRow[] {
  const stepSigma = vol.dailySigma / Math.sqrt(STEPS_PER_DAY);
  const stepDrift = vol.dailyDrift / STEPS_PER_DAY;

  const prices: number[] = new Array(STEPS).fill(0);
  prices[STEPS - 1] = Math.max(1, Math.round(currentPrice));

  for (let i = STEPS - 2; i >= 0; i--) {
    const r = randomNormal(stepDrift, stepSigma);
    // 다음 step 가격 = 현재 × (1+r) → 거꾸로 = next / (1+r)
    const safeR = r > -0.95 ? r : -0.95; // 1+r 가 0 근접 방지
    const back = prices[i + 1] / (1 + safeR);
    prices[i] = Math.max(1, Math.round(back));
  }

  const rows: HistoryRow[] = new Array(STEPS);
  for (let i = 0; i < STEPS; i++) {
    rows[i] = {
      ticker,
      price: prices[i],
      prevPrice: i === 0 ? prices[0] : prices[i - 1],
      eventText: "",
      source: "scheduled",
      createdAt: new Date(now.getTime() - (STEPS - 1 - i) * INTERVAL_MS),
    };
  }
  return rows;
}

/* ── main ── */

async function main() {
  console.log(
    `[seed-stock-history] ${DRY_RUN ? "DRY-RUN (DB 쓰기 X)" : "EXECUTE 모드"} ` +
      `${RESET ? "(--reset: 기존 history 삭제 후 재적재)" : ""}`,
  );
  console.log(
    `[seed-stock-history] ${DAYS}일 × ${STEPS_PER_DAY}/day = ${STEPS} steps/종목, 9 종목, 총 ${STEPS * 9} rows 예상`,
  );

  if (DRY_RUN && !MONGODB_URI) {
    console.warn(
      "[seed-stock-history] .env.local 의 MONGODB_URI 미설정 — 현재 가격 조회 불가, 알고리즘 검증만 수행.",
    );
    // 알고리즘 sanity check — basePrice 기반 mock series 생성
    for (const meta of STOCK_CATALOG) {
      const vol = VOLATILITY[meta.ticker];
      const series = buildSeries(meta.ticker, meta.basePrice, vol, new Date());
      const summary: SeedSummary = {
        ticker: meta.ticker,
        startPrice: series[0].price,
        endPrice: series[series.length - 1].price,
        min: Math.min(...series.map((r) => r.price)),
        max: Math.max(...series.map((r) => r.price)),
        rows: series.length,
      };
      console.log(
        `  [${summary.ticker}] basePrice=${meta.basePrice} ` +
          `start=${summary.startPrice} → end=${summary.endPrice} ` +
          `min=${summary.min} max=${summary.max} rows=${summary.rows}`,
      );
    }
    return;
  }

  if (!MONGODB_URI) {
    console.error("[seed-stock-history] MONGODB_URI 미설정 — 실행 중단.");
    process.exit(1);
  }

  await initServerless({ uri: MONGODB_URI, dbName: DB_NAME });
  const client = await getClient();
  const host = client.options?.hosts?.[0]?.host ?? "(unknown)";
  console.log(`[seed-stock-history] 연결: ${host} / db=${DB_NAME}`);

  const pricesCol = await stockPricesCol();
  const historyCol = await stockPriceHistoryCol();
  const now = new Date();

  const summaries: SeedSummary[] = [];
  const allRows: HistoryRow[] = [];

  for (const meta of STOCK_CATALOG) {
    const priceDoc = await pricesCol.findOne({ ticker: meta.ticker });
    const currentPrice = priceDoc?.price ?? meta.basePrice;
    const vol = VOLATILITY[meta.ticker] ?? {
      dailySigma: 0.05,
      dailyDrift: 0,
    };

    const rows = buildSeries(meta.ticker, currentPrice, vol, now);
    allRows.push(...rows);

    summaries.push({
      ticker: meta.ticker,
      startPrice: rows[0].price,
      endPrice: rows[rows.length - 1].price,
      min: Math.min(...rows.map((r) => r.price)),
      max: Math.max(...rows.map((r) => r.price)),
      rows: rows.length,
    });
  }

  console.log("[seed-stock-history] 종목별 시계열 미리보기:");
  for (const s of summaries) {
    console.log(
      `  [${s.ticker}] ${s.startPrice} → ${s.endPrice} ` +
        `(min ${s.min} / max ${s.max}, ${s.rows} rows)`,
    );
  }

  if (VERBOSE) {
    for (const s of summaries) {
      const sample = allRows
        .filter((r) => r.ticker === s.ticker)
        .filter((_, i) => i % 8 === 0); // 8 step (=2일) 간격 샘플
      console.log(`\n  [${s.ticker}] sample (8-step interval):`);
      for (const r of sample) {
        console.log(
          `    ${r.createdAt.toISOString()} price=${r.price} prev=${r.prevPrice}`,
        );
      }
    }
  }

  if (DRY_RUN) {
    console.log(
      `\n[seed-stock-history] DRY-RUN 종료. 실제 적재: --execute --yes ${RESET ? "--reset" : ""}`,
    );
    await client.close();
    return;
  }

  // EXECUTE 모드
  if (RESET) {
    const tickers = STOCK_CATALOG.map((m) => m.ticker);
    const deleteResult = await historyCol.deleteMany({
      ticker: { $in: tickers },
    });
    console.log(
      `[seed-stock-history] --reset: 기존 history ${deleteResult.deletedCount} rows 삭제`,
    );
  }

  const insertResult = await historyCol.insertMany(allRows, { ordered: false });
  console.log(
    `[seed-stock-history] insertMany ${insertResult.insertedCount} rows 완료.`,
  );

  await client.close();
  console.log("[seed-stock-history] 완료.");
}

main().catch((err) => {
  console.error("[seed-stock-history] 에러:", err);
  process.exit(1);
});
