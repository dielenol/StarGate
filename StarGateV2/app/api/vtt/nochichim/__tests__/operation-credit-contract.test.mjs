import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../../../", import.meta.url);

test("작전 크레딧 변경은 요청 ID가 일치하는 멱등 경제 operation으로만 처리한다", async () => {
  const route = await readFile(
    new URL("app/api/vtt/nochichim/operation-credit/route.ts", WEB_ROOT),
    "utf8",
  );

  assert.match(route, /readIdempotencyKey\(request\)/);
  assert.match(route, /!Number\.isSafeInteger\(value\)/);
  assert.match(route, /body\.requestId !== requestId/);
  assert.match(route, /body\.mode !== "adjust" && body\.mode !== "set"/);
  assert.match(route, /"nochichim-operation-credit-adjust"/);
  assert.match(route, /"nochichim-operation-credit-set"/);
  assert.match(route, /executeEconomicOperationResult<OperationCreditMutationResponse>/);
  assert.match(route, /run: async \(mongoSession\)/);
  assert.match(
    route,
    /addCreditPoolBalance\(OPERATION_POOL_ID, mutationDelta, \{[\s\S]*session: mongoSession/,
  );
  assert.match(route, /requestId,[\s\S]*delta: mutationDelta/);
  assert.match(route, /replayed: result\.replayed/);
  assert.match(route, /"X-Idempotency-Replayed": "true"/);
  assert.match(route, /INSUFFICIENT_OPERATION_CREDIT/);
  assert.match(route, /enqueueWorkflowStatusWebhook/);
  assert.match(route, /workflow: "OPERATION_CREDIT"/);
});

test("absolute set은 단조 증가 revision CAS 없이는 실행되지 않는다", async () => {
  const route = await readFile(
    new URL("app/api/vtt/nochichim/operation-credit/route.ts", WEB_ROOT),
    "utf8",
  );
  assert.match(route, /expectedRevision/);
  assert.match(route, /INVALID_EXPECTED_REVISION/);
  assert.match(route, /setCreditPoolBalance\(OPERATION_POOL_ID, mutationValue, \{/);
  assert.match(route, /expectedRevision: expectedRevision as number/);
  assert.match(route, /CreditPoolVersionConflictError/);
  assert.match(route, /STALE_OPERATION_CREDIT/);
  assert.match(route, /workflowId: requestId/);
});
