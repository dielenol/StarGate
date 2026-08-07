import assert from "node:assert/strict";
import test from "node:test";

import {
  TIA_DIALOGUE_LINES,
  TIA_IDLE_LINES,
  TIA_MOOD_LABELS,
} from "../tia-dialogue.ts";

test("Tia varies user-facing errors without losing operational facts", () => {
  const errors = [
    TIA_DIALOGUE_LINES.reorderError,
    TIA_DIALOGUE_LINES.checkoutError,
    TIA_DIALOGUE_LINES.lotteryEnded,
    TIA_DIALOGUE_LINES.sodaDailyLimit,
    TIA_DIALOGUE_LINES.cartAdjusted,
  ];

  assert.equal(new Set(errors.map((line) => line.split(/[,.…]/)[0])).size, errors.length);
  assert.match(TIA_DIALOGUE_LINES.sodaDailyLimit, /열 개|10/);
  assert.match(TIA_DIALOGUE_LINES.lotteryEnded, /결제는 안 됐|결제되지/);
  assert.match(TIA_DIALOGUE_LINES.cartAdjusted, /살 수 있는 수량|장바구니/);
  assert.match(TIA_DIALOGUE_LINES.reorderRequested, /입고.*알림|알림.*입고/);
});

test("Tia stays a lively shop clerk without inventing sales history", () => {
  const corpus = [
    ...Object.values(TIA_DIALOGUE_LINES),
    ...TIA_IDLE_LINES.map(({ text }) => text),
  ].join(" ");

  assert.match(corpus, /어서 오세요|카운터|봉투|재고|발주/);
  assert.doesNotMatch(corpus, /오늘 유난히 잘 나가|방금 다 나갔/);
  assert.equal(TIA_MOOD_LABELS.purchase, "결제 완료");
});
