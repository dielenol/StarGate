import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

import { normalizeCatalogItemCreateBody } from "../catalog-item-input.ts";
import {
  CATALOG_ITEM_PRESETS,
  findCatalogItemPreset,
  getCatalogItemPresetSelectionValue,
} from "../catalog-presets.ts";

test("미스터비스트 소다 프리셋은 협의한 회복량과 권장가를 채운다", () => {
  const preset = CATALOG_ITEM_PRESETS.find(
    (entry) => entry.key === "mrbeast-soda-recovery",
  );
  assert.ok(preset);
  assert.equal(preset.form.target, "shop");
  assert.equal(preset.form.category, "CONSUMABLE");
  assert.equal(preset.form.price, "80");
  assert.equal(preset.form.effect, "HP 10 / SAN 10 회복");
  assert.equal(
    preset.form.previewImage,
    "/assets/shop/items/mrbeast_soda.webp",
  );
  assert.equal(preset.form.stockMin, "2");
  assert.equal(preset.form.stockMax, "5");
  assert.equal(preset.form.appearRate, "0.75");
  assert.equal(preset.form.pageGroup, "RECOVERY");
});

test("카탈로그 프리셋은 실제 운영 생성 계약을 통과하는 편집본이다", () => {
  const preset = CATALOG_ITEM_PRESETS[0];
  const result = normalizeCatalogItemCreateBody({
    target: preset.form.target,
    slug: preset.form.slug,
    name: preset.form.name,
    category: preset.form.category,
    price: Number(preset.form.price),
    description: preset.form.description,
    effect: preset.form.effect,
    previewImage: preset.form.previewImage,
    isAvailable: preset.form.isAvailable,
    isPublic: preset.form.isPublic,
    tags: preset.form.tags.split(",").map((tag) => tag.trim()),
    shopMeta: {
      stockMin: Number(preset.form.stockMin),
      stockMax: Number(preset.form.stockMax),
      appearRate: Number(preset.form.appearRate),
      pageGroup: preset.form.pageGroup,
      icon: preset.form.icon,
      color: preset.form.color,
    },
  });

  assert.equal(result.ok, true);
});

test("미스터비스트 소다 프리셋 이미지는 배포 가능한 로컬 자산이다", async () => {
  const preset = CATALOG_ITEM_PRESETS.find(
    (entry) => entry.key === "mrbeast-soda-recovery",
  );
  assert.ok(preset);
  await access(
    new URL(`../../../public${preset.form.previewImage}`, import.meta.url),
  );
});

test("프리셋 선택값은 공방처럼 prefix로 일반 카탈로그 값과 분리한다", () => {
  const preset = CATALOG_ITEM_PRESETS[0];
  const selectionValue = getCatalogItemPresetSelectionValue(preset.key);
  assert.equal(selectionValue, "preset:mrbeast-soda-recovery");
  assert.equal(findCatalogItemPreset(selectionValue), preset);
  assert.equal(findCatalogItemPreset("manual"), undefined);
});
