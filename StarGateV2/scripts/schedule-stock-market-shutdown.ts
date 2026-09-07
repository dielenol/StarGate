/**
 * 2026-09-07 18:00 KST 시장 종료 계획. 기본은 읽기 전용 미리보기.
 * node --env-file=.env.local --experimental-strip-types scripts/schedule-stock-market-shutdown.ts
 * 실제 예약: 같은 명령에 --execute --yes --target-db stargate 추가.
 * 운영 중지 즉시 전환: 위 실제 실행 인자에 --now 추가. 소급 적용하지 않는다.
 * 가격 변경은 executeAt에 worker가 단 한 번 확정한다.
 */
import {
  close,
  applyDueStockMarketShutdown,
  getStockMarketShutdownPlan,
  getStockPrices,
  initServerless,
  scheduleStockMarketShutdown,
} from "@stargate/shared-db";

const scheduledExecuteAt = new Date("2026-09-07T18:00:00+09:00");
const reason = "파리 사태로 인한 쇼크";
const declines = [
  { ticker: "TWS", dropPercent: 45 },
  { ticker: "STM", dropPercent: 50 },
  { ticker: "SSR", dropPercent: 65 },
  { ticker: "MSF", dropPercent: 40 },
  { ticker: "VFP", dropPercent: 47 },
  { ticker: "BPE", dropPercent: 58 },
  { ticker: "ART", dropPercent: 55 },
  { ticker: "GN3", dropPercent: 70 },
  { ticker: "SPZ", dropPercent: 62 },
];

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const immediate = args.includes("--now");
  if (execute && args.includes("--dry-run")) {
    throw new Error("--dry-run과 --execute는 함께 사용할 수 없습니다.");
  }
  const target = args[args.indexOf("--target-db") + 1];
  const dbName = process.env.DB_NAME ?? "stargate";
  if (execute && (!args.includes("--yes") || target !== dbName)) {
    throw new Error("실제 예약에는 --execute --yes --target-db <설정된 DB>가 필요합니다.");
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI가 필요합니다.");
  initServerless({ uri, dbName, maxPoolSize: 2 });
  try {
    const [prices, existing] = await Promise.all([
      getStockPrices(),
      getStockMarketShutdownPlan(),
    ]);
    const priceByTicker = new Map(prices.map((price) => [price.ticker, price.price]));
    // 이미 등록한 계획은 재사용한다. 신규 즉시 전환도 실제 미래 시각으로 등록해
    // 매수 차단과 일반 작업 fence를 먼저 확정한 뒤 마지막 가격을 한 번 적용한다.
    const executeAt = immediate
      ? existing?.executeAt ?? new Date(Date.now() + 5_000)
      : scheduledExecuteAt;
    if (immediate && existing?.status === "SCHEDULED" && executeAt.getTime() > Date.now() + 5_000) {
      throw new Error("미래 종료 계획을 즉시 실행 시각으로 변경하지 않습니다.");
    }
    console.log(JSON.stringify({
      mode: execute ? (immediate ? "APPLY_NOW" : "SCHEDULE") : "DRY_RUN",
      targetDb: dbName,
      executeAt,
      reason,
      existingStatus: existing?.status ?? null,
      declines: declines.map((decline) => {
        const currentPrice = priceByTicker.get(decline.ticker);
        if (currentPrice === undefined) throw new Error(`시세 누락: ${decline.ticker}`);
        return {
          ...decline,
          currentPrice,
          estimatedFinalPrice: Math.max(0.01, Math.round(currentPrice * (100 - decline.dropPercent)) / 100),
        };
      }),
    }, null, 2));
    if (execute) {
      await scheduleStockMarketShutdown({
        executeAt,
        reason,
        declines,
        createdById: "authorized-operation:market-shutdown-20260907",
      });
      if (immediate) {
        const waitMs = Math.max(0, executeAt.getTime() - Date.now());
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        const result = await applyDueStockMarketShutdown();
        if (result.status !== "APPLIED" && result.status !== "ALREADY_COMPLETED") {
          throw new Error("즉시 시장 종료가 확정되지 않았습니다.");
        }
      }
      const after = await getStockMarketShutdownPlan();
      if (!after || after.executeAt.getTime() !== executeAt.getTime() || (immediate && after.status !== "COMPLETED")) {
        throw new Error("예약 재조회가 일치하지 않습니다.");
      }
      console.log(JSON.stringify({ verified: true, status: after.status, executeAt: after.executeAt, buysBlockedAt: after.buysBlockedAt }));
    }
  } finally {
    await close();
  }
}

main().catch(() => {
  console.error("시장 종료 계획 처리 실패. 대상 DB, 예약 상태 및 실행 인자를 확인하세요.");
  process.exitCode = 1;
});
