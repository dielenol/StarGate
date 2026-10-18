import assert from "node:assert/strict";
import test from "node:test";

import {
  createBackdropScene,
  PRISM_EDGES,
  PRISM_FACES,
  projectPrism,
  spectrumColor,
} from "../../lib/login-backdrop/scene.ts";

const PRISM = {
  anchorX: 0.5,
  anchorY: 0.5,
  scale: 0.1,
  opacity: 1,
  tiltX: 0.3,
  tiltZ: 0.2,
  spinY: 0.1,
  driftX: 0,
  driftY: 0,
  driftPeriod: 10,
  phase: 0,
};

test("spectrumColor interpolates from red to magenta across the logo spectrum", () => {
  assert.deepEqual(spectrumColor(0), [232, 3, 3]);
  assert.deepEqual(spectrumColor(1), [235, 0, 246]);
  assert.deepEqual(spectrumColor(-1), spectrumColor(0));
  assert.deepEqual(spectrumColor(2), spectrumColor(1));

  const [r, g, b] = spectrumColor(0.5);
  assert.deepEqual([r, g, b], [102, 255, 46]);
});

test("createBackdropScene is deterministic and scales dust with the viewport", () => {
  const first = createBackdropScene(800, 600);
  const second = createBackdropScene(800, 600);
  assert.deepEqual(first.dust, second.dust);
  assert.equal(first.dust.length, 40);

  const large = createBackdropScene(1920, 1080);
  assert.equal(large.dust.length, 140);
  for (const mote of large.dust) {
    assert.ok(mote.x >= 0 && mote.x <= 1920);
    assert.ok(mote.y >= 0 && mote.y <= 1080);
    assert.ok(mote.radius > 0);
  }

  const small = createBackdropScene(320, 480);
  assert.equal(small.dust.length, 40);
});

test("projectPrism keeps the prism around its anchor and tracks depth per vertex", () => {
  const projected = projectPrism(PRISM, 0, 1000, 800);
  const radius = Math.min(1000, 800 * 1.25) * PRISM.scale;

  assert.equal(projected.points.length, 6);
  assert.equal(projected.faces.length, PRISM_FACES.length);
  assert.equal(PRISM_EDGES.length, 9);

  for (const point of projected.points) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(Math.abs(point.x - 500) <= radius * 2);
    assert.ok(Math.abs(point.y - 400) <= radius * 2);
    assert.ok(point.depth >= 0 && point.depth <= 1);
  }

  const facingCount = projected.faces.filter((face) => face.facing > 0).length;
  assert.ok(facingCount >= 1 && facingCount <= 3);
  for (const face of projected.faces) {
    assert.ok(face.facing >= 0 && face.facing <= 1);
    assert.ok(face.lit >= 0 && face.lit <= 1);
    assert.equal(face.color.length, 3);
  }
});

test("projectPrism rotates over time", () => {
  const before = projectPrism(PRISM, 0, 1000, 800);
  const after = projectPrism(PRISM, 5, 1000, 800);
  const moved = before.points.some(
    (point, index) =>
      Math.abs(point.x - after.points[index].x) > 1 ||
      Math.abs(point.y - after.points[index].y) > 1,
  );
  assert.ok(moved);
});
