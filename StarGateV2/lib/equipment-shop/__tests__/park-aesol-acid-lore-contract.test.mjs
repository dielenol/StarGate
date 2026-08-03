import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BIG_BOY_PAYLOAD_URL = new URL(
  "../../../scripts/seed-payloads/agent-big-boy-park-aesol.json",
  import.meta.url,
);
const STATUS_UPDATE_PAYLOAD_URL = new URL(
  "../../../scripts/seed-payloads/wiki-status-effects-acid-2026-08-03.json",
  import.meta.url,
);
const BIG_BOY_UPDATE_PAYLOAD_URL = new URL(
  "../../../scripts/seed-payloads/agent-big-boy-combat-abilities-2026-08-03.json",
  import.meta.url,
);
const ABILITY_RULE_URL = new URL(
  "../../../../packages/core/src/domain/agent-combat-abilities.ts",
  import.meta.url,
);
const STATUS_RULE_URL = new URL(
  "../../../../packages/core/src/domain/status-effects.ts",
  import.meta.url,
);
const ABILITY_LORE_URL = new URL(
  "../../../../docs/lore/concept/park-aesol-flamethrower-abilities.md",
  import.meta.url,
);
const ACID_LORE_URL = new URL(
  "../../../../docs/lore/concept/acid-status-effect.md",
  import.meta.url,
);

test("박애솔 A1·A2는 캐릭터 payload, 공용 규칙, 로어북에 함께 기록된다", async () => {
  const [bigBoyPayload, bigBoyUpdate, abilityRule, abilityLore] = await Promise.all([
    readFile(BIG_BOY_PAYLOAD_URL, "utf8").then(JSON.parse),
    readFile(BIG_BOY_UPDATE_PAYLOAD_URL, "utf8").then(JSON.parse),
    readFile(ABILITY_RULE_URL, "utf8"),
    readFile(ABILITY_LORE_URL, "utf8"),
  ]);
  const abilities = new Map(
    bigBoyPayload.payload.play.abilities.map((ability) => [ability.slot, ability]),
  );

  assert.equal(abilities.get("A1")?.name, "불쇼");
  assert.match(abilities.get("A1")?.effect ?? "", /탄환 소모도 두 배/);
  assert.match(abilities.get("A1")?.effect ?? "", /N치도 10/);
  assert.match(abilities.get("A1")?.effect ?? "", /SAN치 5/);
  assert.equal(abilities.get("A2")?.name, "다목적 방사기");
  assert.match(abilities.get("A2")?.effect ?? "", /화염, 냉기, 산성/);
  assert.match(bigBoyPayload.payload.loreMd, /## 능력 조형/);

  const serializedUpdate = JSON.stringify(bigBoyUpdate);
  assert.match(serializedUpdate, /불쇼/);
  assert.match(serializedUpdate, /다목적 방사기/);
  assert.match(serializedUpdate, /play\.abilities/);
  assert.doesNotMatch(serializedUpdate, /\$setOnInsert/);

  for (const text of [abilityRule, abilityLore]) {
    assert.match(text, /불쇼/);
    assert.match(text, /다목적 방사기/);
    assert.match(text, /SAN/);
  }
  assert.match(abilityRule, /source-unspecified/);
  assert.match(abilityLore, /임의 판정하지 않는다/);
});

test("산성은 공용 규칙, 위키 갱신 payload, 로어북에서 같은 임계 효과를 유지한다", async () => {
  const [statusUpdate, statusRule, acidLore] = await Promise.all([
    readFile(STATUS_UPDATE_PAYLOAD_URL, "utf8").then(JSON.parse),
    readFile(STATUS_RULE_URL, "utf8"),
    readFile(ACID_LORE_URL, "utf8"),
  ]);
  const serializedUpdate = JSON.stringify(statusUpdate);

  for (const text of [serializedUpdate, statusRule, acidLore]) {
    assert.match(text, /산성/);
    assert.match(text, /0\.5|절반/);
    assert.match(text, /방어력/);
    assert.match(text, /초기화|reset-corrosion-loss/);
  }
  assert.match(serializedUpdate, /부식/);
  assert.match(statusRule, /ignoresDefense: true/);
  assert.match(acidLore, /자체적인 피해를 주지 않는다/);
});
