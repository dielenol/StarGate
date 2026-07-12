import assert from "node:assert/strict";
import test from "node:test";

import { DialogueBeepEngine } from "../../audio/dialogue-beep-engine.ts";
import {
  buildStrategicCheckoutLine,
  buildStrategicDispatchLine,
  buildStrategicItemLine,
  buildStrategicWelcomeLine,
  STRATEGIC_DIALOGUE_LINES,
  STRATEGIC_DIALOGUE_ITEM_KEYS,
} from "../strategic-dialogue.ts";

const CATALOG_ITEMS = [
  ["ch-47-chinook", "CH-47 치누크", /승무원|기관사|쉰 명|여덟 시간/],
  ["uh-60-black-hawk", "UH-60 블랙 호크", /도어 거너|미사일|네 시간|일곱/],
  ["hmmwv-humvee", "HMMWV (험비)", /네 자리|기관총|운전수|험비/],
  ["m1-abrams", "M1 에이브람스", /전차장|포탄|궤도|승무원/],
  ["m977-hemtt-military-truck", "M977 HEMTT 군용트럭", /열여섯|적재|HEMTT|보급/],
  ["medical-ambulance", "의료용 앰뷸런스", /의무품|환자|앰뷸런스|의료/],
  ["drone-self-destruct-mod", "드론 자폭 개조", /정찰|자폭|드론|폭약/],
  ["missile-guidance-laser", "미사일 유도 레이저", /다음 턴|네 개 라인|좌표|미사일/],
  ["stealth-cloak", "스텔스 망토", /여덟 시간|은신|망토|광학/],
  ["electric-barbed-wire-mod", "전기 철조망 개조", /감전|접지|철조망|라인/],
  ["jetpack", "제트팩", /두 라운드|공중|착륙|제트팩/],
  ["extended-magazine-mod", "탄창 개조", /공격 한 번|급탄|탄창|무기 하나/],
  ["portable-emp-launcher", "휴대용 EMP 총", /한 발|삼십 초|전자 장비|드론/],
];

test("welcome dialogue addresses the assigned AGENT and reflects profile", () => {
  const line = buildStrategicWelcomeLine({
    codename: "TEST AGENT",
    profile: "focus",
  });

  assert.match(line, /^TEST AGENT, 요청서 확인했습니다\./);
  assert.match(line, /센서|드론|전자전|데이터/);
  assert.equal(
    buildStrategicWelcomeLine({ codename: null, profile: "balanced" }),
    STRATEGIC_DIALOGUE_LINES.welcome,
  );
});

test("all thirteen strategic items have distinct RATCHET inspection dialogue", () => {
  assert.deepEqual(
    [...STRATEGIC_DIALOGUE_ITEM_KEYS].sort(),
    CATALOG_ITEMS.map(([key]) => key).sort(),
  );

  for (const [key, name, expectedDetail] of CATALOG_ITEMS) {
    const item = { key, name, available: true };
    const variants = [0, 1, 2].map(
      (variant) => buildStrategicItemLine(item, variant).text,
    );

    assert.equal(new Set(variants).size, 3, `${key} should rotate three lines`);
    for (const line of variants) {
      assert.match(line, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`));
    }
    assert.match(variants.join(" "), expectedDetail);
  }
});

test("dispatch and checkout handoff stay item-specific", () => {
  const dispatchLines = new Set();
  const checkoutLines = new Set();

  for (const [key, name] of CATALOG_ITEMS) {
    const item = { key, name, available: true };
    const dispatch = buildStrategicDispatchLine(item);
    const checkout = buildStrategicCheckoutLine(item);
    assert.match(dispatch, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(checkout, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    dispatchLines.add(dispatch);
    checkoutLines.add(checkout);
  }

  assert.equal(dispatchLines.size, CATALOG_ITEMS.length);
  assert.equal(checkoutLines.size, CATALOG_ITEMS.length);
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

  assert.match(line, /HMMWV \(험비\).*출고 준비/);
  assert.match(line, /네 자리.*운전수/);
});

test("ratchet beep preset sounds mechanical without matching Towaski", () => {
  const ratchet = new DialogueBeepEngine({ preset: "ratchet" }).getOptions();
  const towaski = new DialogueBeepEngine({ preset: "towaski" }).getOptions();

  assert.equal(ratchet.preset, "ratchet");
  assert.equal(ratchet.wave, "square");
  assert.notEqual(ratchet.pitch, towaski.pitch);
  assert.ok(ratchet.volume < towaski.volume);
});
