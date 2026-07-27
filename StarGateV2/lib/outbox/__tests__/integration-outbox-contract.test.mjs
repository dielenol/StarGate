import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../", import.meta.url);
const REPO_ROOT = new URL("../../../../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("웹 production 코드에는 next/server after delivery가 남지 않는다", async () => {
  const paths = [
    "lib/notifications/gm-admin-audit.ts",
    "app/api/erp/characters/[id]/route.ts",
    "app/api/erp/equipment-shop/workshop-request/route.ts",
    "app/api/erp/trades/route.ts",
    "app/api/erp/trades/[tradeId]/route.ts",
    "app/api/erp/shop/reorder-request/route.ts",
  ];
  const sources = await Promise.all(paths.map(read));

  for (const source of sources) {
    assert.doesNotMatch(source, /from "next\/server";[\s\S]*\bafter\b/);
    assert.doesNotMatch(source, /\bafter\(/);
  }
});

test("외부 전달은 versioned kind와 unique dedupeKey 계약을 사용한다", async () => {
  const [helper, workerTypes, indexes] = await Promise.all([
    read("lib/outbox/integration.ts"),
    readFile(
      new URL("packages/shared-db/src/types/worker.ts", REPO_ROOT),
      "utf8",
    ),
    readFile(
      new URL("packages/shared-db/src/indexes.ts", REPO_ROOT),
      "utf8",
    ),
  ]);

  for (const kind of [
    "GM_ADMIN_AUDIT",
    "CHARACTER_EDIT_WEBHOOK",
    "EQUIPMENT_WORKSHOP_WEBHOOK",
    "SHOP_REORDER_REQUEST_WEBHOOK",
    "SHOP_REORDER_FULFILLED_WEBHOOK",
    "STOCK_MANUAL_INTERVENTION_WEBHOOK",
    "PLAYER_TRADE_DM",
  ]) {
    assert.match(workerTypes, new RegExp(`"${kind}"`));
    assert.match(helper, new RegExp(`kind: "${kind}"`));
  }
  assert.match(helper, /version: 1/);
  assert.match(indexes, /integration_outbox_dedupeKey_unique/);
});
