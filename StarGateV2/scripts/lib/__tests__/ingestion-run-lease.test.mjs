import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildExpiredIngestionRun,
  expiredIngestionStats,
} from "../ingestion-run-lease.ts";

const STARTED = new Date("2026-08-05T00:00:00.000Z");
const EXPIRED = new Date("2026-08-05T01:00:00.000Z");

test("expired ingestion stats는 실패 1건을 포함해 항상 schema count 불변식을 지킨다", () => {
  assert.deepEqual(
    expiredIngestionStats({
      discovered: 3,
      processed: 2,
      written: 1,
      skipped: 1,
      blocked: 0,
      failed: 0,
    }),
    {
      discovered: 3,
      processed: 3,
      written: 1,
      skipped: 1,
      blocked: 0,
      failed: 1,
    },
  );
});

test("expired running row는 lease 없는 schema-valid failed audit으로 변환된다", () => {
  const saved = buildExpiredIngestionRun(
    {
      runId: "search-rebuild:test-expired",
      mode: "search-rebuild",
      status: "running",
      dryRun: false,
      sourceIds: [],
      stats: {
        discovered: 0,
        processed: 0,
        written: 0,
        skipped: 0,
        blocked: 0,
        failed: 0,
      },
      errors: [],
      startedAt: STARTED,
      heartbeatAt: STARTED,
      leaseExpiresAt: new Date("2026-08-05T00:30:00.000Z"),
      createdAt: STARTED,
      updatedAt: STARTED,
    },
    EXPIRED,
  );
  assert.equal(saved.status, "failed");
  assert.equal(saved.stats.discovered, 1);
  assert.equal(saved.stats.processed, 1);
  assert.equal(saved.stats.failed, 1);
  assert.equal(saved.leaseExpiresAt, undefined);
  assert.equal(saved.errors.at(-1)?.code, "INGESTION_LEASE_EXPIRED");
});

test("rebuild dry-run return은 stale-run reconciliation보다 먼저 실행된다", async () => {
  const source = await readFile(
    new URL("../../rebuild-lore-index.ts", import.meta.url),
    "utf8",
  );
  const main = source.slice(source.indexOf("async function main"));
  assert.ok(main.indexOf("if (!EXECUTE) return") >= 0);
  assert.ok(main.indexOf("reconcileExpiredIngestionRuns") >= 0);
  assert.ok(
    main.indexOf("if (!EXECUTE) return") <
      main.indexOf("reconcileExpiredIngestionRuns"),
  );
});
