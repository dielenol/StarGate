import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  CATALOG_ITEM_IMAGE_BY_SLUG,
  getCatalogItemImageSrc,
} from "../catalog.ts";
import {
  getPixelCharacterPath,
  resolveCharacterAssetSlug,
} from "../characters.ts";
import {
  SUTURE_MOOD_ASSETS,
  TEMPER_MOOD_ASSETS,
  workshopPortrait,
} from "../npcs.ts";
import {
  MRBEAST_SODA_SRC,
  SHOP_ITEM_IMAGE_BY_SLUG,
} from "../shop.ts";
import {
  buildStarGateV2AssetPath,
  withPublicAssetVersion,
} from "../spec.ts";
import { PUBLIC_ASSET_REGISTRY_PATHS } from "../registry.ts";
import { resolveAssetDestination } from "../../../scripts/asset-path-cli.ts";
import { publishAsset } from "../../../scripts/publish-asset-cli.ts";

function optimizedPublicUrl(assetPath) {
  const pathWithoutQuery = assetPath.replace(/\?.*$/, "");
  const optimizedPath = pathWithoutQuery.replace(/\.(?:png|jpe?g)$/i, ".webp");
  return new URL(`../../../public${optimizedPath}`, import.meta.url);
}

test("AssetSpec은 도메인과 UI 역할로 최종 public 경로를 만든다", () => {
  assert.equal(
    buildStarGateV2AssetPath({
      domain: "character",
      entitySlug: "NeBeD",
      role: "pixel-profile",
    }),
    "/assets/peoples/NeBeD-pixel-profile.webp",
  );
  assert.equal(
    buildStarGateV2AssetPath({
      domain: "npc",
      entitySlug: "Irena-Vukovic-Suture",
      role: "mood",
      variant: "recovery",
    }),
    "/assets/npcs/Irena-Vukovic-Suture-recovery.webp",
  );
  assert.equal(
    buildStarGateV2AssetPath({
      domain: "npc-collection",
      entitySlug: "xeno",
      collection: "relationship",
      variant: "favorable",
    }),
    "/assets/npcs/xeno/relationship/favorable.webp",
  );
  assert.equal(
    buildStarGateV2AssetPath({
      domain: "session-report",
      sessionSlug: "new-dublin",
      entitySlug: "neon-valkyrie-bar",
    }),
    "/assets/session-reports/new-dublin/neon-valkyrie-bar.webp",
  );
  assert.equal(
    buildStarGateV2AssetPath({
      domain: "shop",
      section: "items",
      entitySlug: "mrbeast_soda",
      format: "png",
    }),
    "/assets/shop/items/mrbeast_soda.png",
  );
  assert.equal(
    withPublicAssetVersion(
      "/assets/npcs/Towaski-profile.webp",
      "cutout-1",
    ),
    "/assets/npcs/Towaski-profile.webp?v=cutout-1",
  );
});

test("AssetSpec은 잘못된 slug와 버전을 거부한다", () => {
  assert.throws(
    () =>
      buildStarGateV2AssetPath({
        domain: "catalog",
        category: "equipment",
        entitySlug: "Opaque Name",
      }),
    /catalog entitySlug/,
  );
  assert.throws(
    () => withPublicAssetVersion("/assets/npcs/Towaski-profile.webp", "bad?v"),
    /asset version/,
  );
});

test("CLI는 같은 AssetSpec으로 생성 파일 목적지를 계산한다", () => {
  assert.deepEqual(
    resolveAssetDestination({
      domain: "catalog",
      category: "equipment",
      entitySlug: "tactical-claymore",
    }),
    {
      publicPath: "/assets/catalog/equipment/tactical-claymore.webp",
      filePath: "public/assets/catalog/equipment/tactical-claymore.webp",
    },
  );
});

test("publish CLI는 staging 이미지를 역할 기반 alpha WebP로 발행하고 덮어쓰기를 막는다", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "stargate-asset-publish-"),
  );
  const inputPath = path.join(projectRoot, "suture-recovery-cutout.png");

  try {
    await sharp({
      create: {
        background: { alpha: 0, b: 0, g: 0, r: 0 },
        channels: 4,
        height: 8,
        width: 8,
      },
    })
      .png()
      .toFile(inputPath);

    const options = {
      inputPath,
      projectRoot,
      spec: {
        domain: "npc",
        entitySlug: "Irena-Vukovic-Suture",
        role: "mood",
        variant: "recovery",
      },
    };
    const published = await publishAsset(options);

    assert.equal(
      published.publicPath,
      "/assets/npcs/Irena-Vukovic-Suture-recovery.webp",
    );
    assert.equal((await sharp(published.filePath).metadata()).hasAlpha, true);
    await assert.rejects(() => publishAsset(options), /덮어쓰지 않습니다/);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("NPC·상점·카탈로그 레지스트리의 경로는 실제 배포 자산으로 연결된다", async () => {
  assert.ok(PUBLIC_ASSET_REGISTRY_PATHS.length >= 100);
  for (const assetPath of PUBLIC_ASSET_REGISTRY_PATHS) {
    await access(optimizedPublicUrl(assetPath));
  }
  for (const assetPath of Object.values(CATALOG_ITEM_IMAGE_BY_SLUG)) {
    await access(optimizedPublicUrl(assetPath));
  }

  assert.equal(MRBEAST_SODA_SRC, SHOP_ITEM_IMAGE_BY_SLUG.mrbeast_soda);
  assert.equal(MRBEAST_SODA_SRC, "/assets/shop/items/mrbeast_soda.webp");
  assert.equal(
    getCatalogItemImageSrc("conchita-of-gluttony-modified"),
    "/assets/catalog/equipment/conchita-of-gluttony-modified.webp",
  );
  assert.equal(
    getCatalogItemImageSrc("old-tactical-sword-titanium-shield"),
    "/assets/catalog/equipment/old-tactical-sword-titanium-shield.webp",
  );
  assert.equal(
    getCatalogItemImageSrc("military-fragment-grenade"),
    "/assets/catalog/equipment/military-fragment-grenade.webp",
  );
  assert.equal(
    getCatalogItemImageSrc("conductor-corpse"),
    "/assets/catalog/special/conductor-corpse.webp",
  );
  assert.equal(
    getCatalogItemImageSrc("white-rose-assistant-call"),
    "/assets/catalog/consumables/white-rose-assistant-call.webp",
  );
  assert.equal(workshopPortrait("TEMPER", "QUOTED"), TEMPER_MOOD_ASSETS.balance);
  assert.equal(workshopPortrait("SUTURE", "REJECTED"), SUTURE_MOOD_ASSETS.blocked);
});

test("기존 캐릭터 codename 계약은 중앙 레지스트리에서 유지된다", () => {
  assert.equal(resolveCharacterAssetSlug("AEGIS"), "Valeria");
  assert.equal(
    getPixelCharacterPath("네베드"),
    "/assets/peoples/NeBeD-pixel-character.webp",
  );
});
