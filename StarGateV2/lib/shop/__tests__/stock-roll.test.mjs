import { test } from "node:test";
import assert from "node:assert/strict";

import { SHOP_CATALOG } from "../catalog.ts";
import {
  getGuaranteedDailyStock,
  rollShopDailyStock,
} from "../stock-roll.ts";

test("shop catalog restock ranges guarantee at least 1~2 stock", () => {
  for (const item of SHOP_CATALOG) {
    assert.ok(item.stockMin >= 1, `${item.slug} stockMin should be >= 1`);
    assert.ok(item.stockMax >= 2, `${item.slug} stockMax should be >= 2`);
    assert.ok(item.appearRate > 0, `${item.slug} appearRate should be > 0`);
  }
});

test("low probability shop items still receive guaranteed stock", () => {
  assert.equal(
    rollShopDailyStock(
      { stockMin: 1, stockMax: 2, appearRate: 0.2 },
      () => 0.99,
    ),
    1,
  );
});

test("appearRate controls chance to restock at max stock", () => {
  assert.equal(
    rollShopDailyStock(
      { stockMin: 1, stockMax: 2, appearRate: 0.2 },
      () => 0.19,
    ),
    2,
  );
});

test("guaranteed stock never drops below one", () => {
  assert.equal(
    getGuaranteedDailyStock({ stockMin: 0, stockMax: 0, appearRate: 0 }),
    1,
  );
});
