import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateSeedInsertCandidate } from "@stargate/shared-db/schemas";

const candidate = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/design/neved-pian-bulwark-blueprint-candidate.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const blueprintSeed = JSON.parse(
  readFileSync(
    new URL(
      "../../../scripts/seed-payloads/equipment-workshop-blueprint-neved-pian-bulwark.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const censorSeed = JSON.parse(
  readFileSync(
    new URL(
      "../../../scripts/seed-payloads/consumable-zulu-0028-censor-3.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("네베드 청사진은 공임·시간·복합 담당과 재료 계약을 완성한다", () => {
  assert.equal(candidate.status, "READY");
  assert.equal(candidate.readyForWorkshopQuote, true);
  assert.equal(candidate.source.slug, "cmmg-mk47-mutant-nosb-mod");
  assert.equal(candidate.creditCost, 1_200);
  assert.equal(candidate.durationMinutes, 180);
  assert.equal(candidate.specialistCodename, "TOWASKI");
  assert.deepEqual(
    candidate.specialistWorkflow.map((step) => step.specialistCodename),
    ["TOWASKI", "VERNIER"],
  );
  assert.deepEqual(candidate.materials, [
    { slug: "force_core", scope: "CHARACTER", quantity: 1 },
    { slug: "extended-magazine-mod", scope: "CHARACTER", quantity: 1 },
  ]);
  assert.deepEqual(candidate.unresolvedFields, []);
});

test("피안의 보루는 돌격소총 사거리·ATK 미적용·거치 다이아몬드 계약을 고정한다", () => {
  assert.deepEqual(candidate.result.damage, {
    near: 7,
    medium: 12,
    long: 12,
    type: "PHYSICAL",
    usesCharacterAttack: false,
    allowedDamageBonus: "NEVED_RIFLE_PASSIVE_ONLY",
  });
  assert.deepEqual(candidate.result.range.bands, [
    { minimumCells: 0, maximumCells: 0, damage: 7 },
    { minimumCells: 1, maximumCells: 2, damage: 12 },
    { minimumCells: 3, maximumCells: 4, damage: 12 },
  ]);
  assert.equal(candidate.result.ammoCapacity, 12);
  assert.equal(candidate.result.mount.mountActionCost, 1);
  assert.equal(candidate.result.mount.unmountActionCost, 1);
  assert.equal(candidate.result.mount.diagonalFireRequiresMounted, true);
  assert.equal(candidate.result.mount.mountedRangeShape, "DIAMOND");
  assert.equal(candidate.result.mount.bonusDamage, 0);
});

test("CENSOR-3 투표는 제작이 아니라 한 발 사용 승인만 과반으로 처리한다", () => {
  const ammo = candidate.specialAmmunition;
  assert.equal(ammo.outputQuantity, 3);
  assert.equal(ammo.regularAmmoCost, 0);
  assert.equal(ammo.actionCode, "U2");
  assert.equal(ammo.bonusDamage, 30);
  assert.equal(ammo.ignoreDefense, true);
  assert.equal(ammo.scaling, "NONE");
  assert.equal(ammo.approval.scope, "ONE_ROUND_PER_APPROVED_VOTE");
  assert.equal(ammo.approval.approvalThreshold, "YES_GT_CAST_BALLOTS_DIV_2");
  assert.equal(ammo.approval.tieRule, "REJECTED");
  assert.equal(ammo.approval.noVoteRule, "REJECTED");
  assert.equal(
    ammo.approval.resolution,
    "MAJORITY_ON_RESOLVE_COMMAND_AFTER_DEADLINE",
  );
  assert.equal(ammo.approval.binding, "FUNGIBLE_ONE_USE_APPROVAL");
  assert.equal(ammo.approval.claimOrder, "OLDEST_APPROVED_UNUSED_FIRST");
  assert.equal(ammo.approval.claimLimit, 1);
});

test("실행 청사진 seed는 후보 계약과 같은 전투 수치를 보존한다", () => {
  const defaults = blueprintSeed.update.$setOnInsert.defaults;
  assert.equal(defaults.creditCost, 1_200);
  assert.equal(defaults.durationMinutes, 180);
  assert.equal(defaults.result.combatProfile.weaponAttack.usesCharacterAttack, false);
  assert.deepEqual(
    defaults.result.combatProfile.weaponAttack.damageByRange.map(
      (band) => band.damage.amount,
    ),
    [7, 12, 12],
  );
  const censor = defaults.result.equipmentActions.find(
    (action) => action.code === "U2",
  );
  assert.equal(censor.kind, "CONSUMABLE");
  assert.equal(censor.consumableCost.quantity, 1);
  assert.equal(censor.additionalDamage.amount, 30);
});

test("청사진과 CENSOR-3 seed는 공유 DB의 완전 문서 schema를 통과한다", () => {
  assert.doesNotThrow(() =>
    validateSeedInsertCandidate(
      "equipment_workshop_blueprints",
      blueprintSeed.update.$setOnInsert,
    ),
  );
  assert.doesNotThrow(() =>
    validateSeedInsertCandidate("master_items", censorSeed.payload),
  );
});
