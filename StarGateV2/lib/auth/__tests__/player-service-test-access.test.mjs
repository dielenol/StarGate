import assert from "node:assert/strict";
import test from "node:test";

import {
  hasPlayerServiceTestAccess,
  hasPlayerServiceTestPathAccess,
  isPlayerServiceTestPath,
  resolvePlayerServiceAvailability,
} from "../player-service-test-access.ts";

test("J 등급의 정확한 JTEST 계정만 플레이어 서비스 테스트 접근을 갖는다", () => {
  assert.equal(
    hasPlayerServiceTestAccess({ username: "JTEST", role: "J" }),
    true,
  );

  assert.equal(
    hasPlayerServiceTestAccess({ username: "jtest", role: "J" }),
    false,
  );
  assert.equal(
    hasPlayerServiceTestAccess({ username: "JTEST", role: "GM" }),
    false,
  );
  assert.equal(hasPlayerServiceTestAccess({ username: "JTEST" }), false);
  assert.equal(
    hasPlayerServiceTestAccess({ username: "ATEST", role: "J" }),
    false,
  );
  assert.equal(hasPlayerServiceTestAccess(null), false);
});

test("페이지 잠금 우회는 편의점·주식·병기부 서비스 경로로 한정한다", () => {
  assert.equal(isPlayerServiceTestPath("/erp/shop"), true);
  assert.equal(isPlayerServiceTestPath("/erp/stock"), true);
  assert.equal(isPlayerServiceTestPath("/erp/stock/portfolio"), true);
  assert.equal(isPlayerServiceTestPath("/erp/stock/NOV"), true);
  assert.equal(isPlayerServiceTestPath("/erp/equipment-shop/towaski"), true);
  assert.equal(isPlayerServiceTestPath("/erp/equipment-shop/acheron"), true);
  assert.equal(isPlayerServiceTestPath("/erp/equipment-shop/strategic"), true);
  assert.equal(isPlayerServiceTestPath("/erp/equipment-shop/custom"), true);
  assert.equal(isPlayerServiceTestPath("/erp/equipment-shop/simulator"), true);

  assert.equal(isPlayerServiceTestPath("/erp/equipment-shop"), false);
  assert.equal(isPlayerServiceTestPath("/erp/equipment-shop/lab"), false);
  assert.equal(isPlayerServiceTestPath("/erp/factions/novus"), false);
  assert.equal(isPlayerServiceTestPath("/erp/missions"), false);
  assert.equal(isPlayerServiceTestPath("/erp/gallery"), false);
  assert.equal(isPlayerServiceTestPath("/erp/admin"), false);
  assert.equal(
    hasPlayerServiceTestPathAccess(
      { username: "JTEST", role: "J" },
      "/erp/missions",
    ),
    false,
  );
});

test("JTEST는 운영상 닫힌 플레이어 서비스도 사용할 수 있다", () => {
  assert.equal(
    resolvePlayerServiceAvailability(false, {
      username: "JTEST",
      role: "J",
    }),
    true,
  );
  assert.equal(
    resolvePlayerServiceAvailability(false, {
      username: "PLAYER",
      role: "J",
    }),
    false,
  );
  assert.equal(
    resolvePlayerServiceAvailability(true, {
      username: "PLAYER",
      role: "J",
    }),
    true,
  );
});
