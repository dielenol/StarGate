import assert from "node:assert/strict";
import test from "node:test";

import {
  PARK_AESOL_COMBAT_ABILITIES,
  PARK_AESOL_FLAMETHROWER_ATTRIBUTES,
} from "../dist/domain/agent-combat-abilities.js";

test("불쇼는 쌍수 장착, 탄환 2배, 화상 N 10, 매 자기 턴 SAN 5를 기록한다", () => {
  const fireShow = PARK_AESOL_COMBAT_ABILITIES.A1;

  assert.equal(fireShow.equippedFlamethrowerCount, 2);
  assert.equal(fireShow.ammoConsumptionMultiplier, 2);
  assert.equal(fireShow.burnN, 10);
  assert.deepEqual(fireShow.upkeep, {
    resource: "san",
    amount: 5,
    timing: "each-own-turn",
  });
});

test("불쇼의 불명확한 두 배 대상은 확정 수치로 추론하지 않는다", () => {
  assert.deepEqual(PARK_AESOL_COMBAT_ABILITIES.A1.doubling, {
    multiplier: 2,
    target: "source-unspecified",
    requiresGmClarification: true,
  });
});

test("다목적 방사기는 SAN 10으로 화염방사기 하나의 속성을 선택한다", () => {
  const multipurpose = PARK_AESOL_COMBAT_ABILITIES.A2;

  assert.deepEqual(multipurpose.activationCost, {
    resource: "san",
    amount: 10,
  });
  assert.equal(multipurpose.target.count, 1);
  assert.deepEqual(PARK_AESOL_FLAMETHROWER_ATTRIBUTES, [
    "fire",
    "cold",
    "acid",
  ]);
});
