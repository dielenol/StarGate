import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardData = await readFile(
  new URL("../dashboard.ts", import.meta.url),
  "utf8",
);
const dashboardUi = await readFile(
  new URL("../../../app/(erp)/erp/DashboardClient.tsx", import.meta.url),
  "utf8",
);

test("dashboard separates the display character from the economic main character", () => {
  assert.match(dashboardData, /findDisplayCharacterByOwner\(userId\)/);
  assert.match(dashboardData, /findMainCharacterByOwner\(userId\)/);
  assert.match(
    dashboardData,
    /viewerRole === "GM"[\s\S]*:\s*mainCharacterPromise/,
  );
  assert.match(
    dashboardData,
    /const displayCharacter = resolvedDisplayCharacter \?\?\s*firstCharacterFallback/,
  );
  assert.match(dashboardData, /getCharacterBalance\(mainCharacterId\)/);
  assert.doesNotMatch(dashboardData, /getCharacterBalance\([^)]*displayCharacter/);
});

test("dashboard prioritizes the character-specific pixel image", () => {
  assert.match(dashboardUi, /pixelCharacterImage=\{displayCharacter\.pixelCharacterImage\}/);
  assert.match(
    dashboardUi,
    /pixelCharacterImage\s*\?\s*preferOptimizedPublicImagePath\(pixelCharacterImage\)\s*:\s*getPixelCharacterPath\(codename\)/,
  );
});
