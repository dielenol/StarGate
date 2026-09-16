import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { auditCutsceneAssets } from "../cutscene-asset-audit.ts";
import { LEGACY_CUTSCENE_ALPHA_ALLOWLIST } from "../cutscene-legacy-alpha.ts";
import { SESSION_CUTSCENES } from "../session-cutscenes.ts";

async function createImage(
  root,
  folder,
  file,
  { width = 8, height = 6, alpha = 255, format = "webp" } = {},
) {
  const directory = path.join(root, folder);
  await mkdir(directory, { recursive: true });
  const image = sharp({
    create: {
      width,
      height,
      channels: alpha < 255 ? 4 : 3,
      background: alpha < 255
        ? { r: 40, g: 80, b: 120, alpha: alpha / 255 }
        : { r: 40, g: 80, b: 120 },
    },
  });
  const bytes = format === "png" ? await image.png().toBuffer() : await image.webp().toBuffer();
  await writeFile(path.join(directory, file), bytes);
  return bytes;
}

async function createAnimatedImage(root, folder, file) {
  const width = 8;
  const frameHeight = 6;
  const channels = 4;
  const framePixels = width * frameHeight;
  const pixels = Buffer.alloc(framePixels * channels * 2);
  for (let index = 0; index < framePixels; index += 1) {
    pixels[index * channels] = 255;
    pixels[index * channels + 3] = 255;
  }
  for (let index = framePixels; index < framePixels * 2; index += 1) {
    pixels[index * channels + 2] = 255;
    pixels[index * channels + 3] = 255;
  }
  const bytes = await sharp(pixels, {
    raw: {
      width,
      height: frameHeight * 2,
      pageHeight: frameHeight,
      channels,
    },
  }).webp({ delay: [100, 100], loop: 0 }).toBuffer();
  const directory = path.join(root, folder);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, file), bytes);
}

async function createLargeImage(root, folder, file) {
  const width = 700;
  const height = 700;
  const bytes = await sharp(randomBytes(width * height * 3), {
    raw: { width, height, channels: 3 },
  }).webp({ lossless: true }).toBuffer();
  assert.ok(bytes.byteLength > 1024 * 1024, "fixture는 1 MiB를 넘어야 한다");
  const directory = path.join(root, folder);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, file), bytes);
}

test("실제 컷신 corpus는 legacy alpha 경고만 허용하고 모든 구조 계약을 통과한다", async () => {
  const assetsRoot = fileURLToPath(
    new URL("../../../public/assets/session-reports", import.meta.url),
  );
  const result = await auditCutsceneAssets({
    manifest: SESSION_CUTSCENES,
    assetsRoot,
    legacyAlphaAllowlist: LEGACY_CUTSCENE_ALPHA_ALLOWLIST,
  });

  assert.equal(result.summary.manifestEntries, 453);
  assert.equal(result.summary.uniqueManifestPaths, 453);
  assert.equal(result.summary.actualCutFiles, 453);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.ok, true);
  assert.equal(result.summary.legacyAlphaTransparent, 18);
  assert.equal(result.summary.legacyAlphaNearOpaque, 37);
  assert.equal(result.summary.staleLegacyAlpha, 0);
  assert.equal(result.summary.exactDuplicateGroups, 1);
  assert.deepEqual(
    result.findings
      .filter(({ code }) => code === "exact_duplicate_content")
      .flatMap(({ paths }) => paths ?? []),
    [
      "/assets/session-reports/romantid/cut-005.webp",
      "/assets/session-reports/s1e5-sector-c/cut-033.webp",
    ],
  );
});

test("synthetic fixture에서 누락·고아·치수·포맷·알파·중복과 append-only 번호를 찾는다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "cutscene-assets-audit-"));
  try {
    await createImage(root, "shared", "cut-001.webp");
    await createImage(root, "shared", "cut-003.webp");
    await createImage(root, "shared", "cut-004.webp", { alpha: 0 });
    const duplicate = await createImage(root, "shared", "cut-005.webp");
    await writeFile(path.join(root, "shared", "cut-006.webp"), duplicate);
    await createImage(root, "shared", "cut-007.webp", { format: "png" });
    await createAnimatedImage(root, "shared", "cut-008.webp");
    await createImage(root, "shared", "cut-009.webp");
    await createImage(root, "shared", "cut-011.webp", { width: 1401 });
    await createLargeImage(root, "shared", "cut-012.webp");
    await createImage(root, "shared", "cut-10.webp");

    const result = await auditCutsceneAssets({
      assetsRoot: root,
      manifest: {
        "SESSION-A": {
          folder: "shared",
          shots: [
            { file: "cut-001.webp", width: 8, height: 6 },
            { file: "cut-002.webp", width: 8, height: 6 },
            { file: "cut-003.webp", width: 7, height: 6 },
            { file: "cut-004.webp", width: 8, height: 6 },
            { file: "cut-005.webp", width: 8, height: 6 },
            { file: "cut-006.webp", width: 8, height: 6 },
            { file: "cut-007.webp", width: 8, height: 6 },
            { file: "cut-008.webp", width: 8, height: 12 },
          ],
        },
        "SESSION-B": {
          folder: "shared",
          shots: [
            { file: "cut-010.webp", width: 8, height: 6 },
            { file: "cut-011.webp", width: 1401, height: 6 },
            { file: "cut-012.webp", width: 700, height: 700 },
          ],
        },
      },
    });

    const codes = new Set(result.findings.map(({ code }) => code));
    assert.ok(codes.has("missing_manifest_file"));
    assert.ok(codes.has("orphan_cut_file"));
    assert.ok(codes.has("manifest_dimension_mismatch"));
    assert.ok(codes.has("not_webp"));
    assert.ok(codes.has("not_single_frame"));
    assert.ok(codes.has("long_edge_exceeded"));
    assert.ok(codes.has("file_too_large"));
    assert.ok(codes.has("non_opaque_alpha"));
    assert.ok(codes.has("exact_duplicate_content"));
    assert.ok(codes.has("invalid_cut_name"));
    assert.equal(result.ok, false);
    assert.deepEqual(result.folders, [
      {
        folder: "shared",
        sessionIds: ["SESSION-A", "SESSION-B"],
        manifestEntries: 11,
        actualCutFiles: 10,
        maxCutId: 12,
        nextCutId: 13,
        nextFile: "cut-013.webp",
      },
    ]);
    assert.equal(result.scope.folderSemantics, "storage-namespace-only");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("duplicate manifest path는 error이고 stale legacy alpha는 warning이다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "cutscene-assets-legacy-"));
  try {
    await createImage(root, "shared", "cut-001.webp");
    await createImage(root, "shared", "cut-002.webp", { alpha: 128 });
    const publicPath = "/assets/session-reports/shared/cut-001.webp";
    const result = await auditCutsceneAssets({
      assetsRoot: root,
      manifest: {
        "SESSION-A": {
          folder: "shared",
          shots: [
            { file: "cut-001.webp", width: 8, height: 6 },
            { file: "cut-002.webp", width: 8, height: 6 },
          ],
        },
        "SESSION-B": {
          folder: "shared",
          shots: [{ file: "cut-001.webp", width: 8, height: 6 }],
        },
      },
      legacyAlphaAllowlist: {
        [publicPath]: 0,
        "/assets/session-reports/shared/cut-002.webp": 0,
        "/assets/session-reports/shared/cut-999.webp": 254,
      },
    });

    assert.ok(result.findings.some(({ code }) => code === "duplicate_manifest_path"));
    assert.ok(result.findings.some(({ code, path: findingPath }) =>
      code === "legacy_alpha_stale_opaque" && findingPath === publicPath,
    ));
    assert.ok(result.findings.some(({ code, path: findingPath }) =>
      code === "legacy_alpha_stale_changed" &&
      findingPath === "/assets/session-reports/shared/cut-002.webp",
    ));
    assert.ok(result.findings.some(({ code }) => code === "legacy_alpha_stale_missing"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manifest folder는 단일 lower-kebab segment만 허용하고 invalid 값은 집계에서 제외한다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "cutscene-assets-folders-"));
  try {
    await createImage(root, "bar", "cut-001.webp");
    await createImage(root, "valid-folder", "cut-010.webp");

    const result = await auditCutsceneAssets({
      assetsRoot: root,
      manifest: {
        TRAVERSAL: {
          folder: "foo/../bar",
          shots: [{ file: "cut-001.webp", width: 8, height: 6 }],
        },
        NESTED: {
          folder: "nested/bar",
          shots: [{ file: "cut-998.webp", width: 8, height: 6 }],
        },
        BACKSLASH: {
          folder: "nested\\bar",
          shots: [{ file: "cut-997.webp", width: 8, height: 6 }],
        },
        EMPTY: {
          folder: "",
          shots: [{ file: "cut-996.webp", width: 8, height: 6 }],
        },
        VALID: {
          folder: "valid-folder",
          shots: [{ file: "cut-010.webp", width: 8, height: 6 }],
        },
      },
    });

    const invalidFolders = result.findings.filter(
      ({ code }) => code === "invalid_manifest_folder",
    );
    assert.equal(invalidFolders.length, 4);
    assert.deepEqual(
      new Set(invalidFolders.map(({ sessionId }) => sessionId)),
      new Set(["TRAVERSAL", "NESTED", "BACKSLASH", "EMPTY"]),
    );
    assert.ok(result.findings.some(({ code, path: findingPath }) =>
      code === "orphan_cut_file" &&
      findingPath === "/assets/session-reports/bar/cut-001.webp",
    ));
    assert.equal(
      result.findings.some(({ code }) => code === "missing_manifest_file"),
      false,
    );
    assert.equal(result.summary.manifestEntries, 5);
    assert.equal(result.summary.uniqueManifestPaths, 1);
    assert.deepEqual(result.folders, [
      {
        folder: "bar",
        sessionIds: [],
        manifestEntries: 0,
        actualCutFiles: 1,
        maxCutId: 1,
        nextCutId: 2,
        nextFile: "cut-002.webp",
      },
      {
        folder: "valid-folder",
        sessionIds: ["VALID"],
        manifestEntries: 1,
        actualCutFiles: 1,
        maxCutId: 10,
        nextCutId: 11,
        nextFile: "cut-011.webp",
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
