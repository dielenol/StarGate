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

test("advanced modes use equipment-specific start and failure dialogue", () => {
  const sonicStart = getTowaskiQualificationDialogueLine({
    type: "start",
    difficulty: "expert",
    mode: "sonic",
    attempt: 1,
  });
  const explosiveFailure = getTowaskiQualificationDialogueLine({
    type: "failed",
    difficulty: "expert",
    mode: "explosive",
    attempt: 1,
    reasons: ["backblast"],
  });

  assert.match(sonicStart, /공진|출력|펄스/);
  assert.match(explosiveFailure, /폭발|후폭풍|기폭/);
});

test("specialist modes rotate mode-specific coaching lines", () => {
  const sonicLines = Array.from({ length: 6 }, (_, index) =>
    getTowaskiQualificationDialogueLine({
      type: "start",
      difficulty: "expert",
      mode: "sonic",
      attempt: index + 1,
    }),
  );

  assert.ok(new Set(sonicLines).size > 1);
  for (const line of sonicLines) {
    assert.match(line, /Hz|공진|출력|펄스|계기/);
  }
});

test("mode-specific retry briefing repeats the actual controls", () => {
  const sonicBriefing = getTowaskiQualificationDialogueLine({
    type: "briefing",
    difficulty: "expert",
    mode: "sonic",
    attempt: 2,
  });
  const flameBriefing = getTowaskiQualificationDialogueLine({
    type: "briefing",
    difficulty: "expert",
    mode: "flame",
    attempt: 2,
  });

  assert.match(sonicBriefing, /Hz|출력|폭|부하/);
  assert.match(flameBriefing, /경로|소각|손을 떼/);
});
