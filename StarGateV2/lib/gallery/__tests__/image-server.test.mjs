import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import "./module-hooks.mjs";

const { GalleryImageError, normalizeGalleryImage } = await import(
  "../image-server.ts"
);

test("이미지를 회전 보정한 2400px 이하 WebP로 재인코딩한다", async () => {
  const source = await sharp({
    create: {
      width: 3_000,
      height: 1_000,
      channels: 3,
      background: "#1b2338",
    },
  })
    .png()
    .toBuffer();
  const normalized = await normalizeGalleryImage(
    new File([source], "source.png", { type: "image/png" }),
  );

  assert.equal(normalized.contentType, "image/webp");
  assert.equal(normalized.width, 2_400);
  assert.equal(normalized.height, 800);
  assert.equal(normalized.size, normalized.bytes.byteLength);
  assert.match(normalized.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(normalized.thumbnail.width, 768);
  assert.equal(normalized.thumbnail.height, 256);
  assert.equal(
    normalized.thumbnail.size,
    normalized.thumbnail.bytes.byteLength,
  );

  const metadata = await sharp(normalized.bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
});

test("선언 MIME과 magic bytes가 다른 파일을 거절한다", async () => {
  const source = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: "#ffffff",
    },
  })
    .png()
    .toBuffer();

  await assert.rejects(
    () =>
      normalizeGalleryImage(
        new File([source], "spoof.jpg", { type: "image/jpeg" }),
      ),
    GalleryImageError,
  );
});

test("6MP를 넘는 decode bomb 후보를 pixel cap에서 거절한다", async () => {
  const source = await sharp({
    create: {
      width: 3_001,
      height: 2_000,
      channels: 3,
      background: "#000000",
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await assert.rejects(
    () =>
      normalizeGalleryImage(
        new File([source], "too-many-pixels.png", { type: "image/png" }),
      ),
    GalleryImageError,
  );
});
