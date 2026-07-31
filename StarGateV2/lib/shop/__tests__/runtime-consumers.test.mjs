import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CONSUMERS = [
  // page + catalog route 의 공유 빌더 (직접 소비자)
  "../../../app/(erp)/erp/shop/_data.ts",
  "../../../app/api/erp/shop/checkout/route.ts",
  "../../../app/api/erp/shop/consume/route.ts",
  "../../../app/api/erp/shop/inventory/route.ts",
  "../../../app/api/erp/shop/reorder-request/route.ts",
  "../../../app/api/erp/shop/admin/stock/route.ts",
  "../../../app/api/erp/shop/admin/reorder-requests/fulfill/route.ts",
  "../../../app/api/erp/shop/admin/reorder-requests/fulfill-batch/route.ts",
].map((path) => new URL(path, import.meta.url));

// 공유 빌더(shop/_data.ts)를 경유하는 소비자 — 빌더 import 로 계약 충족.
const BUILDER_CONSUMERS = [
  "../../../app/(erp)/erp/shop/page.tsx",
  "../../../app/api/erp/shop/catalog/route.ts",
].map((path) => new URL(path, import.meta.url));

test("all shop state-transition consumers resolve the runtime catalog", async () => {
  for (const consumer of CONSUMERS) {
    const source = await readFile(consumer, "utf8");
    assert.match(
      source,
      /(?:loadRuntimeShopCatalog|findRuntimeShopItemBySlug)/,
      consumer.pathname,
    );
    assert.doesNotMatch(
      source,
      /from ["']@\/lib\/shop\/catalog["']/,
      consumer.pathname,
    );
  }
  for (const consumer of BUILDER_CONSUMERS) {
    const source = await readFile(consumer, "utf8");
    assert.match(source, /buildShopCatalogResponse/, consumer.pathname);
    assert.doesNotMatch(
      source,
      /from ["']@\/lib\/shop\/catalog["']/,
      consumer.pathname,
    );
  }
});

test("daily refresh and restock notice use the same runtime catalog", async () => {
  const refresh = await readFile(new URL("../refresh-stock.ts", import.meta.url), "utf8");
  const notice = await readFile(
    new URL("../restock-notification.ts", import.meta.url),
    "utf8",
  );

  assert.match(refresh, /loadRuntimeShopCatalog\(\)/);
  assert.match(notice, /loadRuntimeShopCatalog\(\)/);
  assert.match(notice, /catalog\.every/);
  assert.match(notice, /catalog\.map/);
});
