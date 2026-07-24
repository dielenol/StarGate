import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) =>
  readFile(new URL(`../../../${path}`, import.meta.url), "utf8");

test("편의점과 주식은 JTEST 영업·거래 접근을 UI와 API에 함께 적용한다", async () => {
  const files = await Promise.all(
    [
      "app/(erp)/erp/shop/page.tsx",
      "app/api/erp/shop/catalog/route.ts",
      "app/api/erp/shop/checkout/route.ts",
      "app/(erp)/erp/stock/page.tsx",
      "app/(erp)/erp/stock/[ticker]/page.tsx",
      "app/api/erp/stocks/buy/route.ts",
      "app/api/erp/stocks/sell/route.ts",
    ].map(source),
  );

  for (const file of files) {
    assert.match(file, /PlayerService/);
  }
});

test("병기부와 공방은 JTEST 플레이어 제한만 우회하고 GM 분기는 유지한다", async () => {
  const [
    data,
    client,
    catalog,
    checkout,
    workshop,
    adminLayout,
  ] = await Promise.all(
    [
      "app/(erp)/erp/equipment-shop/_data.ts",
      "app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
      "app/api/erp/equipment-shop/catalog/route.ts",
      "app/api/erp/equipment-shop/checkout/route.ts",
      "app/api/erp/equipment-shop/workshop-request/route.ts",
      "app/(erp)/erp/admin/layout.tsx",
    ].map(source),
  );

  assert.match(data, /playerServiceTestAccess/);
  assert.match(client, /canBypassPlayerServiceRestrictions/);
  assert.match(client, /playerServiceTestAccess \|\|\s*research\.capabilities\.customWeaponSlot/);
  assert.match(catalog, /hasPlayerServiceTestAccess\(session\.user\)/);
  assert.match(checkout, /canBypassPlayerServiceRestrictions/);
  assert.match(workshop, /hasPlayerServiceTestAccess\(session\.user\)/);

  assert.match(adminLayout, /hasRole\(session\.user\.role, "GM"\)/);
  assert.doesNotMatch(adminLayout, /PlayerServiceTestAccess/);
});
