import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const RULES_PAGE_URL = new URL(
  "../../app/(public)/rules/page.tsx",
  import.meta.url,
);

test("the public rules page renders combat foundations from shared canon data", async () => {
  const page = await readFile(RULES_PAGE_URL, "utf8");

  assert.match(page, /id: "combat-foundations"/);
  assert.match(page, /COMBAT_MOVEMENT_RULES\.allyTurnMovement\.declarationsPerTurn/);
  assert.match(page, /COMBAT_PERCENTAGE_ROUNDING_RULE\.fractionThreshold/);
  assert.match(page, /COMBAT_MAP_RULES\.classicHorizontal\.minimumColumns/);
  assert.match(page, /COMBAT_MAP_RULES\.classicVertical\.minimumRows/);
  assert.match(page, /COMBAT_MAP_RULES\.renewal\.minimumColumns/);
  assert.match(page, /강제 이동은 각 스킬에 적힌/);
});
