import "dotenv/config";

import { SharedDbConnectionAdapter } from "../adapters/shared-db-connection.js";
import { SharedDbScheduledJobCoordinator } from "../adapters/shared-db-job-coordinator.js";
import {
  loadWorkerMode,
  loadWorkerMongoConfig,
} from "../config.js";
import { createDefaultScheduledJobHandlers } from "../jobs/default-handlers.js";
import {
  ScheduledJobDispatcher,
  UnknownScheduledJobError,
  parseScheduledJobName,
} from "../jobs/dispatcher.js";
import { ScheduledJobHandlerUnavailableError } from "../jobs/handler-registry.js";
import { logger } from "../logger.js";

async function main(): Promise<void> {
  const rawJobName = process.argv[2]?.trim();
  if (!rawJobName) {
    throw new UnknownScheduledJobError("(missing)");
  }

  const jobName = parseScheduledJobName(rawJobName);
  const mode = loadWorkerMode();
  if (mode === "shadow") {
    const result = await new ScheduledJobDispatcher(mode).dispatch(jobName);
    logger.info("scheduled_job_finished", {
      jobName: result.jobName,
      slotKey: result.slotKey,
      outcome: result.outcome,
      summary: result.summary,
    });
    return;
  }

  const handlers = createDefaultScheduledJobHandlers();
  handlers.require(jobName);
  const database = new SharedDbConnectionAdapter(loadWorkerMongoConfig());
  await database.connect();
  try {
    await database.ping();
    const dispatcher = new ScheduledJobDispatcher(
      mode,
      new SharedDbScheduledJobCoordinator(handlers),
    );
    const result = await dispatcher.dispatch(jobName);
    logger.info("scheduled_job_finished", {
      jobName: result.jobName,
      slotKey: result.slotKey,
      outcome: result.outcome,
      summary: result.summary,
    });
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  logger.error("scheduled_job_failed", error);
  process.exitCode =
    error instanceof UnknownScheduledJobError
      ? 64
      : error instanceof ScheduledJobHandlerUnavailableError
        ? 78
        : 1;
});
