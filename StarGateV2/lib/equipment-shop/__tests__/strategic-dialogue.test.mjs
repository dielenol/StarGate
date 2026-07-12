import assert from "node:assert/strict";
import test from "node:test";

import { DialogueBeepEngine } from "../../audio/dialogue-beep-engine.ts";
import {
  buildStrategicDispatchLine,
  buildStrategicItemLine,
  buildStrategicWelcomeLine,
  STRATEGIC_DIALOGUE_LINES,
} from "../strategic-dialogue.ts";

test("welcome dialogue addresses the assigned AGENT and reflects profile", () => {
  const line = buildStrategicWelcomeLine({
    codename: "TEST AGENT",
    profile: "focus",
  });

  assert.match(line, /^TEST AGENT, 자산 요청서 확인했어\./);
  assert.match(line, /센서|드론|전자전|데이터/);
  assert.equal(
    buildStrategicWelcomeLine({ codename: null, profile: "balanced" }),
    STRATEGIC_DIALOGUE_LINES.welcome,
  );
});

test("strategic item dialogue follows the selected asset function", () => {
  const aircraft = buildStrategicItemLine({
    key: "uh-60-black-hawk",
    name: "UH-60 블랙 호크",
    available: true,
  });
  const vehicle = buildStrategicItemLine({
    key: "m1-abrams",
    name: "M1 에이브람스",
    available: true,
  });
  const electronic = buildStrategicItemLine({
    key: "portable-emp-launcher",
    name: "휴대용 EMP 총",
    available: true,
  });

  assert.equal(aircraft.mood, "systems");
  assert.match(aircraft.text, /조종 인원|비행 시간|급유/);
  assert.equal(vehicle.mood, "inspect");
  assert.match(vehicle.text, /승무원|노면|견인/);
  assert.equal(electronic.mood, "systems");
  assert.match(electronic.text, /전력|통신|신호/);
});

test("unavailable assets block inspection and dispatch", () => {
  const item = {
    key: "future-asset",
    name: "시험 자산",
    available: false,
  };

  assert.deepEqual(buildStrategicItemLine(item), {
    mood: "blocked",
    text: STRATEGIC_DIALOGUE_LINES.unavailable,
  });
  assert.equal(
    buildStrategicDispatchLine(item),
    STRATEGIC_DIALOGUE_LINES.unavailable,
  );
});

test("dispatch dialogue preserves asset handoff responsibilities", () => {
  const line = buildStrategicDispatchLine({
    key: "hmmwv-humvee",
    name: "HMMWV (험비)",
    available: true,
  });

  assert.match(line, /HMMWV \(험비\).*출고 절차/);
  assert.match(line, /운용 인원.*회수 계획/);
});

test("ratchet beep preset sounds mechanical without matching Towaski", () => {
  const ratchet = new DialogueBeepEngine({ preset: "ratchet" }).getOptions();
  const towaski = new DialogueBeepEngine({ preset: "towaski" }).getOptions();

  assert.equal(ratchet.preset, "ratchet");
  assert.equal(ratchet.wave, "square");
  assert.notEqual(ratchet.pitch, towaski.pitch);
  assert.ok(ratchet.volume < towaski.volume);
});
