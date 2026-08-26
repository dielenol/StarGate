import assert from "node:assert/strict";
import test from "node:test";

import {
  isNovexHallExcludedAccount,
  rankNovexLifetimeReturnCandidates,
} from "../dist/index.js";

function candidate(overrides = {}) {
  return {
    characterId: "character-base",
    codename: "BASE",
    totalRealizedReturn: 100,
    profitEventCount: 1,
    ...overrides,
  };
}

test("NOVEX 제외 계정은 GM 역할 또는 *TEST 아이디로 판별한다", () => {
  assert.equal(
    isNovexHallExcludedAccount({ username: "GAME_MASTER", role: "GM" }),
    true,
  );
  assert.equal(
    isNovexHallExcludedAccount({ username: "atest", role: "A" }),
    true,
  );
  assert.equal(
    isNovexHallExcludedAccount({ username: "PLAYER", role: "U" }),
    false,
  );

});

test("NOVEX 누적 수익 순위는 유효 후보 중 정확히 TOP 3만 공개한다", () => {
  const ranked = rankNovexLifetimeReturnCandidates([
    candidate({ characterId: "three", codename: "CHARLIE", totalRealizedReturn: 30 }),
    candidate({ characterId: "one", codename: "ALPHA", totalRealizedReturn: 50 }),
    candidate({ characterId: "two", codename: "BRAVO", totalRealizedReturn: 40 }),
    candidate({ characterId: "four", codename: "DELTA", totalRealizedReturn: 20 }),
  ]);

  assert.deepEqual(
    ranked.map((item) => [item.rank, item.codename, item.totalRealizedReturn]),
    [
      [1, "ALPHA", 50],
      [2, "BRAVO", 40],
      [3, "CHARLIE", 30],
    ],
  );
});

test("NOVEX 누적 수익 동률은 코드네임과 내부 ID로 결정하고 식별자를 공개하지 않는다", () => {
  const ranked = rankNovexLifetimeReturnCandidates([
    candidate({ characterId: "z", codename: "BRAVO", totalRealizedReturn: 10.005 }),
    candidate({ characterId: "b", codename: "ALPHA", totalRealizedReturn: 10.005 }),
    candidate({ characterId: "a", codename: "ALPHA", totalRealizedReturn: 10.005 }),
    candidate({
      characterId: "invalid",
      codename: "INVALID",
      totalRealizedReturn: Number.NaN,
    }),
    candidate({
      characterId: "no-sales",
      codename: "NO-SALES",
      profitEventCount: 0,
    }),
  ]);

  assert.deepEqual(
    ranked.map((item) => item.codename),
    ["ALPHA", "ALPHA", "BRAVO"],
  );
  assert.equal(ranked[0].totalRealizedReturn, 10.01);
  assert.equal("characterId" in ranked[0], false);
  assert.equal("ownerUsername" in ranked[0], false);
  assert.equal("ownerRole" in ranked[0], false);
});

test("NOVEX 누적 수익은 표시 단위로 반올림한 뒤 동률을 결정한다", () => {
  const ranked = rankNovexLifetimeReturnCandidates([
    candidate({
      characterId: "z",
      codename: "ZULU",
      totalRealizedReturn: 0.1 + 0.2,
    }),
    candidate({ characterId: "a", codename: "ALPHA", totalRealizedReturn: 0.3 }),
  ]);

  assert.deepEqual(
    ranked.map((item) => [item.codename, item.totalRealizedReturn]),
    [
      ["ALPHA", 0.3],
      ["ZULU", 0.3],
    ],
  );
});
