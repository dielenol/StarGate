import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const COMPONENT_URL = new URL(
  "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
  import.meta.url,
);

const MOOD_ASSETS = {
  inspect: "Brigid-Kane-Temper-inspect.webp",
  balance: "Brigid-Kane-Temper-balance.webp",
  cart: "Brigid-Kane-Temper-cart.webp",
  checkout: "Brigid-Kane-Temper-checkout.webp",
  blocked: "Brigid-Kane-Temper-blocked.webp",
  idle: "Brigid-Kane-Temper-idle.webp",
};

test("Temper mood portraits are wired to optimized public assets", async () => {
  const source = await readFile(COMPONENT_URL, "utf8");

  assert.match(source, /TEMPER_MOOD_ASSETS\[temperMood\]/);

  for (const [mood, filename] of Object.entries(MOOD_ASSETS)) {
    const assetUrl = new URL(`../../../public/assets/npcs/${filename}`, import.meta.url);

    await access(assetUrl);
    assert.ok((await stat(assetUrl)).size > 100_000, `${filename} is unexpectedly small`);
    assert.match(source, new RegExp(`${mood}: [^\\n]*${filename}`));
  }
});
