import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE_PAYLOAD_URL = new URL(
  "../../../scripts/seed-payloads/equipment-basic-armory-catalog-2026-07-06.json",
  import.meta.url,
);
const FOCUSED_PAYLOAD_URL = new URL(
  "../../../scripts/seed-payloads/equipment-ranged-weapon-rules-2026-07-29.json",
  import.meta.url,
);
const EQUIPMENT_SPEC_ROOT = new URL("../../../docs/spec/equipment/", import.meta.url);

const EXPECTED = {
  "basic-pistol": {
    price: 50,
    damage: "근거리 7 물리 / 중거리 5 물리",
    fragments: ["탄환은 5/5", "같은 영역은 근거리"],
  },
  "basic-assault-rifle": {
    price: 200,
    damage: "근거리 5 물리 / 중거리 10 물리 / 장거리 7 물리",
    fragments: ["탄환은 6/6", "자동소총"],
  },
  "basic-shotgun": {
    price: 200,
    damage: "근거리 15 물리 / 중거리 5 물리",
    fragments: ["탄환은 4/4", "넉백", "탄환 2"],
  },
  "basic-heavy-machine-gun": {
    price: 500,
    damage: "중거리 15 물리 / 장거리 10 물리",
    fragments: ["탄환은 10/10", "매 턴 2회", "광역 난사", "4 이하"],
  },
  "basic-sniper-rifle": {
    price: 500,
    damage: "장거리 20 물리",
    fragments: ["탄환은 3/3", "철갑탄", "방어력 10"],
  },
  "basic-flamethrower": {
    price: 500,
    damage: "근거리 10 화염 / 중거리 8 화염",
    fragments: [
      "탄환은 4/4",
      "회복 적용이 되지 않는 한",
      "N의 수치",
      "방어력은 -N",
    ],
  },
  "basic-sonic-emitter": {
    price: 500,
    damage: "중거리 15 소리 / 장거리 3 소리",
    fragments: ["탄환은 3/3", "정신 혼미", "멍함", "20%"],
  },
};

test("seven ranged weapon specs, base payload, and focused update stay in parity", async () => {
  const [basePayload, focusedPayload] = await Promise.all([
    readFile(BASE_PAYLOAD_URL, "utf8").then(JSON.parse),
    readFile(FOCUSED_PAYLOAD_URL, "utf8").then(JSON.parse),
  ]);

  assert.equal(focusedPayload.length, Object.keys(EXPECTED).length);

  for (const [slug, expected] of Object.entries(EXPECTED)) {
    const base = basePayload.find((entry) => entry.payload?.slug === slug)?.payload;
    const focused = focusedPayload.find((entry) => entry.filter?.slug === slug)
      ?.update?.$set;
    const spec = await readFile(new URL(`${slug}.md`, EQUIPMENT_SPEC_ROOT), "utf8");

    assert.ok(base, `${slug} base payload`);
    assert.ok(focused, `${slug} focused payload`);
    assert.equal(base.price, expected.price, `${slug} base price`);
    assert.equal(focused.price, expected.price, `${slug} focused price`);
    assert.equal(base.damage, expected.damage, `${slug} base damage`);
    assert.equal(focused.damage, expected.damage, `${slug} focused damage`);
    assert.equal(base.description, focused.description, `${slug} description`);
    assert.equal(base.loreMd, focused.loreMd, `${slug} loreMd`);
    assert.equal(base.lore.notes, focused["lore.notes"], `${slug} lore notes`);

    for (const fragment of expected.fragments) {
      assert.match(spec, new RegExp(fragment), `${slug} spec: ${fragment}`);
      assert.match(base.loreMd, new RegExp(fragment), `${slug} payload: ${fragment}`);
    }
  }

  const heavyMachineGun = focusedPayload.find(
    (entry) => entry.filter?.slug === "basic-heavy-machine-gun",
  ).update.$set;
  assert.doesNotMatch(heavyMachineGun.loreMd, /3턴마다|원거리 10/);

  const flamethrower = focusedPayload.find(
    (entry) => entry.filter?.slug === "basic-flamethrower",
  ).update.$set;
  assert.match(flamethrower.loreMd, /N의 수치/);
  assert.match(flamethrower.loreMd, /회복 적용이 되지 않는 한/);
  assert.match(flamethrower.loreMd, /방어력에 적용되는 -N이 누적/);
});
