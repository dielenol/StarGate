import assert from "node:assert/strict";
import test from "node:test";

import {
  applyArmoryBureauSuspensionToLocks,
  isArmoryBureauLockKey,
  isArmoryBureauSuspended,
} from "../dist/domain/armory-bureau-suspension.js";

test("병기부는 ARMORY_BUREAU_ENABLED=true 를 명시해야만 운영 상태가 된다", () => {
  assert.equal(isArmoryBureauSuspended({}), true);
  assert.equal(isArmoryBureauSuspended({ ARMORY_BUREAU_ENABLED: "" }), true);
  assert.equal(
    isArmoryBureauSuspended({ ARMORY_BUREAU_ENABLED: "false" }),
    true,
  );
  assert.equal(isArmoryBureauSuspended({ ARMORY_BUREAU_ENABLED: "1" }), true);
  assert.equal(
    isArmoryBureauSuspended({ ARMORY_BUREAU_ENABLED: " TRUE " }),
    false,
  );
});

test("병기부 잠금 키는 병기부 경로와 하위 구역만 가리킨다", () => {
  assert.equal(isArmoryBureauLockKey("/erp/equipment-shop"), true);
  assert.equal(isArmoryBureauLockKey("/erp/equipment-shop/lab"), true);
  assert.equal(isArmoryBureauLockKey("/erp/equipment-shopping"), false);
  assert.equal(isArmoryBureauLockKey("/erp/research"), false);
  assert.equal(isArmoryBureauLockKey("/erp/shop"), false);
});

test("운영 중지 중에는 병기부 잠금만 override 와 무관하게 잠금으로 고정한다", () => {
  const overrides = {
    "/erp/equipment-shop/towaski": false,
    "/erp/research": false,
    "/erp/gallery": true,
  };
  const lockKeys = [
    "/erp/equipment-shop",
    "/erp/equipment-shop/lab",
    "/erp/equipment-shop/towaski",
    "/erp/research",
    "/erp/shop",
  ];

  assert.deepEqual(
    applyArmoryBureauSuspensionToLocks(overrides, lockKeys, true),
    {
      "/erp/equipment-shop/towaski": true,
      "/erp/research": false,
      "/erp/gallery": true,
      "/erp/equipment-shop": true,
      "/erp/equipment-shop/lab": true,
    },
  );
  assert.deepEqual(
    applyArmoryBureauSuspensionToLocks(overrides, lockKeys, false),
    overrides,
  );
});
