import "dotenv/config";

import { applyDueStockMarketShutdown } from "@stargate/shared-db";

import { SharedDbConnectionAdapter } from "../adapters/shared-db-connection.js";
import { loadWorkerMongoConfig } from "../config.js";
import { logger } from "../logger.js";

async function main(): Promise<void> {
  const database = new SharedDbConnectionAdapter(loadWorkerMongoConfig());
  await database.connect();
  try {
    await database.ping();
    const result = await applyDueStockMarketShutdown();
    logger.info("stock_market_shutdown_finished", {
      status: result.status,
      planStatus: result.plan?.status ?? null,
      executeAt: result.plan?.executeAt.toISOString() ?? null,
      appliedTickers: result.status === "APPLIED" ? result.histories.length : 0,
    });
    if (result.status === "NOT_SCHEDULED" || result.status === "NOT_DUE") {
      process.exitCode = 1;
    }
  } finally {
    await database.close();
  }
}

main().catch(() => {
  logger.error(
    "stock_market_shutdown_failed",
    new Error("시장 종료 실행에 실패했습니다."),
  );
  process.exitCode = 1;
});
