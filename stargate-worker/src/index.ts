import "dotenv/config";

import { loadWorkerConfig } from "./config.js";
import { logger } from "./logger.js";
import { WorkerRuntime } from "./runtime.js";

const SHUTDOWN_TIMEOUT_MS = 15_000;

async function main(): Promise<void> {
  const runtime = new WorkerRuntime(loadWorkerConfig());

  const shutdown = (signal: NodeJS.Signals) => {
    const timeout = setTimeout(() => {
      logger.error(
        "worker_shutdown_timeout",
        new Error(`${SHUTDOWN_TIMEOUT_MS}ms 안에 종료하지 못했습니다.`),
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    void runtime
      .stop(signal)
      .then(() => {
        clearTimeout(timeout);
      })
      .catch((error) => {
        logger.error("worker_shutdown_failed", error);
        process.exitCode = 1;
      });
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await runtime.start();
}

main().catch((error) => {
  logger.error("worker_fatal", error);
  process.exitCode = 1;
});
