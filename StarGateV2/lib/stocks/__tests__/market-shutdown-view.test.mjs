import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return { url: pathToFileURL(resolve(rootDir, `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { serializeStockMarketState } = await import("../novex.ts");
const plan = {
  status: "SCHEDULED",
  executeAt: new Date("2026-09-07T09:00:00Z"),
  buysBlockedAt: new Date("2026-09-07T07:00:00Z"),
  reason: "파리 사태로 인한 쇼크",
};

test("18시 전에는 미래 하락률을 노출하지 않고 매도 전용과 종료 시각을 표시한다", () => {
  const view = serializeStockMarketState(null, new Date("2026-09-07T08:59:59.999Z"), plan);
  assert.equal(view.tradingMode, "SELL_ONLY");
  assert.equal(view.status, "OPEN");
  assert.equal(view.liquidationPending, false);
  assert.equal(view.shutdownAt, "2026-09-07T09:00:00.000Z");
  assert.equal(view.opensAt, null);
  assert.match(view.reason, /보유 주식만 매도/);
});

test("18시 경계에서 폭락 확정이 지연되면 옛 가격의 매도를 잠근다", () => {
  const view = serializeStockMarketState(null, new Date("2026-09-07T09:00:00Z"), plan);
  assert.equal(view.status, "CLOSED");
  assert.equal(view.liquidationPending, true);
  assert.equal(view.delayed, false);
  assert.deepEqual(view.pendingSlotKeys, []);
});

test("종료 완료 다음 날에도 재개장·가격 갱신 없이 매도만 허용한다", () => {
  const view = serializeStockMarketState(null, new Date("2026-09-08T00:00:00Z"), { ...plan, status: "COMPLETED" });
  assert.equal(view.status, "CLOSED");
  assert.equal(view.tradingMode, "SELL_ONLY");
  assert.equal(view.liquidationPending, false);
  assert.equal(view.nextPriceSlotAt, null);
  assert.equal(view.opensAt, null);
  assert.match(view.reason, /파리 사태로 인한 쇼크/);
});
