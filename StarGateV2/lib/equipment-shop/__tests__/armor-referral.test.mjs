import assert from "node:assert/strict";
import test from "node:test";

import {
  ARMOR_REFERRAL_DISCOUNT_PERCENT,
  ARMOR_REFERRAL_TTL_MS,
  applyAcheronArmorReferrals,
  issueArmorReferralToken,
  quoteAcheronArmorReferral,
} from "../armor-referral.ts";

const CONTEXT = {
  userId: "user-1",
  characterId: "character-1",
  secret: "test-secret",
  nowMs: 1_000_000,
};

test("signed armor referral grants 10 percent for the same character and item", () => {
  const referral = issueArmorReferralToken({
    ...CONTEXT,
    itemKey: "basic-intermediate-ballistic-vest",
  });
  const quote = quoteAcheronArmorReferral({
    ...CONTEXT,
    itemKey: "basic-intermediate-ballistic-vest",
    listPrice: 220,
    token: referral.token,
  });

  assert.equal(ARMOR_REFERRAL_DISCOUNT_PERCENT, 10);
  assert.equal(quote.price, 198);
  assert.equal(quote.discount?.amount, 22);
  assert.equal(referral.expiresAt, CONTEXT.nowMs + ARMOR_REFERRAL_TTL_MS);
});

test("referral rejects tampering, another character, another item, and expiry", () => {
  const referral = issueArmorReferralToken({
    ...CONTEXT,
    itemKey: "basic-standard-ballistic-vest",
  });
  const quote = (overrides = {}) =>
    quoteAcheronArmorReferral({
      ...CONTEXT,
      itemKey: "basic-standard-ballistic-vest",
      listPrice: 121,
      token: referral.token,
      ...overrides,
    });

  assert.equal(quote().price, 108);
  assert.equal(quote({ characterId: "character-2" }).price, 121);
  assert.equal(quote({ itemKey: "another-armor" }).price, 121);
  assert.equal(
    quote({ token: `${referral.token}tampered` }).price,
    121,
  );
  assert.equal(
    quote({ nowMs: CONTEXT.nowMs + ARMOR_REFERRAL_TTL_MS }).price,
    121,
  );
});

test("catalog discount applies only to Towaski armor mirrored into Acheron", () => {
  const referral = issueArmorReferralToken({
    ...CONTEXT,
    itemKey: "armor-a",
  });
  const base = {
    key: "armor-a",
    name: "방어구 A",
    category: "ARMOR",
    zone: "acheron",
    sourceZone: "towaski",
    price: 100,
    effect: "DEF +1",
    description: "test",
    stock: null,
    available: true,
  };
  const items = applyAcheronArmorReferrals(
    [
      base,
      { ...base, key: "native", sourceZone: "acheron" },
      { ...base, key: "towaski", zone: "towaski" },
    ],
    { ...CONTEXT, token: referral.token },
  );

  assert.equal(items[0].price, 90);
  assert.equal(items[1].price, 100);
  assert.equal(items[2].price, 100);
});
