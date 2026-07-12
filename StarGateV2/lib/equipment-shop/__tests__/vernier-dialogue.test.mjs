import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVernierEquipmentLine,
  buildVernierWelcomeLine,
  VERNIER_DIALOGUE_LINES,
  VERNIER_IDLE_LINES,
  VERNIER_MOOD_LABELS,
} from "../vernier-dialogue.ts";

test("welcome line addresses the active AGENT without sounding like a system message", () => {
  const line = buildVernierWelcomeLine("AEGIS");

  assert.match(line, /^AEGIS,/);
  assert.match(line, /공방장 버니어/);
  assert.doesNotMatch(line, /채널|시스템|처리 중/);
});

test("equipment line names the selected gear and stays stable", () => {
  const input = { equipmentName: "기본형 카타나", codename: "AEGIS" };
  const first = buildVernierEquipmentLine(input);
  const second = buildVernierEquipmentLine(input);

  assert.equal(first, second);
  assert.match(first, /기본형 카타나/);
});

test("Vernier exposes a full conversational state set", () => {
  assert.equal(VERNIER_MOOD_LABELS.accepted, "검토 이관");
  assert.match(VERNIER_DIALOGUE_LINES.upgradePrompt, /포기/);
  assert.ok(VERNIER_IDLE_LINES.length >= 6);
  assert.ok(VERNIER_IDLE_LINES.every(({ text }) => text.length >= 25));
});
