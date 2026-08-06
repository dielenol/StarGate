import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const candidate = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/design/neved-pian-bulwark-blueprint-candidate.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("네베드 청사진 후보는 확정된 무기·재료 계약만 보존한다", () => {
  assert.equal(candidate.status, "BLOCKED");
  assert.equal(candidate.readyForWorkshopQuote, false);
  assert.equal(candidate.source.slug, "cmmg-mk47-mutant-nosb-mod");
  assert.deepEqual(candidate.result.damage, {
    melee: 7,
    medium: 12,
    long: 12,
    type: "PHYSICAL",
  });
  assert.equal(candidate.result.ammoCapacity, 12);
  assert.deepEqual(candidate.materials, [
    { slug: "force_core", scope: "CHARACTER", quantity: 1 },
    { slug: "extended-magazine-mod", scope: "CHARACTER", quantity: 1 },
  ]);
  assert.equal(candidate.result.mount.mountActionCost, 1);
  assert.equal(candidate.result.mount.blocksMovement, true);
  assert.equal(candidate.result.mount.allowsDiagonalFire, true);
});

test("CENSOR-3 후보는 별도 소모품과 공용 재료 투표 경계를 지킨다", () => {
  const ammo = candidate.specialAmmunition;
  assert.equal(ammo.category, "CONSUMABLE");
  assert.equal(ammo.outputQuantity, 3);
  assert.equal(ammo.seasonMaximum, 3);
  assert.equal(ammo.requiresMountedWeapon, true);
  assert.equal(ammo.bonusDamage, 30);
  assert.equal(ammo.damageType, "PSYCHIC");
  assert.equal(ammo.ignoreDefense, true);
  assert.equal(ammo.scaling, "NONE");
  assert.deepEqual(ammo.material, {
    slug: "broken-syllable",
    scope: "SHARED",
    quantity: 3,
  });
  assert.equal(ammo.approval.system, "REGISTRA_DISCORD_VOTE");
  assert.equal(ammo.approval.channelId, "1534753076399833249");
});

test("근거가 없는 운영값은 null과 unresolvedFields로 fail-closed 처리한다", () => {
  assert.equal(candidate.creditCost, null);
  assert.equal(candidate.durationMinutes, null);
  assert.equal(candidate.specialistCodename, null);
  assert.equal(candidate.modificationDomain, null);
  assert.equal(candidate.result.mount.unmountActionCost, null);
  assert.equal(candidate.specialAmmunition.regularAmmoCost, null);
  assert.equal(candidate.specialAmmunition.actionCode, null);
  assert.ok(candidate.unresolvedFields.includes("creditCost"));
  assert.ok(
    candidate.unresolvedFields.includes(
      "specialAmmunition.approval.approvalThreshold",
    ),
  );
});
