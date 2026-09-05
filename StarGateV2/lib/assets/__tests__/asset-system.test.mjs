import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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

const SESSION_REPORT_SPEC = {
  domain: "session-report",
  entitySlug: "shot-001",
  sessionSlug: "publisher-test",
};

function sessionReportOutputPath(projectRoot, entitySlug = "shot-001") {
  return path.join(
    projectRoot,
    "public/assets/session-reports/publisher-test",
    `${entitySlug}.webp`,
  );
}

async function assertPathMissing(filePath) {
  await assert.rejects(() => access(filePath), /ENOENT/);
}

async function assertDirectoryHasNoPublishTemps(outputDirectory) {
  let entries = [];
  try {
    entries = await readdir(outputDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  assert.deepEqual(
    entries.filter((entry) => entry.includes(".tmp.webp")),
    [],
  );
}

async function assertNoPublishTemps(projectRoot) {
  await assertDirectoryHasNoPublishTemps(
    path.dirname(sessionReportOutputPath(projectRoot)),
  );
}

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

test("publish CLI는 일반 자산 overwrite를 임시 파일 검증 뒤 원자 교체한다", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "stargate-atomic-overwrite-"),
  );
  const inputPath = path.join(projectRoot, "replacement.png");
  const invalidInputPath = path.join(projectRoot, "invalid-image.txt");
  const outputPath = path.join(
    projectRoot,
    "public/assets/npcs/Atomic-Overwrite-main-image.webp",
  );
  const outputDirectory = path.dirname(outputPath);
  const options = {
    overwrite: true,
    projectRoot,
    spec: {
      domain: "npc",
      entitySlug: "Atomic-Overwrite",
      role: "main-image",
    },
  };

  try {
    await mkdir(outputDirectory, { recursive: true });
    await sharp({
      create: {
        background: { b: 255, g: 0, r: 0 },
        channels: 3,
        height: 16,
        width: 16,
      },
    })
      .webp()
      .toFile(outputPath);
    const originalHash = createHash("sha256")
      .update(await readFile(outputPath))
      .digest("hex");
    await writeFile(invalidInputPath, "not an image");

    await assert.rejects(() =>
      publishAsset({ ...options, inputPath: invalidInputPath }),
    );
    assert.equal(
      createHash("sha256")
        .update(await readFile(outputPath))
        .digest("hex"),
      originalHash,
    );
    await assertDirectoryHasNoPublishTemps(outputDirectory);

    await sharp({
      create: {
        background: { b: 0, g: 0, r: 255 },
        channels: 3,
        height: 16,
        width: 16,
      },
    })
      .png()
      .toFile(inputPath);
    const published = await publishAsset({ ...options, inputPath });
    const stats = await sharp(outputPath).stats();

    assert.equal(published.filePath, outputPath);
    assert.equal(published.quality, 90);
    assert.ok(stats.channels[0].mean > 200);
    assert.notEqual(published.sha256, originalHash);
    await assertDirectoryHasNoPublishTemps(outputDirectory);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("publish CLI는 불투명 session-report를 q78 sRGB WebP로 발행하고 검증 receipt를 반환한다", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "stargate-session-publish-"),
  );
  const inputPath = path.join(projectRoot, "shot-001-source.png");

  try {
    const width = 32;
    const height = 18;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 3;
        if (x < width / 2) {
          pixels[offset] = 255;
        } else {
          pixels[offset + 2] = 255;
        }
      }
    }
    await sharp(pixels, { raw: { channels: 3, height, width } })
      .withMetadata({ orientation: 6 })
      .png()
      .toFile(inputPath);
    const sourceBytes = await readFile(inputPath);
    const expectedSourceSha256 = createHash("sha256")
      .update(sourceBytes)
      .digest("hex");
    const relativeProjectRoot = path.relative(process.cwd(), projectRoot);

    const published = await publishAsset({
      inputPath,
      projectRoot: relativeProjectRoot,
      spec: SESSION_REPORT_SPEC,
    });
    const output = await readFile(published.filePath);
    const metadata = await sharp(output, { animated: true }).metadata();

    assert.deepEqual(
      {
        format: published.format,
        hasAlpha: published.hasAlpha,
        height: published.height,
        opaque: published.opaque,
        publicPath: published.publicPath,
        quality: published.quality,
        width: published.width,
      },
      {
        format: "webp",
        hasAlpha: false,
        height: 32,
        opaque: true,
        publicPath: "/assets/session-reports/publisher-test/shot-001.webp",
        quality: 78,
        width: 18,
      },
    );
    assert.equal(published.bytes, (await stat(published.filePath)).size);
    assert.equal(
      published.sha256,
      createHash("sha256").update(output).digest("hex"),
    );
    assert.equal(published.sourceSha256, expectedSourceSha256);
    assert.match(published.sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(published.projectRoot, path.resolve(projectRoot));
    assert.equal(path.isAbsolute(published.projectRoot), true);
    assert.match(published.sha256, /^[a-f0-9]{64}$/);
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.space, "srgb");
    assert.equal(metadata.pages ?? 1, 1);
    assert.equal(metadata.width, 18);
    assert.equal(metadata.height, 32);
    assert.equal(metadata.hasAlpha, false);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.ok(published.bytes <= 1024 * 1024);

    const topPixel = await sharp(output)
      .extract({ height: 1, left: 9, top: 4, width: 1 })
      .raw()
      .toBuffer();
    const bottomPixel = await sharp(output)
      .extract({ height: 1, left: 9, top: 27, width: 1 })
      .raw()
      .toBuffer();
    assert.ok(topPixel[0] > 200);
    assert.ok(topPixel[2] < 40);
    assert.ok(bottomPixel[0] < 40);
    assert.ok(bottomPixel[2] > 200);
    await assertNoPublishTemps(projectRoot);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("publish CLI는 부적합한 session-report 입력을 목적지 쓰기 전에 거부한다", async (t) => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "stargate-session-preflight-"),
  );

  try {
    await t.test("투명 픽셀", async () => {
      const inputPath = path.join(projectRoot, "transparent.png");
      await sharp({
        create: {
          background: { alpha: 0.5, b: 0, g: 0, r: 0 },
          channels: 4,
          height: 8,
          width: 8,
        },
      })
        .png()
        .toFile(inputPath);

      await assert.rejects(
        () =>
          publishAsset({
            inputPath,
            projectRoot,
            spec: { ...SESSION_REPORT_SPEC, entitySlug: "transparent" },
          }),
        /완전히 불투명/,
      );
      await assertPathMissing(
        sessionReportOutputPath(projectRoot, "transparent"),
      );
    });

    await t.test("다중 프레임", async () => {
      const inputPath = path.join(projectRoot, "animated.gif");
      const width = 8;
      const pageHeight = 8;
      const pixels = Buffer.alloc(width * pageHeight * 3 * 2);
      pixels.fill(255, 0, width * pageHeight * 3);
      for (
        let offset = width * pageHeight * 3;
        offset < pixels.length;
        offset += 3
      ) {
        pixels[offset] = 255;
      }
      await sharp(pixels, {
        raw: {
          channels: 3,
          height: pageHeight * 2,
          pageHeight,
          width,
        },
      })
        .gif({ delay: [100, 100], loop: 0 })
        .toFile(inputPath);

      assert.equal((await sharp(inputPath).metadata()).pages, 2);
      await assert.rejects(
        () =>
          publishAsset({
            inputPath,
            projectRoot,
            spec: { ...SESSION_REPORT_SPEC, entitySlug: "animated" },
          }),
        /단일 프레임/,
      );
      await assertPathMissing(sessionReportOutputPath(projectRoot, "animated"));
    });

    await t.test("1400px 초과 장변", async () => {
      const inputPath = path.join(projectRoot, "oversize.png");
      await sharp({
        create: {
          background: { b: 0, g: 0, r: 0 },
          channels: 3,
          height: 2,
          width: 1401,
        },
      })
        .png()
        .toFile(inputPath);

      await assert.rejects(
        () =>
          publishAsset({
            inputPath,
            projectRoot,
            spec: { ...SESSION_REPORT_SPEC, entitySlug: "oversize" },
          }),
        /1400px 이하/,
      );
      await assertPathMissing(sessionReportOutputPath(projectRoot, "oversize"));
    });

    await t.test("비래스터 입력", async () => {
      const inputPath = path.join(projectRoot, "vector.svg");
      await writeFile(
        inputPath,
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>',
      );

      await assert.rejects(
        () =>
          publishAsset({
            inputPath,
            projectRoot,
            spec: { ...SESSION_REPORT_SPEC, entitySlug: "vector" },
          }),
        /래스터 이미지/,
      );
      await assertPathMissing(sessionReportOutputPath(projectRoot, "vector"));
    });

    await assertNoPublishTemps(projectRoot);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("publish CLI는 session-report overwrite를 항상 거부한다", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "stargate-session-overwrite-"),
  );
  const inputPath = path.join(projectRoot, "shot-001-source.png");

  try {
    await sharp({
      create: {
        background: { b: 0, g: 0, r: 0 },
        channels: 3,
        height: 8,
        width: 8,
      },
    })
      .png()
      .toFile(inputPath);

    await assert.rejects(
      () =>
        publishAsset({
          inputPath,
          overwrite: true,
          projectRoot,
          spec: SESSION_REPORT_SPEC,
        }),
      /append-only/,
    );
    await assertPathMissing(sessionReportOutputPath(projectRoot));
    await assertNoPublishTemps(projectRoot);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("publish CLI는 동시 no-overwrite 발행에서 정확히 하나만 원자적으로 성공시킨다", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "stargate-session-race-"),
  );
  const inputPath = path.join(projectRoot, "shot-001-source.png");

  try {
    await sharp({
      create: {
        background: { b: 48, g: 32, r: 16 },
        channels: 3,
        height: 256,
        width: 256,
      },
    })
      .png()
      .toFile(inputPath);
    const options = { inputPath, projectRoot, spec: SESSION_REPORT_SPEC };
    const results = await Promise.allSettled([
      publishAsset(options),
      publishAsset(options),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(String(rejected[0].reason), /덮어쓰지 않습니다/);
    assert.equal(
      (await sharp(sessionReportOutputPath(projectRoot)).metadata()).format,
      "webp",
    );
    await assertNoPublishTemps(projectRoot);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("publish CLI는 session-report 출력 후조건 실패 시 최종 파일과 임시 파일을 남기지 않는다", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "stargate-session-postcondition-"),
  );
  const inputPath = path.join(projectRoot, "noisy-source.png");
  const width = 1400;
  const height = 1400;
  const pixels = Buffer.allocUnsafe(width * height * 3);
  let pseudoRandomState = 0x5a17c9e3;
  for (let index = 0; index < pixels.length; index += 1) {
    pseudoRandomState =
      (Math.imul(pseudoRandomState, 1_664_525) + 1_013_904_223) >>> 0;
    pixels[index] = pseudoRandomState >>> 24;
  }

  try {
    await sharp(pixels, { raw: { channels: 3, height, width } })
      .png()
      .toFile(inputPath);

    await assert.rejects(
      () =>
        publishAsset({
          inputPath,
          projectRoot,
          spec: { ...SESSION_REPORT_SPEC, entitySlug: "too-heavy" },
        }),
      /1 MiB 이하/,
    );
    await assertPathMissing(sessionReportOutputPath(projectRoot, "too-heavy"));
    await assertNoPublishTemps(projectRoot);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("publish CLI는 quality와 입력·출력 경로 계약을 유지한다", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "stargate-publish-contract-"),
  );
  const outputPath = path.join(
    projectRoot,
    "public/assets/npcs/Contract-Test-main-image.webp",
  );

  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await sharp({
      create: {
        background: { b: 0, g: 0, r: 0 },
        channels: 3,
        height: 8,
        width: 8,
      },
    })
      .webp()
      .toFile(outputPath);
    const options = {
      inputPath: outputPath,
      projectRoot,
      spec: {
        domain: "npc",
        entitySlug: "Contract-Test",
        role: "main-image",
      },
    };

    await assert.rejects(
      () => publishAsset(options),
      /입력과 출력 경로가 같습니다/,
    );
    for (const quality of [0, 78.5, 101, Number.NaN]) {
      await assert.rejects(
        () => publishAsset({ ...options, inputPath: "does-not-matter", quality }),
        /1~100 정수/,
      );
    }
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
});

test("publish CLI는 실제 투명 픽셀이 없는 NPC profile 발행을 쓰기 전에 막는다", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "stargate-opaque-npc-profile-"),
  );
  const rgbInputPath = path.join(projectRoot, "opaque-rgb-profile.png");
  const alphaInputPath = path.join(projectRoot, "opaque-alpha-profile.png");

  try {
    await sharp({
      create: {
        background: { b: 255, g: 255, r: 255 },
        channels: 3,
        height: 8,
        width: 8,
      },
    })
      .png()
      .toFile(rgbInputPath);

    await sharp({
      create: {
        background: { alpha: 1, b: 255, g: 255, r: 255 },
        channels: 4,
        height: 8,
        width: 8,
      },
    })
      .png()
      .toFile(alphaInputPath);

    for (const [inputPath, entitySlug] of [
      [rgbInputPath, "Opaque-Rgb-Profile"],
      [alphaInputPath, "Opaque-Alpha-Profile"],
    ]) {
      await assert.rejects(
        () =>
          publishAsset({
            inputPath,
            projectRoot,
            spec: {
              domain: "npc",
              entitySlug,
              role: "profile",
            },
          }),
        /실제 투명 픽셀이 필요합니다/,
      );
      await assert.rejects(
        () =>
          access(
            path.join(
              projectRoot,
              `public/assets/npcs/${entitySlug}-profile.webp`,
            ),
          ),
        /ENOENT/,
      );
    }
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
