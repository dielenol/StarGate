import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
  EQUIPMENT_RESEARCH_CAPS,
  EQUIPMENT_RESEARCH_NODES,
  addHours,
  applyEquipmentResearchCapabilityEffect,
  getEquipmentResearchEffect,
  getEquipmentResearchNode,
  getEquipmentResearchPrerequisiteTier,
  isEquipmentResearchApplyLeaseStale,
  quoteEquipmentResearchRush,
  quoteEquipmentResearchStart,
} from "../research.ts";

test("applying reservation becomes recoverable only after its lease expires", () => {
  const now = new Date("2026-07-11T08:00:00.000Z");

  assert.equal(
    isEquipmentResearchApplyLeaseStale("2026-07-11T07:55:01.000Z", now),
    false,
  );
  assert.equal(
    isEquipmentResearchApplyLeaseStale("2026-07-11T07:55:00.000Z", now),
    true,
  );
  assert.equal(isEquipmentResearchApplyLeaseStale("invalid", now), false);
});

test("T1 research splits HP/SAN into small bonuses without direct ATK/DEF", () => {
  const tierOneEffects = EQUIPMENT_RESEARCH_NODES.filter(
    (node) => node.tier === 1,
  ).flatMap((node) => Object.values(node.effects));

  assert.equal(
    tierOneEffects.filter(
      (effect) =>
        effect?.kind === "stat" &&
        effect.stat === "hp" &&
        effect.amount === 1,
    ).length >= 2,
    true,
  );
  assert.equal(
    tierOneEffects.filter(
      (effect) =>
        effect?.kind === "stat" &&
        effect.stat === "san" &&
        effect.amount === 1,
    ).length >= 2,
    true,
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

test("team research has segmented options without team DEF or points", () => {
  const teamNodesByTier = new Map();
  for (const node of EQUIPMENT_RESEARCH_NODES) {
    if (!node.allowedScopes.includes("team")) continue;
    const bucket = teamNodesByTier.get(node.tier) ?? [];
    bucket.push(node.key);
    teamNodesByTier.set(node.tier, bucket);
  }

  assert.ok(teamNodesByTier.get(1)?.includes("BIO-01B"));
  assert.ok(teamNodesByTier.get(2)?.includes("BIO-02"));
  assert.ok(teamNodesByTier.get(2)?.includes("BIO-02B"));
  assert.ok(teamNodesByTier.get(2)?.includes("PSY-02"));
  assert.ok(teamNodesByTier.get(4)?.includes("BIO-04B"));
  assert.ok(teamNodesByTier.get(5)?.includes("BIO-05"));
  assert.ok(teamNodesByTier.get(5)?.includes("PSY-05"));
  assert.ok(teamNodesByTier.get(5)?.includes("MUN-05"));

  const teamT5Effects = EQUIPMENT_RESEARCH_NODES.filter(
    (node) => node.tier === 5,
  )
    .map((node) => getEquipmentResearchEffect(node, "team"))
    .filter(Boolean);
  assert.equal(
    teamT5Effects.some(
      (effect) => effect.kind === "stat" && effect.stat === "def",
    ),
    false,
  );
  assert.equal(teamT5Effects.some((effect) => effect.kind === "point"), false);
});

test("segmented nodes declare same-tier prerequisite keys", () => {
  assert.deepEqual(getEquipmentResearchNode("BIO-01B")?.prerequisiteKeys, [
    "BIO-01",
  ]);
  assert.deepEqual(getEquipmentResearchNode("BIO-02B")?.prerequisiteKeys, [
    "BIO-02",
  ]);
  assert.deepEqual(getEquipmentResearchNode("LAB-03")?.prerequisiteKeys, [
    "LAB-02",
  ]);
});

test("research tiers require the previous tier after T1", () => {
  assert.equal(getEquipmentResearchPrerequisiteTier(1), null);
  assert.equal(getEquipmentResearchPrerequisiteTier(2), 1);
  assert.equal(getEquipmentResearchPrerequisiteTier(3), 2);
  assert.equal(getEquipmentResearchPrerequisiteTier(4), 3);
  assert.equal(getEquipmentResearchPrerequisiteTier(5), 4);
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

test("research start quote applies cost and duration discounts with caps", () => {
  const node = getEquipmentResearchNode("BIO-04");
  assert.ok(node);

  const quote = quoteEquipmentResearchStart({
    node,
    capabilities: {
      ...DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
      researchCostDiscountPercent: 8,
      researchCostDiscountCap: 120,
      researchTimeDiscountPercent: 10,
      researchTimeDiscountMaxHours: 72,
    },
  });

  assert.equal(quote.cost, node.cost - 120);
  assert.equal(quote.costDiscount, 120);
  assert.equal(quote.durationHours, node.durationHours - 72);
  assert.equal(quote.durationReductionHours, 72);
});

test("capability effects merge the strongest economy and lab bonuses", () => {
  let capabilities = { ...DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES };
  for (const effect of [
    { kind: "refund", percent: 5, cap: 75 },
    { kind: "research_cost_discount", percent: 8, cap: 120 },
    { kind: "research_time_discount", percent: 10, maxHours: 72 },
    { kind: "rush_discount", percent: 20 },
    { kind: "credit_bonus", percent: 5, cap: 250 },
  ]) {
    capabilities = applyEquipmentResearchCapabilityEffect(
      capabilities,
      effect,
    );
  }

  assert.equal(capabilities.refundPercent, 5);
  assert.equal(capabilities.refundCap, 75);
  assert.equal(capabilities.researchCostDiscountPercent, 8);
  assert.equal(capabilities.researchCostDiscountCap, 120);
  assert.equal(capabilities.researchTimeDiscountPercent, 10);
  assert.equal(capabilities.researchTimeDiscountMaxHours, 72);
  assert.equal(capabilities.rushDiscountPercent, 20);
  assert.equal(capabilities.creditBonusPercent, 5);
  assert.equal(capabilities.creditBonusCap, 250);
});
