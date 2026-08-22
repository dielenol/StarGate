import assert from "node:assert/strict";
import test from "node:test";

import {
  requestDailyResearchRankingState,
  researchRankingSourceRevision,
} from "../dist/jobs/research-ranking.js";
import { createDefaultScheduledJobHandlers } from "../dist/jobs/default-handlers.js";

function rankingRow(overrides = {}) {
  return {
    contributorCharacterId: "character-1",
    contributorCodename: "ALPHA",
    totalCredits: 1_000,
    contributionCount: 3,
    lastContributedAt: new Date("2026-08-22T11:30:00.000Z"),
    ...overrides,
  };
}

function makeStateDb() {
  let state = null;
  const filters = [];
  const updates = [];
  return {
    get state() {
      return state;
    },
    get filters() {
      return filters;
    },
    get updates() {
      return updates;
    },
    db: {
      collection() {
        return {
          async updateOne(filter, update) {
            filters.push(filter);
            updates.push(update);
            const sameRevision =
              state?.desiredDate === update.$set.desiredDate &&
              state?.desiredSourceRevision === update.$set.desiredSourceRevision &&
              state?.desiredFormatRevision === update.$set.desiredFormatRevision;
            const monotonic =
              !state ||
              state.desiredDate < update.$set.desiredDate ||
              (state.desiredDate === update.$set.desiredDate &&
                (!state.desiredGeneratedAt ||
                  state.desiredGeneratedAt <= update.$set.desiredGeneratedAt));
            if (sameRevision || !monotonic) {
              return { matchedCount: 0, upsertedCount: 0 };
            }
            state = {
              ...(state ?? update.$setOnInsert),
              _id: filter._id,
              ...update.$set,
              requestedRevision: (state?.requestedRevision ?? 0) + 1,
            };
            return state.requestedRevision === 1
              ? { matchedCount: 0, upsertedCount: 1 }
              : { matchedCount: 1, upsertedCount: 0 };
          },
        };
      },
    },
  };
}

test("같은 KST 날짜와 source hash 재시도는 revision을 늘리지 않는다", async () => {
  const fixture = makeStateDb();
  let rows = [rankingRow()];
  const dependencies = {
    async listRankings() {
      return rows;
    },
    async getDbImpl() {
      return fixture.db;
    },
    siteBaseUrl: "https://www.ordonet.co.kr",
  };

  const first = await requestDailyResearchRankingState(
    "2026-08-22",
    new Date("2026-08-22T12:00:00.000Z"),
    dependencies,
  );
  const retried = await requestDailyResearchRankingState(
    "2026-08-22",
    new Date("2026-08-22T12:01:00.000Z"),
    dependencies,
  );

  assert.equal(first.status, "requested");
  assert.equal(retried.status, "current");
  assert.equal(fixture.state.requestedRevision, 1);
  assert.equal(
    fixture.state.desiredGeneratedAt.toISOString(),
    "2026-08-22T12:00:00.000Z",
  );
  assert.equal(fixture.state.publicSnapshot.generatedAt, "2026-08-22T12:00:00.000Z");
  assert.equal(fixture.state.desiredPayloads.length, 1);
  assert.deepEqual(fixture.state.desiredPayloads[0].allowed_mentions, { parse: [] });
  assert.equal(first.sourceRevision, researchRankingSourceRevision(rows));

  rows = [rankingRow({ totalCredits: 1_500, contributionCount: 4 })];
  const changed = await requestDailyResearchRankingState(
    "2026-08-22",
    new Date("2026-08-22T12:02:00.000Z"),
    dependencies,
  );
  assert.equal(changed.status, "requested");
  assert.equal(fixture.state.requestedRevision, 2);
  assert.equal(fixture.state.publicSnapshot.items[0].totalCredits, 1_500);
});

test("같은 날짜의 오래된 실행은 최신 snapshot을 뒤늦게 덮어쓰지 않는다", async () => {
  const fixture = makeStateDb();
  let releaseOldDb;
  let oldReadCompleted;
  const oldRead = new Promise((resolve) => {
    oldReadCompleted = resolve;
  });
  const oldDbGate = new Promise((resolve) => {
    releaseOldDb = resolve;
  });

  const oldRequest = requestDailyResearchRankingState(
    "2026-08-22",
    new Date("2026-08-22T12:00:00.000Z"),
    {
      async listRankings() {
        return [rankingRow({ totalCredits: 1_000 })];
      },
      async getDbImpl() {
        oldReadCompleted();
        await oldDbGate;
        return fixture.db;
      },
      siteBaseUrl: "https://www.ordonet.co.kr",
    },
  );
  await oldRead;

  const newer = await requestDailyResearchRankingState(
    "2026-08-22",
    new Date("2026-08-22T12:05:00.000Z"),
    {
      async listRankings() {
        return [rankingRow({ totalCredits: 1_500, contributionCount: 4 })];
      },
      async getDbImpl() {
        return fixture.db;
      },
      siteBaseUrl: "https://www.ordonet.co.kr",
    },
  );
  releaseOldDb();
  const older = await oldRequest;

  assert.equal(newer.status, "requested");
  assert.equal(older.status, "current");
  assert.equal(fixture.state.requestedRevision, 1);
  assert.equal(fixture.state.publicSnapshot.items[0].totalCredits, 1_500);
  assert.equal(
    fixture.state.desiredGeneratedAt.toISOString(),
    "2026-08-22T12:05:00.000Z",
  );

  const olderFilter = fixture.filters.at(-1);
  const sameDateBranch = olderFilter.$or.find(
    (branch) => branch.desiredDate === "2026-08-22",
  );
  assert.deepEqual(sameDateBranch.$and[0], {
    $or: [
      { desiredGeneratedAt: { $exists: false } },
      {
        desiredGeneratedAt: {
          $lte: new Date("2026-08-22T12:00:00.000Z"),
        },
      },
    ],
  });
});

test("빈 순위는 공개 empty snapshot을 저장하고 Discord 카드를 요청하지 않는다", async () => {
  const fixture = makeStateDb();
  await requestDailyResearchRankingState(
    "2026-08-22",
    new Date("2026-08-22T12:00:00.000Z"),
    {
      async listRankings() {
        return [];
      },
      async getDbImpl() {
        return fixture.db;
      },
      siteBaseUrl: "https://www.ordonet.co.kr",
    },
  );

  assert.deepEqual(fixture.state.publicSnapshot.items, []);
  assert.deepEqual(fixture.state.desiredPayloads, []);
});

test("새 일일 revision은 retry backoff만 해제하고 격리 오류 원인은 보존한다", async () => {
  const fixture = makeStateDb();
  await requestDailyResearchRankingState(
    "2026-08-22",
    new Date("2026-08-22T12:00:00.000Z"),
    {
      async listRankings() {
        return [rankingRow()];
      },
      async getDbImpl() {
        return fixture.db;
      },
      siteBaseUrl: "https://www.ordonet.co.kr",
    },
  );

  assert.deepEqual(fixture.updates[0].$unset, { nextAttemptAt: "" });
  assert.equal("lastError" in fixture.updates[0].$unset, false);
});

test("daily ranking handler는 KST 일일 slot과 취소 신호를 전달한다", async () => {
  let received;
  const handlers = createDefaultScheduledJobHandlers({
    async requestResearchRanking(date, generatedAt, dependencies) {
      received = { date, generatedAt, signal: dependencies.signal };
      return {
        status: "requested",
        contributorCount: 3,
        sourceRevision: "source-hash",
      };
    },
  });
  const requestedAt = new Date("2026-08-22T12:00:00.000Z");
  const signal = new AbortController().signal;
  const summary = await handlers.require("research.daily-ranking").execute({
    jobName: "research.daily-ranking",
    slotKey: "2026-08-22",
    requestedAt,
    mode: "active",
    signal,
  });

  assert.deepEqual(received, {
    date: "2026-08-22",
    generatedAt: requestedAt,
    signal,
  });
  assert.equal(summary.contributors, 3);
  assert.equal(summary.mutated, true);
});
