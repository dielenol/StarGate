import assert from "node:assert/strict";
import test from "node:test";

import {
  AMERI_DIALOGUE_LINES,
  AMERI_IDLE_LINES,
  buildAmeriDestinationLine,
  buildAmeriWelcomeLine,
} from "../ameri-dialogue.ts";

const DESTINATIONS = [
  ["lab", /이레나|생체 적합성|연구/],
  ["towaski", /토와스키|화기|라이센스/],
  ["acheron", /아케론|브리짓|냉병기/],
  ["strategic", /전략|마테오|승무원|회수/],
  ["custom", /공방|전용무기|사양서/],
  ["simulator", /훈련장|시험|사거리/],
];

test("welcome dialogue addresses the assigned AGENT", () => {
  assert.match(buildAmeriWelcomeLine("TEST AGENT"), /^TEST AGENT,/);
  assert.match(buildAmeriWelcomeLine("TEST AGENT"), /결재|서류/);
  assert.equal(buildAmeriWelcomeLine(null), AMERI_DIALOGUE_LINES.welcome);
});

test("every armory destination has an Ameri routing line", () => {
  for (const [destination, expectedDetail] of DESTINATIONS) {
    const result = buildAmeriDestinationLine(destination, "TEST AGENT");
    assert.match(result.text, /^TEST AGENT,/);
    assert.match(result.text, expectedDetail);
    assert.ok(result.mood === "routing" || result.mood === "review");
  }
});

test("idle dialogue preserves Ameri's paperwork and caffeine pattern", () => {
  const idleText = AMERI_IDLE_LINES.map(({ text }) => text).join(" ");
  assert.match(idleText, /커피|식는/);
  assert.match(idleText, /결재|문서|반려/);
});
