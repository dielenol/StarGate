import assert from "node:assert/strict";
import test from "node:test";

import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
} from "../idempotency.ts";

test("commit 뒤 응답 유실로 같은 payload를 다시 제출하면 operation key를 재사용한다", () => {
  const fingerprint = JSON.stringify(["buy", "NVS", 10]);
  const first = retainIdempotencyOperation(null, "stock-buy", fingerprint);

  // 실패 경로는 clear를 호출하지 않는다.
  const responseLostRetry = retainIdempotencyOperation(
    first,
    "stock-buy",
    fingerprint,
  );

  assert.equal(responseLostRetry.key, first.key);
  assert.equal(responseLostRetry, first);
});

test("payload 변경 또는 성공 완료 뒤에는 새 operation key를 만든다", () => {
  const first = retainIdempotencyOperation(
    null,
    "stock-buy",
    JSON.stringify(["buy", "NVS", 10]),
  );
  const changed = retainIdempotencyOperation(
    first,
    "stock-buy",
    JSON.stringify(["buy", "NVS", 11]),
  );
  assert.notEqual(changed.key, first.key);

  const completed = clearRetainedIdempotencyOperation(first, first.key);
  assert.equal(completed, null);
  const next = retainIdempotencyOperation(
    completed,
    "stock-buy",
    JSON.stringify(["buy", "NVS", 10]),
  );
  assert.notEqual(next.key, first.key);
});

test("늦게 도착한 이전 성공 응답은 더 최신 operation을 지우지 않는다", () => {
  const first = retainIdempotencyOperation(null, "stock-buy", "buy:NVS:10");
  const current = retainIdempotencyOperation(first, "stock-buy", "buy:NVS:11");

  assert.equal(
    clearRetainedIdempotencyOperation(current, first.key),
    current,
  );
});
