import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionCandidates = ["", ".ts", ".tsx", ".js", ".mjs"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const basePath = specifier.startsWith("@/")
      ? resolve(rootDir, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(fileURLToPath(context.parentURL)), specifier)
        : null;
    if (basePath) {
      for (const extension of extensionCandidates) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const originalMongoUri = process.env.MONGODB_URI;
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/stargate-test";
const { requestScheduledStockMarketWireSync } = await import(
  "../../db/stock-market-wire.ts"
);
if (originalMongoUri === undefined) {
  delete process.env.MONGODB_URI;
} else {
  process.env.MONGODB_URI = originalMongoUri;
}

function matches(state, filter) {
  if (!state || state._id !== filter._id) return false;
  if (!filter.$or) return true;
  return filter.$or.some((condition) => {
    const [field, predicate] = Object.entries(condition)[0];
    if ("$ne" in predicate) return state[field] !== predicate.$ne;
    if ("$exists" in predicate) {
      return Object.hasOwn(state, field) === predicate.$exists;
    }
    return false;
  });
}

function applyUpdate(state, update, inserted) {
  if (inserted && update.$setOnInsert) {
    Object.assign(state, structuredClone(update.$setOnInsert));
  }
  if (update.$inc) {
    for (const [field, amount] of Object.entries(update.$inc)) {
      state[field] = (state[field] ?? 0) + amount;
    }
  }
  if (update.$set) {
    Object.assign(state, structuredClone(update.$set));
  }
  if (update.$unset) {
    for (const field of Object.keys(update.$unset)) delete state[field];
  }
}

function makeCollection(initialState) {
  let state = structuredClone(initialState);
  return {
    get state() {
      return state;
    },
    async updateOne(filter, update, options = {}) {
      if (matches(state, filter)) {
        applyUpdate(state, update, false);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }
      if (!state && options.upsert) {
        state = { _id: filter._id };
        applyUpdate(state, update, true);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    },
  };
}

test("구형 1×4 상태는 한 번만 4×1로 갱신하고 같은 재요청은 no-op 처리한다", async () => {
  const collection = makeCollection({
    _id: "scheduled",
    requestedRevision: 1,
    syncedRevision: 1,
    desiredDate: "2026-08-11",
    desiredSourceRevision: "same-stock-prices",
    desiredPayloads: [{ embeds: [{}, {}, {}, {}] }],
    createdAt: new Date("2026-08-11T03:00:00.000Z"),
    updatedAt: new Date("2026-08-11T03:00:00.000Z"),
  });
  const args = {
    date: "2026-08-11",
    sourceRevision: "same-stock-prices",
    formatRevision: "four-single-embed-messages-v1",
    payloads: Array.from({ length: 4 }, () => ({ embeds: [{}] })),
  };

  const migrated = await requestScheduledStockMarketWireSync(args, {
    collection,
  });

  assert.equal(migrated, "requested");
  assert.equal(collection.state.requestedRevision, 2);
  assert.equal(
    collection.state.desiredFormatRevision,
    "four-single-embed-messages-v1",
  );
  assert.deepEqual(
    collection.state.desiredPayloads.map((payload) => payload.embeds.length),
    [1, 1, 1, 1],
  );

  const current = await requestScheduledStockMarketWireSync(args, {
    collection,
  });

  assert.equal(current, "current");
  assert.equal(collection.state.requestedRevision, 2);
});

test("동일한 최초 요청이 겹쳐도 desired revision은 한 번만 생성한다", async () => {
  const collection = makeCollection(null);
  const args = {
    date: "2026-08-11",
    sourceRevision: "same-stock-prices",
    formatRevision: "four-single-embed-messages-v1",
    payloads: Array.from({ length: 4 }, () => ({ embeds: [{}] })),
  };

  const results = await Promise.all([
    requestScheduledStockMarketWireSync(args, { collection }),
    requestScheduledStockMarketWireSync(args, { collection }),
  ]);

  assert.deepEqual(results.sort(), ["current", "requested"]);
  assert.equal(collection.state.requestedRevision, 1);
  assert.equal(collection.state.desiredPayloads.length, 4);
});
