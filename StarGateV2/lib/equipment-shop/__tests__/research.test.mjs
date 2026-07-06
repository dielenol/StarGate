import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
  EQUIPMENT_RESEARCH_CAPS,
  EQUIPMENT_RESEARCH_NODES,
  addHours,
  getEquipmentResearchEffect,
  getEquipmentResearchNode,
  quoteEquipmentResearchRush,
} from "../research.ts";

test("T1 research only gives tiny HP/SAN bonuses and no direct ATK/DEF node", () => {
  const tierOneEffects = EQUIPMENT_RESEARCH_NODES.filter(
    (node) => node.tier === 1,
  ).flatMap((node) => Object.values(node.effects));

  assert.ok(
    tierOneEffects.some(
      (effect) =>
        effect?.kind === "stat" &&
        effect.stat === "hp" &&
        effect.amount === 2,
    ),
  );
  assert.ok(
    tierOneEffects.some(
      (effect) =>
        effect?.kind === "stat" &&
        effect.stat === "san" &&
        effect.amount === 2,
    ),
  );
  assert.equal(
    tierOneEffects.some(
      (effect) => effect?.kind === "stat" && effect.stat === "atk",
    ),
    false,
  );
  assert.equal(
    tierOneEffects.some(
      (effect) => effect?.kind === "stat" && effect.stat === "def",
    ),
    false,
  );
});

test("DEF is only available through the personal T5 final protocol", () => {
  const defNodes = EQUIPMENT_RESEARCH_NODES.filter((node) =>
    Object.values(node.effects).some(
      (effect) => effect?.kind === "stat" && effect.stat === "def",
    ),
  );

  assert.deepEqual(
    defNodes.map((node) => node.key),
    ["AEG-05"],
  );
  assert.equal(defNodes[0].tier, 5);
  assert.deepEqual(defNodes[0].allowedScopes, ["personal"]);
  assert.deepEqual(getEquipmentResearchEffect(defNodes[0], "team"), null);
  assert.equal(EQUIPMENT_RESEARCH_CAPS.def, 1);
});

test("T5 rush can reduce 150 days down to 120 days, then stops", () => {
  const node = getEquipmentResearchNode("BIO-05");
  assert.ok(node);

  const startedAt = new Date("2026-08-03T00:00:00.000Z");
  const project = {
    tier: 5,
    startedAt,
    completedAt: addHours(startedAt, node.durationHours),
    rushUsed: 0,
    rushDiscountUsed: false,
  };

  for (let i = 0; i < 10; i += 1) {
    const quote = quoteEquipmentResearchRush({
      node,
      project,
      capabilities: DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
    });
    assert.ok(quote, `rush quote ${i + 1} should exist`);
    project.completedAt = quote.nextCompletedAt;
    project.rushUsed += 1;
  }

  assert.equal(
    project.completedAt.toISOString(),
    "2026-12-01T00:00:00.000Z",
  );
  assert.equal(
    quoteEquipmentResearchRush({
      node,
      project,
      capabilities: DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
    }),
    null,
  );
});

test("LAB-01 applies a 10 percent discount to the first rush quote", () => {
  const node = getEquipmentResearchNode("BIO-02");
  assert.ok(node);

  const startedAt = new Date("2026-07-06T00:00:00.000Z");
  const quote = quoteEquipmentResearchRush({
    node,
    project: {
      tier: 2,
      startedAt,
      completedAt: addHours(startedAt, node.durationHours),
      rushUsed: 0,
      rushDiscountUsed: false,
    },
    capabilities: {
      ...DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
      rushDiscountPercent: 10,
    },
  });

  assert.ok(quote);
  assert.equal(quote.cost, 90);
  assert.equal(quote.hours, 12);
  assert.equal(quote.discountApplied, true);
});
