import assert from "node:assert/strict";
import test from "node:test";

import {
  getTowaskiDialogueContext,
  getTowaskiQualificationDialogueLine,
  shouldScheduleTowaskiShopIdle,
} from "../towaski-dialogue.ts";

test("qualification context never schedules general shop idle dialogue", () => {
  const context = getTowaskiDialogueContext(true);

  assert.equal(context, "qualification");
  assert.equal(shouldScheduleTowaskiShopIdle(context), false);
  assert.equal(shouldScheduleTowaskiShopIdle("shop"), true);
});

test("qualification attempts use only range-specific dialogue variants", () => {
  const lines = Array.from({ length: 6 }, (_, index) =>
    getTowaskiQualificationDialogueLine({
      type: "start",
      difficulty: "basic",
      attempt: index + 1,
    }),
  );

  assert.ok(new Set(lines).size > 1);
  for (const line of lines) {
    assert.doesNotMatch(line, /재고|진열장|방호구|소모품|카운터/);
  }
});

test("civilian-hit failure dialogue takes priority over score failures", () => {
  const line = getTowaskiQualificationDialogueLine({
    type: "failed",
    difficulty: "standard",
    attempt: 2,
    reasons: ["hostile_hits", "civilian_hit", "accuracy"],
  });

  assert.match(line, /민간/);
});

test("retry briefing stays in qualification context", () => {
  const line = getTowaskiQualificationDialogueLine({
    type: "briefing",
    difficulty: "expert",
    attempt: 3,
  });

  assert.match(line, /다시|재시험|한 번 더/);
  assert.doesNotMatch(line, /재고|진열장|방호구|소모품|카운터/);
});
