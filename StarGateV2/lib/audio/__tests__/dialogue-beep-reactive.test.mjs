import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DialogueBeepEngine,
  ReactiveDialogueBeepGate,
} from "../dialogue-beep-engine.ts";

const HOOK_URL = new URL(
  "../../../hooks/useReactiveDialogueBeep.ts",
  import.meta.url,
);
const SIMULATOR_URL = new URL(
  "../../../app/(erp)/erp/equipment-shop/simulator/EquipmentSimulatorClient.tsx",
  import.meta.url,
);
const FACTION_URL = new URL(
  "../../../app/(erp)/erp/factions/[code]/FactionContactClient.tsx",
  import.meta.url,
);
const NPC_HOOK_URL = new URL(
  "../../../hooks/useNpcDialogue.ts",
  import.meta.url,
);
const BEEP_LAB_URL = new URL(
  "../../../app/(erp)/erp/admin/dialogue-beep/DialogueBeepLabClient.tsx",
  import.meta.url,
);

const EXPECTED_PRESETS = {
  r05: [640, 34, 0.44, "square", 0.02, 0.002, 4, 1],
  council: [540, 48, 0.44, "triangle", 0.026, 0.004, 6, 1],
  military: [450, 38, 0.5, "square", 0.022, 0.002, 5, 1],
  civil: [690, 50, 0.42, "soft", 0.03, 0.006, 8, 2],
  rose: [720, 42, 0.43, "triangle", 0.026, 0.004, 10, 2],
  tech: [610, 36, 0.46, "sawtooth", 0.022, 0.002, 7, 2],
  hostile: [470, 52, 0.4, "sine", 0.03, 0.006, 3, 1],
};

class FakeAudioParam {
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeOscillator {
  constructor(context) {
    this.context = context;
    this.frequency = new FakeAudioParam();
    this.type = "sine";
    this.onended = null;
  }
  connect() {}
  disconnect() {}
  start() {
    this.context.started += 1;
  }
  stop() {}
}

class FakeGain {
  constructor() {
    this.gain = new FakeAudioParam();
  }
  connect() {}
  disconnect() {}
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
    this.state = "running";
    this.started = 0;
  }
  createOscillator() {
    return new FakeOscillator(this);
  }
  createGain() {
    return new FakeGain();
  }
  async resume() {}
  async close() {
    this.state = "closed";
  }
}

test("reactive dialogue presets keep the approved tone values", () => {
  for (const [preset, expected] of Object.entries(EXPECTED_PRESETS)) {
    const options = new DialogueBeepEngine({ preset }).getOptions();
    assert.deepEqual(
      [
        options.pitch,
        options.speed,
        options.volume,
        options.wave,
        options.duration,
        options.attack,
        options.frequencyVariance,
        options.wobble,
      ],
      expected,
      preset,
    );
  }

  const r05 = new DialogueBeepEngine({ preset: "r05" });
  const military = new DialogueBeepEngine({ preset: "military" });
  const hostile = new DialogueBeepEngine({ preset: "hostile" });
  assert.equal(r05.getPauseFor(" "), 28);
  assert.equal(r05.getPauseFor("."), 90);
  assert.equal(military.getPauseFor(" "), 30);
  assert.equal(military.getPauseFor("."), 100);
  assert.equal(hostile.getPauseFor(" "), 44);
  assert.equal(hostile.getPauseFor("."), 150);
});

test("every new NPC preset oscillates for Korean text but not punctuation", async () => {
  for (const preset of Object.keys(EXPECTED_PRESETS)) {
    const audioContext = new FakeAudioContext();
    const engine = new DialogueBeepEngine({ audioContext, preset });
    const result = await engine.typeText(
      "가.",
      {},
      {
        initialDelay: 0,
        speed: 0,
        punctuationPauses: { ".": 0 },
      },
    );

    assert.equal(result.soundedChars, 1, `${preset} should skip punctuation`);
    assert.ok(audioContext.started >= 2, `${preset} should create oscillators`);
  }
});

test("starting a new line can cancel an in-flight typewriter", async () => {
  const audioContext = new FakeAudioContext();
  const engine = new DialogueBeepEngine({ audioContext, preset: "r05" });
  const first = engine.typeText("첫 번째 안내", {}, { initialDelay: 0, speed: 50 });
  engine.stop();
  const result = await first;

  assert.equal(result.canceled, true);
});

test("message gate silences initial and pre-gesture lines and deduplicates ids", () => {
  const gate = new ReactiveDialogueBeepGate("initial");

  assert.deepEqual(gate.consume("initial"), {
    changed: false,
    shouldPlay: false,
  });
  assert.deepEqual(gate.consume("changed-before-gesture"), {
    changed: true,
    shouldPlay: false,
  });
  gate.markInteractionReady();
  assert.deepEqual(gate.consume("changed-before-gesture"), {
    changed: false,
    shouldPlay: false,
  });
  assert.deepEqual(gate.consume("first-spoken-change"), {
    changed: true,
    shouldPlay: true,
  });
  assert.deepEqual(gate.consume("first-spoken-change"), {
    changed: false,
    shouldPlay: false,
  });
  assert.deepEqual(gate.consume("disabled-change", false), {
    changed: true,
    shouldPlay: false,
  });
  assert.deepEqual(gate.consume("disabled-change"), {
    changed: false,
    shouldPlay: false,
  });
  assert.deepEqual(gate.consume("next-spoken-change"), {
    changed: true,
    shouldPlay: true,
  });
});

test("hook cancels the previous line before speaking a new message", async () => {
  const hook = await readFile(HOOK_URL, "utf8");

  assert.match(hook, /gateRef\.current = new ReactiveDialogueBeepGate\(messageId\)/);
  assert.match(hook, /window\.addEventListener\("pointerdown", markReady/);
  assert.match(hook, /window\.addEventListener\("keydown", markReady/);
  assert.match(
    hook,
    /const decision = gateRef\.current\?\.consume\(messageId, enabled\)[\s\S]*if \(!engine \|\| !decision\?\.changed\) return;[\s\S]*engine\.stop\(\);[\s\S]*if \(!decision\.shouldPlay\) return;[\s\S]*engine\.typeText\(text/,
  );
});

test("entry audio primes future lines without replaying the static welcome", async () => {
  const hook = await readFile(NPC_HOOK_URL, "utf8");

  assert.match(hook, /await audio\.play\(\);\s*markDialogueReady\(\);/);
  assert.doesNotMatch(
    hook,
    /playLineRef\.current\(welcomeMoodRef\.current, welcomeLineRef\.current/,
  );
});

test("R-05 and faction consumers beep only their spoken base line", async () => {
  const [simulator, faction] = await Promise.all([
    readFile(SIMULATOR_URL, "utf8"),
    readFile(FACTION_URL, "utf8"),
  ]);

  assert.match(simulator, /type InstructorBrief = \{[\s\S]*id: string;[\s\S]*title: string;[\s\S]*speech: string;[\s\S]*instruction: string;/);
  assert.match(
    simulator,
    /useReactiveDialogueBeep\(\{\s*messageId: instructorBrief\.id,\s*text: instructorBrief\.speech,\s*preset: "r05"/,
  );
  assert.match(
    simulator,
    /\{instructorBrief\.speech\} \{instructorBrief\.instruction\}/,
  );
  for (const state of [
    "blocked",
    "attack",
    "reload",
    "install",
    "uninstall",
    "turn",
  ]) {
    assert.match(
      simulator,
      new RegExp(`id: ${"`"}${state}:`),
      `${state} should own a message id`,
    );
  }
  assert.doesNotMatch(simulator, /speech:\s*[^\n]*버튼/u);
  assert.match(simulator, /instruction:\s*`[^`]*버튼/u);

  assert.match(faction, /type DialoguePhase = "idle" \| "preview" \| "confirmed" \| "error"/);
  assert.match(faction, /case "WHITE_ROSE":\s*return "rose"/);
  assert.match(faction, /case "SPACE_ZERO":\s*return "tech"/);
  assert.match(faction, /default:\s*return hostile \? "hostile" : "operator"/);
  assert.match(
    faction,
    /useReactiveDialogueBeep\(\{[\s\S]*text: baseDialogueLine,[\s\S]*preset: factionDialoguePreset\(code, hostile\)/,
  );
  assert.match(faction, /data-dialogue-phase=\{dialoguePhase\}/);
  assert.match(faction, /setDialoguePhase\("confirmed"\)/);
  assert.match(faction, /setDialoguePhase\("error"\)/);
});

test("admin beep lab samples select the matching character preset", async () => {
  const source = await readFile(BEEP_LAB_URL, "utf8");

  for (const [id, preset] of [
    ["r05", "r05"],
    ["council", "council"],
    ["military", "military"],
    ["civil", "civil"],
    ["rose", "rose"],
    ["tech", "tech"],
    ["hostile", "hostile"],
  ]) {
    assert.match(
      source,
      new RegExp(`id: "${id}",[\\s\\S]{0,100}preset: "${preset}"`),
    );
  }
  assert.match(source, /applyPreset\(sample\.preset\)/);
  assert.match(source, /setPortraitLabel\(sample\.portrait\)/);
  assert.match(source, /setPortraitLabel\(PORTRAIT_LABELS\[nextPreset\]\)/);
  assert.match(source, /\{portraitLabel\}/);
  assert.doesNotMatch(
    source,
    /className=\{styles\.hud__portrait\}[^>]*>\s*TIA\s*</u,
  );
  assert.match(source, /onClick=\{\(\) => selectSample\(line\)\}/);
});
