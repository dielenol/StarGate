import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return {
        url: pathToFileURL(resolve(rootDir, `${specifier.slice(2)}.ts`)).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
const {
  getNextStockScheduledEventDate,
  normalizeStockScheduledEventChangePercent,
  resolveStockScheduledEventExecuteAt,
} = await import("../scheduled-event.ts");

test("KST 정기 이벤트 일자는 실제 달력의 12:00 슬롯만 허용한다", () => {
  assert.equal(
    resolveStockScheduledEventExecuteAt("2026-08-14")?.toISOString(),
    "2026-08-14T03:00:00.000Z",
  );
  assert.equal(resolveStockScheduledEventExecuteAt("2026-08-32"), null);
  assert.equal(resolveStockScheduledEventExecuteAt("2026-8-14"), null);
});

test("다음 정기 이벤트 일자는 당일 12시 전에는 오늘, 이후에는 내일이다", () => {
  assert.equal(
    getNextStockScheduledEventDate(new Date("2026-08-14T02:59:59.999Z")),
    "2026-08-14",
  );
  assert.equal(
    getNextStockScheduledEventDate(new Date("2026-08-14T03:00:00.000Z")),
    "2026-08-15",
  );
});

test("예약 변동률은 소수 둘째 자리로 고정한다", () => {
  assert.equal(normalizeStockScheduledEventChangePercent(-50.001), -50);
  assert.equal(normalizeStockScheduledEventChangePercent(12.345), 12.35);
});
