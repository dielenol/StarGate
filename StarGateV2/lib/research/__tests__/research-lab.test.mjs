import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEARCH_LAB_RECIPES,
  getResearchLabRecipe,
} from "../research-lab.ts";

test("세 연구선은 24h 최초/6h 반복/500CR 계약과 실제 asset 경로를 고정한다", () => {
  assert.deepEqual(Object.keys(RESEARCH_LAB_RECIPES), [
    "ZULU_0028",
    "ZULU_0040",
    "INVERTED_SOCK",
  ]);
  for (const recipe of Object.values(RESEARCH_LAB_RECIPES)) {
    assert.equal(recipe.initialDurationMs, 24 * 60 * 60 * 1_000);
    assert.equal(recipe.repeatDurationMs, 6 * 60 * 60 * 1_000);
    assert.equal(recipe.repeatCreditCost, 500);
    assert.equal(recipe.source.quantity, 1);
    assert.equal(recipe.output.quantity, 1);
  }
  assert.equal(
    RESEARCH_LAB_RECIPES.ZULU_0040.source.image,
    "/assets/catalog/samples/zulu-0040-crown-specimen.webp",
  );
  assert.equal(getResearchLabRecipe("UNKNOWN"), null);
});
