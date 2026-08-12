import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

import { TEMPER_MOOD_ASSETS } from "../../assets/npcs.ts";

const COMPONENT_URL = new URL(
  "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
  import.meta.url,
);

test("Temper mood portraits are wired to optimized public assets", async () => {
  const source = await readFile(COMPONENT_URL, "utf8");

  assert.match(source, /TEMPER_MOOD_ASSETS,/);
  assert.match(source, /TEMPER_MOOD_ASSETS\[temperMood\]/);

  for (const assetPath of Object.values(TEMPER_MOOD_ASSETS)) {
    const filename = assetPath.split("/").at(-1);
    const assetUrl = new URL(
      `../../../public/assets/npcs/${filename}`,
      import.meta.url,
    );

    await access(assetUrl);
    assert.ok((await stat(assetUrl)).size > 100_000, `${filename} is unexpectedly small`);
  }
});
