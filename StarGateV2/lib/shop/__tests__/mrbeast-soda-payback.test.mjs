import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMrBeastSodaApologyPayback,
  isMrBeastSodaApologyPaybackDateEligible,
  MRBEAST_SODA_APOLOGY_PAYBACK_TICKETS_PER_UNIT,
  MRBEAST_SODA_APOLOGY_PAYBACK_PURCHASE_UNIT,
} from "../mrbeast-soda-payback.ts";

test("누적 미스터비스트 소다 10개마다 사죄 복권 3장을 지급한다", () => {
  assert.equal(MRBEAST_SODA_APOLOGY_PAYBACK_PURCHASE_UNIT, 10);
  assert.equal(MRBEAST_SODA_APOLOGY_PAYBACK_TICKETS_PER_UNIT, 3);
  assert.deepEqual(calculateMrBeastSodaApologyPayback(0), {
    purchasedQuantity: 0,
    rewardQuantity: 0,
  });
  assert.equal(calculateMrBeastSodaApologyPayback(9).rewardQuantity, 0);
  assert.equal(calculateMrBeastSodaApologyPayback(10).rewardQuantity, 3);
  assert.equal(calculateMrBeastSodaApologyPayback(19).rewardQuantity, 3);
  assert.equal(calculateMrBeastSodaApologyPayback(20).rewardQuantity, 6);
  assert.equal(calculateMrBeastSodaApologyPayback(99).rewardQuantity, 27);
});

test("페이백 구매 기간은 KST 2026-07-31부터 2026-08-13까지로 고정한다", () => {
  assert.equal(isMrBeastSodaApologyPaybackDateEligible("2026-07-30"), false);
  assert.equal(isMrBeastSodaApologyPaybackDateEligible("2026-07-31"), true);
  assert.equal(isMrBeastSodaApologyPaybackDateEligible("2026-08-13"), true);
  assert.equal(isMrBeastSodaApologyPaybackDateEligible("2026-08-14"), false);
  assert.equal(isMrBeastSodaApologyPaybackDateEligible("2026-07-32"), false);
  assert.equal(isMrBeastSodaApologyPaybackDateEligible("2026-08-00"), false);
  assert.equal(isMrBeastSodaApologyPaybackDateEligible("invalid"), false);
});

test("구매 수량은 안전한 0 이상 정수만 허용한다", () => {
  for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => calculateMrBeastSodaApologyPayback(value),
      RangeError,
    );
  }
});
