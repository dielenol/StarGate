import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CLIENT_URL = new URL(
  "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
  import.meta.url,
);

test("사격 자격시험은 병기부 초기 번들과 분리해 필요할 때만 불러온다", async () => {
  const source = await readFile(CLIENT_URL, "utf8");

  assert.match(source, /import dynamic from "next\/dynamic"/);
  assert.match(
    source,
    /dynamic\(\(\) => import\("\.\/TowaskiLicenseTest"\), \{[\s\S]*ssr: false/,
  );
  assert.doesNotMatch(
    source,
    /import TowaskiLicenseTest from "\.\/TowaskiLicenseTest"/,
  );
  assert.match(source, /showTowaskiLicenseTest \? \([\s\S]*<TowaskiLicenseTest/);
});
