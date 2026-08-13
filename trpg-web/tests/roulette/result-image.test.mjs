import assert from "node:assert/strict";
import test from "node:test";

import { canvasToPngBlob } from "../../lib/roulette/result-image.ts";

test("result canvas resolves a PNG blob", async () => {
  const canvas = {
    toBlob(callback, type) {
      assert.equal(type, "image/png");
      callback(new Blob(["roulette-result"], { type }));
    },
  };

  const blob = await canvasToPngBlob(canvas);
  assert.equal(blob.type, "image/png");
  assert.equal(blob.size, 15);
});

test("result canvas rejects when PNG encoding fails", async () => {
  const canvas = {
    toBlob(callback) {
      callback(null);
    },
  };

  await assert.rejects(
    canvasToPngBlob(canvas),
    /결과 PNG 생성에 실패했습니다/,
  );
});
