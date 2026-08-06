import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  getPixelCharacterPath,
  getPixelProfilePath,
  KNOWN_CHARACTER_ASSET_SLUGS,
  resolveCharacterAssetSlug,
} from "../character-asset.ts";

const PEOPLE_ASSET_DIR = fileURLToPath(
  new URL("../../../public/assets/peoples/", import.meta.url),
);
const REQUIRED_CORE_KINDS = [
  "main-image",
  "pixel-profile",
  "pixel-character",
];

test("known playable character slugs have matching WebP core assets", async () => {
  assert.equal(
    new Set(KNOWN_CHARACTER_ASSET_SLUGS).size,
    KNOWN_CHARACTER_ASSET_SLUGS.length,
    "character asset slugs must be unique",
  );

  for (const slug of KNOWN_CHARACTER_ASSET_SLUGS) {
    assert.equal(resolveCharacterAssetSlug(slug), slug);
    assert.equal(
      getPixelCharacterPath(slug),
      `/assets/peoples/${slug}-pixel-character.webp`,
    );
    assert.equal(
      getPixelProfilePath(slug),
      `/assets/peoples/${slug}-pixel-profile.webp`,
    );

    for (const kind of REQUIRED_CORE_KINDS) {
      const webpPath = path.join(PEOPLE_ASSET_DIR, `${slug}-${kind}.webp`);
      await access(webpPath);

      const webp = await sharp(webpPath).metadata();
      assert.equal(webp.format, "webp", `${slug}-${kind}.webp format`);
      assert.equal(webp.hasAlpha, true, `${slug}-${kind}.webp alpha`);
    }
  }
});

test("unmapped partial character assets cannot masquerade as complete token sets", async () => {
  const fileNames = await readdir(PEOPLE_ASSET_DIR);
  const mappedSlugs = new Set(KNOWN_CHARACTER_ASSET_SLUGS);
  const partialSlugs = new Set(
    fileNames
      .map((fileName) =>
        fileName.match(
          /^(.+)-(?:main-image|pixel-profile|pixel-character|poster)\.(?:png|webp)$/,
        ),
      )
      .filter(Boolean)
      .map((match) => match[1])
      .filter((slug) => !mappedSlugs.has(slug)),
  );

  assert.deepEqual([...partialSlugs].sort(), ["Hunter"]);
  assert.equal(resolveCharacterAssetSlug("HUNTER"), null);
  assert.equal(getPixelCharacterPath("HUNTER"), null);
  assert.equal(getPixelProfilePath("HUNTER"), null);
});
