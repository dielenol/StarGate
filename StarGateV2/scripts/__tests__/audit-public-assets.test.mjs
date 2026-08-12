import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  auditPublicAssets,
  extractAssetReferences,
  findMissingAssetReferences,
  findStaleRenamedReferences,
  validateAssetRelativePath,
} from "../lib/public-asset-audit.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("도메인별 의미 기반 파일명과 기존 예외를 구분한다", () => {
  assert.deepEqual(
    validateAssetRelativePath("catalog/equipment/tactical-claymore.webp"),
    { errors: [], legacy: [] },
  );
  assert.deepEqual(
    validateAssetRelativePath("npcs/Irena-Vukovic-Suture-recovery.webp"),
    { errors: [], legacy: [] },
  );
  assert.equal(
    validateAssetRelativePath("world-view/wolrdview_1.webp").legacy.length,
    1,
  );
  assert.equal(
    validateAssetRelativePath(
      "catalog/equipment/exec-b8052d9f-8195-43de-a119-d963ffdcd4f-cutout.png",
    ).errors.length,
    1,
  );
  assert.equal(
    validateAssetRelativePath("catalog/equipment/generated-image.webp")
      .errors.length,
    1,
  );
  assert.equal(
    validateAssetRelativePath("catalog/equipment/exec-output.webp").errors
      .length,
    1,
  );
  assert.equal(
    validateAssetRelativePath("catalog/equipment/generated-image-2.webp")
      .errors.length,
    1,
  );
});

test("코드와 JSON의 이미지 참조에서 쿼리를 제거한다", () => {
  assert.deepEqual(
    extractAssetReferences(`
      const portrait = "/assets/npcs/Towaski-profile.webp?v=cutout-1";
      { "previewImage": "/assets/catalog/equipment/tactical-claymore.webp" }
    `),
    [
      "/assets/npcs/Towaski-profile.webp",
      "/assets/catalog/equipment/tactical-claymore.webp",
    ],
  );
});

test("PNG/JPG 참조는 동일 이름 WebP가 있으면 배포 가능하다", () => {
  const references = [
    {
      filePath: "app/example.tsx",
      references: [
        "/assets/shop/items/soda.png",
        "/assets/catalog/equipment/missing.webp",
      ],
    },
  ];
  const missing = findMissingAssetReferences(
    references,
    new Set(["/assets/shop/items/soda.webp"]),
  );

  assert.deepEqual(missing, [
    {
      files: ["app/example.tsx"],
      reference: "/assets/catalog/equipment/missing.webp",
    },
  ]);
});

test("rename된 자산의 코드·시드 잔여 참조를 마이그레이션 대상으로 찾는다", () => {
  assert.deepEqual(
    findStaleRenamedReferences(
      [
        {
          from: "public/assets/npcs/Old-profile.webp",
          to: "public/assets/npcs/New-profile.webp",
        },
      ],
      [
        {
          filePath: "scripts/seed-payloads/npc.json",
          references: ["/assets/npcs/Old-profile.webp"],
        },
      ],
    ),
    [
      {
        filePath: "scripts/seed-payloads/npc.json",
        from: "/assets/npcs/Old-profile.webp",
        to: "/assets/npcs/New-profile.webp",
      },
    ],
  );
});

test("현재 public 이미지와 운영 참조가 자산 계약을 통과한다", async () => {
  const report = await auditPublicAssets(REPO_ROOT);
  assert.ok(report.assetCount >= 500);
  assert.ok(report.referenceCount >= 200);
  assert.deepEqual(report.errors, []);
});
