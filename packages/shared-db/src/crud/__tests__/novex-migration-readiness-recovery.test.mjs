import assert from "node:assert/strict";
import test from "node:test";

import {
  NOVEX_INDEX_DEFINITIONS,
  claimNovex2MigrationReadiness,
  inspectNovex2Migration,
  novex2MigrationPlanFingerprint,
  recoverNovex2MigrationReadiness,
} from "../../../dist/index.js";

function cursor(rows) {
  const value = {
    sort() {
      return value;
    },
    async toArray() {
      return rows;
    },
  };
  return value;
}

function createReadinessDb({
  missingReferencePrice = false,
  initialStatus = "APPLYING",
} = {}) {
  let marker = initialStatus === null
    ? null
    : {
        _id: "novex-2",
        version: 2,
        status: initialStatus,
        attemptId: "attempt-exact",
        sourcePlanFingerprint: "source-plan",
        startedAt: new Date("2026-08-17T00:00:00.000Z"),
        updatedAt: new Date("2026-08-17T00:00:00.000Z"),
      };
  const markerUpdates = [];
  const db = {
    collection(name) {
      return {
        async indexes() {
          if (name === "stock_price_history") {
            return [{
              key: { createdAt: 1 },
              name: "stock_price_history_createdAt",
            }];
          }
          return (NOVEX_INDEX_DEFINITIONS[name] ?? []).map((definition) => ({
            ...definition,
          }));
        },
        aggregate() {
          return {
            async next() {
              return null;
            },
          };
        },
        find() {
          if (name === "stock_prices") {
            return cursor(
              missingReferencePrice ? [{ ticker: "STM", price: 3 }] : [],
            );
          }
          return cursor([]);
        },
        async findOne() {
          return name === "stock_market_migration_readiness" ? marker : null;
        },
        async updateOne(filter, update, options) {
          if (name !== "stock_market_migration_readiness") {
            throw new Error(`unexpected update: ${name}`);
          }
          markerUpdates.push({ filter, update });
          if (!marker) {
            if (!options?.upsert) {
              return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
            }
            marker = { _id: filter._id, ...(update.$set ?? {}) };
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
          }
          const statusMatches =
            filter.status && typeof filter.status === "object" && "$ne" in filter.status
              ? marker.status !== filter.status.$ne
              : filter.status && typeof filter.status === "object" && "$in" in filter.status
                ? filter.status.$in.includes(marker.status)
              : marker.status === filter.status;
          if (
            marker?._id !== filter._id ||
            !statusMatches ||
            (filter.version !== undefined && marker.version !== filter.version) ||
            (filter.attemptId !== undefined && marker.attemptId !== filter.attemptId) ||
            (filter.sourcePlanFingerprint !== undefined &&
              marker.sourcePlanFingerprint !== filter.sourcePlanFingerprint) ||
            (filter.updatedAt !== undefined && marker.updatedAt !== filter.updatedAt)
          ) {
            if (options?.upsert && marker) {
              throw Object.assign(new Error("duplicate"), { code: 11000 });
            }
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
          }
          marker = { ...marker, ...(update.$set ?? {}) };
          for (const key of Object.keys(update.$unset ?? {})) delete marker[key];
          return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        },
      };
    },
  };
  return {
    db,
    markerUpdates,
    get marker() {
      return marker;
    },
  };
}

async function currentFingerprint(db) {
  return novex2MigrationPlanFingerprint(await inspectNovex2Migration(db));
}

test("crash recovery는 fresh plan과 exact APPLYING attempt CAS로만 READY를 기록한다", async () => {
  const fixture = createReadinessDb();
  const fingerprint = await currentFingerprint(fixture.db);
  const recoveredAt = new Date("2026-08-17T01:00:00.000Z");

  const result = await recoverNovex2MigrationReadiness(fixture.db, {
    mode: "MARK_READY",
    expectedAttemptId: "attempt-exact",
    expectedPlanFingerprint: fingerprint,
    now: recoveredAt,
  });

  assert.deepEqual(result, {
    attemptId: "attempt-exact",
    status: "READY",
    inspectedPlanFingerprint: fingerprint,
    blockers: [],
  });
  assert.deepEqual(fixture.markerUpdates[0].filter, {
    _id: "novex-2",
    version: 2,
    status: "APPLYING",
    attemptId: "attempt-exact",
    sourcePlanFingerprint: "source-plan",
    updatedAt: new Date("2026-08-17T00:00:00.000Z"),
  });
  assert.equal(fixture.marker.status, "READY");
  assert.equal(fixture.marker.readyPlanFingerprint, fingerprint);
  assert.equal(fixture.marker.completedAt, recoveredAt);

  await assert.rejects(
    recoverNovex2MigrationReadiness(fixture.db, {
      mode: "MARK_READY",
      expectedAttemptId: "attempt-exact",
      expectedPlanFingerprint: fingerprint,
    }),
    /NOVEX_MIGRATION_RECOVERY_NOT_APPLYING/,
  );
});

test("crash recovery는 stale plan 또는 다른 attempt면 marker를 변경하지 않는다", async () => {
  const stale = createReadinessDb();
  await assert.rejects(
    recoverNovex2MigrationReadiness(stale.db, {
      mode: "MARK_READY",
      expectedAttemptId: "attempt-exact",
      expectedPlanFingerprint: "0".repeat(64),
    }),
    /NOVEX_MIGRATION_RECOVERY_PLAN_CHANGED/,
  );
  assert.equal(stale.markerUpdates.length, 0);

  const wrongOwner = createReadinessDb();
  const fingerprint = await currentFingerprint(wrongOwner.db);
  await assert.rejects(
    recoverNovex2MigrationReadiness(wrongOwner.db, {
      mode: "MARK_READY",
      expectedAttemptId: "attempt-other",
      expectedPlanFingerprint: fingerprint,
    }),
    /NOVEX_MIGRATION_RECOVERY_ATTEMPT_CHANGED/,
  );
  assert.equal(wrongOwner.markerUpdates.length, 0);
});

test("NOVEX-2 claim은 PRE_MIGRATION/BLOCKED만 재개하고 READY one-shot marker는 보존한다", async () => {
  const absent = createReadinessDb({ initialStatus: null });
  await claimNovex2MigrationReadiness(absent.db, {
    sourcePlanFingerprint: "initial-plan",
    attemptId: "attempt-initial",
    now: new Date("2026-08-17T00:30:00.000Z"),
  });
  assert.equal(absent.marker.status, "APPLYING");
  assert.equal(absent.marker.attemptId, "attempt-initial");

  const preMigration = createReadinessDb({ initialStatus: "PRE_MIGRATION" });
  await claimNovex2MigrationReadiness(preMigration.db, {
    sourcePlanFingerprint: "approved-plan",
    attemptId: "attempt-after-writer",
    now: new Date("2026-08-17T00:45:00.000Z"),
  });
  assert.equal(preMigration.marker.status, "APPLYING");
  assert.equal(preMigration.marker.attemptId, "attempt-after-writer");

  const ready = createReadinessDb({ initialStatus: "READY" });
  await assert.rejects(
    claimNovex2MigrationReadiness(ready.db, {
      sourcePlanFingerprint: "next-plan",
      attemptId: "attempt-next",
    }),
    /NOVEX_MIGRATION_ALREADY_READY/,
  );
  assert.equal(ready.marker.status, "READY");
  assert.equal(ready.marker.attemptId, "attempt-exact");
  assert.deepEqual(ready.markerUpdates[0].filter, {
    _id: "novex-2",
    status: { $in: ["PRE_MIGRATION", "BLOCKED"] },
  });
});

test("남은 blocker가 있는 crash attempt는 READY가 아니라 BLOCKED로만 폐기한다", async () => {
  const fixture = createReadinessDb({ missingReferencePrice: true });
  const fingerprint = await currentFingerprint(fixture.db);

  await assert.rejects(
    recoverNovex2MigrationReadiness(fixture.db, {
      mode: "MARK_READY",
      expectedAttemptId: "attempt-exact",
      expectedPlanFingerprint: fingerprint,
    }),
    /NOVEX_MIGRATION_RECOVERY_STILL_BLOCKED/,
  );
  assert.equal(fixture.markerUpdates.length, 0);

  const result = await recoverNovex2MigrationReadiness(fixture.db, {
    mode: "ABANDON_BLOCKED",
    expectedAttemptId: "attempt-exact",
    expectedPlanFingerprint: fingerprint,
    now: new Date("2026-08-17T01:00:00.000Z"),
  });
  assert.equal(result.status, "BLOCKED");
  assert.match(result.blockers.join(" "), /referencePrice/);
  assert.equal(fixture.marker.status, "BLOCKED");
  assert.equal(fixture.marker.blockedPlanFingerprint, fingerprint);
  assert.deepEqual(fixture.marker.blockers, result.blockers);

  const nextAttemptAt = new Date("2026-08-17T02:00:00.000Z");
  await claimNovex2MigrationReadiness(fixture.db, {
    sourcePlanFingerprint: "next-approved-plan",
    attemptId: "attempt-next",
    now: nextAttemptAt,
  });
  assert.equal(fixture.marker.status, "APPLYING");
  assert.equal(fixture.marker.attemptId, "attempt-next");
  assert.equal(fixture.marker.blockedPlanFingerprint, undefined);
  assert.equal(fixture.marker.blockers, undefined);

  const readyFixture = createReadinessDb();
  const readyFingerprint = await currentFingerprint(readyFixture.db);
  await assert.rejects(
    recoverNovex2MigrationReadiness(readyFixture.db, {
      mode: "ABANDON_BLOCKED",
      expectedAttemptId: "attempt-exact",
      expectedPlanFingerprint: readyFingerprint,
    }),
    /NOVEX_MIGRATION_RECOVERY_READY_CANNOT_BE_ABANDONED/,
  );
  assert.equal(readyFixture.markerUpdates.length, 0);
});
