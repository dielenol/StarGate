import assert from "node:assert/strict";
import test from "node:test";

import { DialogueBeepEngine } from "../../audio/dialogue-beep-engine.ts";
import {
  buildTemperCartLine,
  buildTemperItemLine,
  buildTemperTabLine,
  buildTemperWelcomeLine,
  TEMPER_DIALOGUE_LINES,
} from "../temper-dialogue.ts";

const ACHERON_ITEMS = [
  ["basic-assault-shield", "보급형 공격 방패", /공격 방패|방패로/],
  [
    "old-tactical-sword-titanium-shield",
    "보급형 구식 전술 도검 & 경량 티타늄 합금 방패",
    /구식|검과 방패/,
  ],
  ["basic-dagger", "보급형 단검", /단검/],
  ["basic-katana", "보급형 카타나", /카타나|칼끝/],
  ["basic-longsword", "보급형 롱소드", /롱소드|긴 칼/],
  ["basic-blunt-weapon", "보급형 둔기", /둔기|무게/],
  ["basic-chainsaw", "보급형 전기톱", /전기톱|시동/],
];

test("welcome dialogue addresses the assigned AGENT and reflects profile", () => {
  const line = buildTemperWelcomeLine({
    codename: "TEST AGENT",
    profile: "assault",
  });

  assert.match(line, /^TEST AGENT, 손부터 보여줘\./);
  assert.match(line, /손|힘|무게중심/);
  assert.equal(
    buildTemperWelcomeLine({ codename: null, profile: "balanced" }),
    TEMPER_DIALOGUE_LINES.welcome,
  );
});

test("all current Acheron items have specific inspection and cart dialogue", () => {
  for (const [key, name, pattern] of ACHERON_ITEMS) {
    const item = { key, name, category: "WEAPON", available: true };
    const inspection = buildTemperItemLine(item);
    const cart = buildTemperCartLine(item);

    assert.match(inspection.text, pattern);
    assert.notEqual(cart, inspection.text);
    assert.doesNotMatch(cart, /토와스키|총열|탄약/);
  }
});

test("repeated Acheron interactions rotate through distinct dialogue", () => {
  const item = {
    key: "basic-blunt-weapon",
    name: "보급형 둔기",
    category: "WEAPON",
    available: true,
  };

  const inspections = new Set(
    [0, 1, 2].map((variant) => buildTemperItemLine(item, variant).text),
  );
  const cartLines = new Set(
    [0, 1, 2].map((variant) => buildTemperCartLine(item, variant)),
  );
  const tabLines = new Set(
    [0, 1, 2].map((variant) => buildTemperTabLine("WEAPON", variant)),
  );

  assert.equal(inspections.size, 3);
  assert.equal(cartLines.size, 3);
  assert.equal(tabLines.size, 3);
});

test("unavailable and future catalog items use safe fallback dialogue", () => {
  const unavailable = buildTemperItemLine({
    key: "future-blade",
    name: "시험 도검",
    category: "WEAPON",
    available: false,
  });
  const futureArmor = buildTemperItemLine({
    key: "future-shield",
    name: "시험 방패",
    category: "ARMOR",
    available: true,
  });

  assert.equal(unavailable.mood, "blocked");
  assert.equal(unavailable.text, TEMPER_DIALOGUE_LINES.unavailable);
  assert.equal(futureArmor.mood, "balance");
  assert.match(futureArmor.text, /시험 방패|충격/);
});

test("tab dialogue stays within Acheron forge responsibilities", () => {
  assert.match(buildTemperTabLine("WEAPON"), /근접무기/);
  assert.match(buildTemperTabLine("ARMOR"), /방호/);
  assert.doesNotMatch(buildTemperTabLine("ALL"), /화기|라이센스/);
});

test("temper beep preset is lower and more resonant than the lab voice", () => {
  const engine = new DialogueBeepEngine({ preset: "temper" });
  const options = engine.getOptions();

  assert.equal(options.preset, "temper");
  assert.equal(options.wave, "triangle");
  assert.ok(options.pitch < 500);
  assert.ok(options.duration >= 0.03);
});
