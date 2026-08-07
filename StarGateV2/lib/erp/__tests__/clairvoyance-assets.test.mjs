import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const projectRoot = new URL("../../../", import.meta.url);
const assetPayload = JSON.parse(
  await readFile(
    new URL(
      "scripts/seed-payloads/zz-clairvoyance-account-assets-2026-08-07.json",
      projectRoot,
    ),
    "utf8",
  ),
);
const basePayload = JSON.parse(
  await readFile(
    new URL("scripts/seed-payloads/npc-clairvoyance.json", projectRoot),
    "utf8",
  ),
);
const migrationSource = await readFile(
  new URL("scripts/migrate-pitboy-susan-account.mjs", projectRoot),
  "utf8",
);
const specSource = await readFile(
  new URL("docs/spec/npc/clairvoyance.md", projectRoot),
  "utf8",
);

test("CLAIRVOYANCE narrow payload links the profile, SD sprite, and GM owner", async () => {
  const targetUserId = migrationSource.match(
    /const TARGET_USER_ID = "([a-f0-9]{24})"/,
  )?.[1];
  assert.ok(targetUserId);
  assert.equal(assetPayload.filter.codename, "CLAIRVOYANCE");
  assert.equal(assetPayload.filter.agentLevel, "H");
  assert.equal(basePayload.payload.ownerId, null);
  assert.equal(assetPayload.update.$set["lore.appearsInEvents"], undefined);
  assert.equal(assetPayload.update.$set.ownerId, targetUserId);
  assert.deepEqual(assetPayload.filter.ownerId, {
    $in: [null, targetUserId],
  });
  assert.equal(
    assetPayload.filter.ownerId.$in.includes("000000000000000000000000"),
    false,
  );
  assert.equal(assetPayload.postcondition.ownerId, targetUserId);
  assert.equal(
    assetPayload.update.$set.previewImage,
    "/assets/npcs/Clairvoyance-pixel-profile.webp",
  );
  assert.equal(
    assetPayload.update.$set.pixelCharacterImage,
    "/assets/npcs/Clairvoyance-pixel-character.webp",
  );
  assert.equal(
    assetPayload.update.$set["lore.mainImage"],
    "/assets/npcs/Clairvoyance-profile.webp",
  );
  assert.match(specSource, /^agentLevel: H$/m);
  assert.match(
    specSource,
    /^mainImage: \/assets\/npcs\/Clairvoyance-profile\.webp$/m,
  );

  for (const fileName of [
    "Clairvoyance-pixel-profile.webp",
    "Clairvoyance-pixel-character.webp",
  ]) {
    const file = new URL(`public/assets/npcs/${fileName}`, projectRoot);
    await access(file);
    const metadata = await sharp(fileURLToPath(file)).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.hasAlpha, true);
    assert.ok((metadata.width ?? 0) >= 1000);
    assert.ok((metadata.height ?? 0) >= 1200);
  }
});
