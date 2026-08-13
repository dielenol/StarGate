import assert from "node:assert/strict";
import test from "node:test";

import { isNochichimPersonalConsumable } from "../_lib/inventory-policy.ts";

test("노치찜 개인 소모품 투영은 재료와 전용 소비 원장을 제외한다", () => {
  assert.equal(
    isNochichimPersonalConsumable({
      category: "CONSUMABLE",
      slug: "first_aid_patch",
    }),
    true,
  );
  for (const slug of [
    "force_core",
    "zulu-0028-censor-3",
    "mrbeast_lottery",
    "mrbeast_apology_lottery",
    "white-rose-assistant-call",
  ]) {
    assert.equal(
      isNochichimPersonalConsumable({ category: "CONSUMABLE", slug }),
      false,
      `${slug} must stay on its dedicated inventory workflow`,
    );
  }
  assert.equal(
    isNochichimPersonalConsumable({ category: "MATERIAL", slug: "force_core" }),
    false,
  );
});
