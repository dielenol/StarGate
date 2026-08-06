import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../../../", import.meta.url);

test("작전 크레딧 adjust는 요청 ID가 일치하는 멱등 경제 operation으로만 처리한다", async () => {
  const route = await readFile(
    new URL("app/api/vtt/nochichim/operation-credit/route.ts", WEB_ROOT),
    "utf8",
  );

  assert.match(route, /readIdempotencyKey\(request\)/);
  assert.match(route, /!Number\.isSafeInteger\(parsed\)/);
  assert.match(route, /body\.requestId !== requestId/);
  assert.match(route, /domain: "nochichim-operation-credit-adjust"/);
  assert.match(route, /executeEconomicOperationResult\(\{/);
  assert.match(route, /run: async \(mongoSession\)/);
  assert.match(
    route,
    /addCreditPoolBalance\(OPERATION_POOL_ID, delta, \{[\s\S]*session: mongoSession/,
  );
  assert.match(route, /requestId,[\s\S]*delta,/);
  assert.match(route, /replayed: result\.replayed/);
  assert.match(route, /"X-Idempotency-Replayed": "true"/);
  assert.match(route, /INSUFFICIENT_OPERATION_CREDIT/);
});

test("GM set은 사전 조회값으로 delta를 계산하지 않고 absolute atomic set을 사용한다", async () => {
  const route = await readFile(
    new URL("app/api/vtt/nochichim/operation-credit/route.ts", WEB_ROOT),
    "utf8",
  );
  const setBranch = route.slice(
    route.indexOf('if (mode === "set")'),
    route.indexOf("const delta = normalizeCreditDelta"),
  );

  assert.match(setBranch, /setCreditPoolBalance\(OPERATION_POOL_ID, value\)/);
  assert.doesNotMatch(setBranch, /pool\.balance|addCreditPoolBalance/);
});
