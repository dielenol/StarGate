import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

const COMPONENT_URL = new URL(
  "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
  import.meta.url,
);

const MOOD_ASSETS = {
  welcome: "Ameri-welcome.webp",
  routing: "Ameri-routing.webp",
  review: "Ameri-review.webp",
  blocked: "Ameri-blocked.webp",
  idle: "Ameri-idle.webp",
};

test("AMERI mood portraits are wired to optimized public assets", async () => {
  const source = await readFile(COMPONENT_URL, "utf8");

  assert.match(source, /AMERI_MOOD_ASSETS\[ameriMood\]/);
  assert.match(source, /src=\{ameriPortraitSrc\}/);

  for (const [mood, filename] of Object.entries(MOOD_ASSETS)) {
    const assetUrl = new URL(
      `../../../public/assets/npcs/${filename}`,
      import.meta.url,
    );

    await access(assetUrl);
    assert.ok(
      (await stat(assetUrl)).size > 100_000,
      `${filename} is unexpectedly small`,
    );
    assert.match(source, new RegExp(`${mood}: [^\\n]*${filename}`));
  }
});
