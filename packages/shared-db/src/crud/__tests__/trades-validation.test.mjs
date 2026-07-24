import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPlayerTradeOffersCompatible,
  normalizePlayerTradeOffer,
  PlayerTradeError,
} from "../../../dist/index.js";

const empty = { credits: 0, items: [], stocks: [] };

test("거래 제안은 같은 품목과 종목의 중복 행을 거부한다", () => {
  assert.throws(
    () =>
      normalizePlayerTradeOffer({
        credits: 0,
        items: [
          { itemId: "507f1f77bcf86cd799439011", quantity: 1 },
          { itemId: "507f1f77bcf86cd799439011", quantity: 2 },
        ],
        stocks: [],
      }),
    (error) =>
      error instanceof PlayerTradeError && error.code === "DUPLICATE_ASSET",
  );
  assert.throws(
    () =>
      normalizePlayerTradeOffer({
        credits: 0,
        items: [],
        stocks: [
          { ticker: "NOV", shares: 1 },
          { ticker: "nov", shares: 2 },
        ],
      }),
    (error) =>
      error instanceof PlayerTradeError && error.code === "DUPLICATE_ASSET",
  );
});

test("양쪽 제안의 동일 itemId/ticker는 정산 전에 거부한다", () => {
  assert.throws(
    () =>
      assertPlayerTradeOffersCompatible(
        {
          ...empty,
          items: [
            {
              itemId: "507f1f77bcf86cd799439011",
              itemName: "테스트",
              quantity: 1,
            },
          ],
        },
        {
          ...empty,
          items: [
            {
              itemId: "507f1f77bcf86cd799439011",
              itemName: "테스트",
              quantity: 1,
            },
          ],
        },
      ),
    /같은 아이템/,
  );
  assert.throws(
    () =>
      assertPlayerTradeOffersCompatible(
        { ...empty, stocks: [{ ticker: "NOV", shares: 1 }] },
        { ...empty, stocks: [{ ticker: "NOV", shares: 1 }] },
      ),
    /같은 종목/,
  );
});

test("거래 수량과 크레딧의 경계를 검증한다", () => {
  for (const offer of [
    { credits: -1, items: [], stocks: [] },
    {
      credits: 0,
      items: [{ itemId: "not-object-id", quantity: 1 }],
      stocks: [],
    },
    { credits: 0, items: [], stocks: [{ ticker: "NOV", shares: 0 }] },
  ]) {
    assert.throws(() => normalizePlayerTradeOffer(offer), PlayerTradeError);
  }
  assert.deepEqual(
    normalizePlayerTradeOffer({
      credits: 12.34,
      items: [{ itemId: "507f1f77bcf86cd799439011", quantity: 2 }],
      stocks: [{ ticker: "nov", shares: 3 }],
    }),
    {
      credits: 12.34,
      items: [
        {
          itemId: "507f1f77bcf86cd799439011",
          itemName: "",
          quantity: 2,
        },
      ],
      stocks: [{ ticker: "NOV", shares: 3 }],
    },
  );
});
