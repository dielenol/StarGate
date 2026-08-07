import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseFrontmatter,
  toDbConsumable,
  toDbEquipment,
  validateSeedInsertCandidate,
} from "@stargate/shared-db/schemas";

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

const blueprintV2Update = JSON.parse(
  readFileSync(
    new URL(
      "../../../scripts/seed-payloads/equipment-workshop-blueprint-neved-pian-bulwark-v2.json",
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

const censorSpec = readFileSync(
  new URL(
    "../../../docs/spec/consumable/zulu-0028-censor-3.md",
    import.meta.url,
  ),
  "utf8",
);

const bulwarkSpec = readFileSync(
  new URL(
    "../../../docs/spec/equipment/cmmg-mk47-mutant-pian-bulwark.md",
    import.meta.url,
  ),
  "utf8",
);

test("네베드 청사진은 공임·시간·복합 담당과 재료 계약을 완성한다", () => {
  assert.equal(candidate.status, "READY");
  assert.equal(candidate.readyForWorkshopQuote, true);
  assert.equal(candidate.source.slug, "cmmg-mk47-mutant-nosb-mod");
  assert.equal(candidate.creditCost, 1_200);
  assert.equal(candidate.durationMinutes, 1_440);
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

test("CENSOR-3 표결은 배치 제작 권한만 승인하고 발사에는 재승인을 요구하지 않는다", () => {
  const ammo = candidate.specialAmmunition;
  assert.equal(ammo.outputQuantity, 3);
  assert.equal(ammo.regularAmmoCost, 0);
  assert.equal(ammo.actionCode, "U2");
  assert.equal(ammo.sanDamage, 15);
  assert.equal(ammo.damageType, "SOUND");
  assert.equal(ammo.targetStat, "SAN");
  assert.equal(ammo.dealsHitPointDamage, false);
  assert.equal(ammo.ignoreDefense, true);
  assert.equal(ammo.scaling, "NONE");
  assert.equal(
    ammo.attackResolution,
    "BASE_WEAPON_PHYSICAL_PLUS_FIXED_SAN_DAMAGE",
  );
  assert.equal(
    ammo.manufactureApproval.scope,
    "BATCH_MANUFACTURE_AUTHORIZATION",
  );
  assert.equal(
    ammo.manufactureApproval.presetKey,
    "zulu-0028-censor-3-manufacture-v2",
  );
  assert.equal(ammo.manufactureApproval.durationHours, 6);
  assert.equal(
    ammo.manufactureApproval.approvalThreshold,
    "YES_GT_CAST_BALLOTS_DIV_2",
  );
  assert.equal(ammo.manufactureApproval.tieRule, "REJECTED");
  assert.equal(ammo.manufactureApproval.noVoteRule, "REJECTED");
  assert.equal(
    ammo.manufactureApproval.effect,
    "MANUFACTURE_AUTHORITY_ONLY",
  );
  assert.equal(
    ammo.manufactureApproval.workshopExecution,
    "LINKED_CLAIM_TIME_CONDITIONAL_EXECUTION",
  );
  assert.equal(ammo.manufactureApproval.materialReservation, "NONE");
  assert.equal(
    ammo.manufactureApproval.approvedClaimBehavior,
    "RECHECK_AND_ATOMICALLY_CONSUME_AT_CLAIM",
  );
  assert.equal(ammo.manufactureApproval.consumableUseApproval, "NOT_REQUIRED");
});

test("실행 청사진 seed는 후보 계약과 같은 전투 수치를 보존한다", () => {
  assert.equal(blueprintSeed.update.$setOnInsert.version, 2);
  const defaults = blueprintSeed.update.$setOnInsert.defaults;
  assert.equal(defaults.creditCost, 1_200);
  assert.equal(defaults.durationMinutes, 1_440);
  assert.deepEqual(defaults.approvalGate.conditionalMaterials, [
    { slug: "broken-syllable", scope: "SHARED", quantity: 3 },
  ]);
  assert.deepEqual(defaults.approvalGate.approvedOutputs, [
    { slug: "zulu-0028-censor-3", quantity: 3 },
  ]);
  assert.equal(defaults.result.combatProfile.weaponAttack.usesCharacterAttack, false);
  assert.deepEqual(
    defaults.result.combatProfile.weaponAttack.damageByRange.map(
      (band) => band.damage.amount,
    ),
    [7, 12, 12],
  );
  const mount = defaults.result.equipmentActions.find(
    (action) => action.code === "U1",
  );
  assert.equal(mount.name, "총기 거치 전환");
  assert.equal(mount.kind, "STANCE");
  assert.equal(mount.actionCost, 1);
  assert.match(mount.effect, /거치와 해제는 각각 액션 1/);
  assert.match(mount.effect, /자세한 범위는 훈련장을 참조/);
  const censor = defaults.result.equipmentActions.find(
    (action) => action.code === "U2",
  );
  assert.equal(censor.name, "파쇄음절탄 사격");
  assert.equal(censor.kind, "CONSUMABLE");
  assert.equal(censor.consumableCost.quantity, 1);
  assert.equal("approval" in censor.consumableCost, false);
  assert.equal(censor.additionalDamage.type, "SOUND");
  assert.equal(censor.additionalDamage.amount, 15);
  assert.equal(censor.additionalDamage.ignoresDefense, true);
  assert.match(censor.effect, /대상 SAN을 고정 15 감소/);
  assert.match(censor.effect, /SAN 감소는 HP 추가 피해가 아니다/);
});

test("운영 DRAFT v1 갱신 후보는 액션 계약만 v2로 안전하게 올린다", () => {
  const defaults = blueprintSeed.update.$setOnInsert.defaults;
  const update = blueprintV2Update.update.$set;
  const postcondition = blueprintV2Update.postcondition;
  assert.equal(blueprintV2Update.filter.version, 1);
  assert.equal(blueprintV2Update.filter.status, "DRAFT");
  assert.equal(update.version, 2);
  assert.deepEqual(
    update["defaults.result.equipmentActions"],
    defaults.result.equipmentActions,
  );
  assert.equal(
    update["defaults.approvalGate.content"],
    defaults.approvalGate.content,
  );
  assert.equal(
    update["defaults.approvalGate.presetKey"],
    defaults.approvalGate.presetKey,
  );
  assert.equal(
    update["defaults.result.effect"],
    defaults.result.effect,
  );
  assert.deepEqual(
    Object.keys(update).sort(),
    [
      "defaults.approvalGate.content",
      "defaults.approvalGate.presetKey",
      "defaults.result.effect",
      "defaults.result.equipmentActions",
      "version",
    ],
  );
  assert.match(censorSeed.payload.effect, /SAN을 고정 15 감소/);
  assert.match(censorSeed.payload.effect, /HP 추가 피해가 아니다/);
  assert.equal(
    postcondition["defaults.approvalGate.content"],
    defaults.approvalGate.content,
  );
  assert.equal(postcondition["defaults.result.effect"], defaults.result.effect);
  assert.equal(
    postcondition["defaults.result.equipmentActions.0.effect"],
    defaults.result.equipmentActions[0].effect,
  );
  assert.equal(
    postcondition["defaults.result.equipmentActions.1.effect"],
    defaults.result.equipmentActions[1].effect,
  );
  assert.equal(
    postcondition[
      "defaults.result.equipmentActions.1.additionalDamage.ignoresDefense"
    ],
    true,
  );
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

test("CENSOR-3 비공개 로어 SSOT는 기본 물리 피해와 방어 무시 SAN 15 감소를 분리한다", () => {
  const sources = [
    censorSpec,
    bulwarkSpec,
    censorSeed.payload.effect,
    censorSeed.payload.loreMd,
    censorSeed.payload.lore.notes,
  ];

  for (const source of sources) {
    assert.match(source, /(?:SAN을 고정 15 감소|SAN 15 감소)/);
    assert.match(source, /방어/);
    assert.match(source, /무시/);
    assert.match(source, /SAN/);
    assert.match(source, /HP 추가 피해가 아니/);
    assert.doesNotMatch(source, /심령 피해/);
    assert.doesNotMatch(source, /SAN(?:을)?\s*추가/);
  }
  assert.equal(censorSeed.payload.isPublic, false);
  assert.equal(censorSeed.payload.isAvailable, false);

  const parsedCensorSpec = parseFrontmatter(censorSpec, {
    allowMissing: false,
    fileName: "zulu-0028-censor-3.md",
  });
  const parsedBulwarkSpec = parseFrontmatter(bulwarkSpec, {
    allowMissing: false,
    fileName: "cmmg-mk47-mutant-pian-bulwark.md",
  });
  const censorDoc = toDbConsumable(
    parsedCensorSpec.data,
    parsedCensorSpec.body,
  );
  const bulwarkDoc = toDbEquipment(
    parsedBulwarkSpec.data,
    parsedBulwarkSpec.body,
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(censorDoc)),
    censorSeed.payload,
  );
  assert.equal(censorDoc.isPublic, false);
  assert.equal(bulwarkDoc.isPublic, false);
});
