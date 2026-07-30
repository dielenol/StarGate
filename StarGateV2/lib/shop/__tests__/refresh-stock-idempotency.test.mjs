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
process.env.MONGODB_URI =
  originalMongoUri ?? "mongodb://127.0.0.1:27017/stargate-test";
const { ensureDailyStockRefresh } = await import("../refresh-stock.ts");
const { SHOP_CATALOG } = await import("../catalog.ts");
if (originalMongoUri === undefined) delete process.env.MONGODB_URI;

test("100 concurrent refresh runs count each item/date exactly once", async () => {
  const refreshedKeys = new Set();
  const refreshIfStale = async (itemId, _stock, today) => {
    const key = `${itemId}:${today}`;
    if (refreshedKeys.has(key)) return false;
    refreshedKeys.add(key);
    await Promise.resolve();
    return true;
  };
  const now = new Date("2026-07-27T02:00:00.000Z");

  const summaries = await Promise.all(
    Array.from({ length: 100 }, () =>
      ensureDailyStockRefresh(now, {
        refreshIfStale,
        rollStock: () => 1,
        catalog: SHOP_CATALOG,
      }),
    ),
  );

  assert.equal(
    summaries.reduce((sum, summary) => sum + summary.refreshed, 0),
    SHOP_CATALOG.length,
  );
  assert.equal(refreshedKeys.size, SHOP_CATALOG.length);
  assert.ok(
    summaries.every((summary) => summary.today === "2026-07-27"),
  );
});
