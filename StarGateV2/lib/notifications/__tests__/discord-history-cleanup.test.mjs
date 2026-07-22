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

const {
  isDailyShopRestockMessage,
  isEquipmentResearchCardMessage,
  isScheduledStockMarketWireMessage,
} = await import("../discord-history-cleanup.ts");

function message(title, overrides = {}) {
  return {
    id: "message",
    embeds: [
      {
        title,
        description: "ORDO-NET MARKET WIRE",
        footer: { text: "FIN-MON-01 · 2026-07-22 12:00 KST · 자동 공시" },
        ...overrides,
      },
    ],
  };
}

test("편의점 정리는 일일 입고 공지만 대상으로 삼는다", () => {
  assert.equal(isDailyShopRestockMessage(message("편의점 입고 알림")), true);
  assert.equal(
    isDailyShopRestockMessage(message("편의점 추가 입고 완료")),
    false,
  );
});

test("주식 정리는 정기 공시 묶음만 대상으로 삼는다", () => {
  assert.equal(
    isScheduledStockMarketWireMessage(
      message("재무기구 정기 시세 공시 · 2026-07-22"),
    ),
    true,
  );
  assert.equal(isScheduledStockMarketWireMessage(message("상승 마감 장부")), true);
  assert.equal(
    isScheduledStockMarketWireMessage(message("종목별 마감 장부")),
    true,
  );
  assert.equal(
    isScheduledStockMarketWireMessage(message("🟢 상승 마감 장부")),
    true,
  );
  assert.equal(
    isScheduledStockMarketWireMessage(message("재무기구 특별 시세 공시")),
    false,
  );
  assert.equal(
    isScheduledStockMarketWireMessage(
      message("재무기구 정기 시세 공시", {
        description: "수동 작성",
        footer: { text: "수동 공지" },
      }),
    ),
    false,
  );
});

test("연구 정리는 같은 프로젝트의 카드만 대상으로 삼는다", () => {
  assert.equal(
    isEquipmentResearchCardMessage(
      message("팀 연구 · BIO-02 — 생체 강화"),
      "BIO-02",
    ),
    true,
  );
  assert.equal(
    isEquipmentResearchCardMessage(
      message("팀 연구 · ARM-01 — 방호 강화"),
      "BIO-02",
    ),
    false,
  );
  assert.equal(
    isEquipmentResearchCardMessage(
      message("팀 연구 기여", {
        fields: [{ name: "연구", value: "BIO-02" }],
      }),
      "BIO-02",
    ),
    true,
  );
  assert.equal(
    isEquipmentResearchCardMessage(
      message("팀 연구 가속", {
        fields: [{ name: "연구", value: "ARM-01" }],
      }),
      "BIO-02",
    ),
    false,
  );
});
