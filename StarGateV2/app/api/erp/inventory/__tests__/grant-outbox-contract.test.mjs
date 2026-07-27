import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PERSONAL_ROUTE = new URL("../[characterId]/route.ts", import.meta.url);
const SHARED_ROUTE = new URL("../shared/route.ts", import.meta.url);
const MUTATION_HOOK = new URL(
  "../../../../../hooks/mutations/useInventoryMutation.ts",
  import.meta.url,
);

test("캐릭터 지급은 안정 멱등 키로 inventory와 감사 outbox를 함께 커밋한다", async () => {
  const source = await readFile(PERSONAL_ROUTE, "utf8");
  const postIndex = source.indexOf("export async function POST(");
  const keyIndex = source.indexOf("readIdempotencyKey(request)", postIndex);
  const lockIndex = source.indexOf(
    "prepareCharacterInventoryItemLocks(characterId, [itemId])",
    keyIndex,
  );
  const operationIndex = source.indexOf(
    "executeEconomicOperationResult<GrantInventoryOperationBody>",
    lockIndex,
  );
  const mutationIndex = source.indexOf("await addToInventory(", operationIndex);
  const mutationSessionIndex = source.indexOf(
    "{ session: dbSession }",
    mutationIndex,
  );
  const outboxIndex = source.indexOf(
    "await enqueueGmAdminAudit(",
    mutationSessionIndex,
  );
  const outboxSessionIndex = source.indexOf(
    "session: dbSession",
    outboxIndex,
  );
  const completionIndex = source.indexOf(
    "return { status: 201, body: { entry } }",
    outboxSessionIndex,
  );
  const replayIndex = source.indexOf("if (operation.replayed)", completionIndex);

  assert.ok(keyIndex > postIndex, "POST Idempotency-Key 검증 누락");
  assert.ok(lockIndex > keyIndex, "transaction 전 inventory lock 준비 누락");
  assert.ok(operationIndex > lockIndex, "경제 operation claim 누락");
  assert.ok(mutationSessionIndex > mutationIndex, "inventory session 누락");
  assert.ok(outboxIndex > mutationSessionIndex, "감사 outbox enqueue 누락");
  assert.ok(outboxSessionIndex > outboxIndex, "outbox session 누락");
  assert.ok(completionIndex > outboxSessionIndex, "outbox 전 operation 완료 금지");
  assert.ok(replayIndex > completionIndex, "replay outbox 복구 분기 누락");
  assert.match(source.slice(replayIndex), /dedupeKey: auditDedupeKey/);
});

test("공용 지급도 같은 transaction과 replay 복구 계약을 사용한다", async () => {
  const source = await readFile(SHARED_ROUTE, "utf8");
  const keyIndex = source.indexOf("readIdempotencyKey(request)");
  const operationIndex = source.indexOf(
    "executeEconomicOperationResult<GrantSharedInventoryOperationBody>",
    keyIndex,
  );
  const mutationIndex = source.indexOf(
    "await addToSharedInventory(",
    operationIndex,
  );
  const mutationSessionIndex = source.indexOf(
    "{ session: dbSession }",
    mutationIndex,
  );
  const outboxIndex = source.indexOf(
    "await enqueueGmAdminAudit(",
    mutationSessionIndex,
  );
  const replayIndex = source.indexOf("if (operation.replayed)", outboxIndex);

  assert.ok(keyIndex > -1, "공용 지급 Idempotency-Key 검증 누락");
  assert.ok(operationIndex > keyIndex, "공용 지급 operation claim 누락");
  assert.ok(mutationSessionIndex > mutationIndex, "공용 inventory session 누락");
  assert.ok(outboxIndex > mutationSessionIndex, "공용 감사 outbox 누락");
  assert.ok(replayIndex > outboxIndex, "공용 replay outbox 복구 누락");
  assert.match(source, /Number\.isSafeInteger\(body\.quantity\)/);
  assert.match(source, /body\.quantity > MAX_GRANT_QUANTITY/);
});

test("지급 mutation hook은 재시도 동안 안정된 Idempotency-Key를 전송한다", async () => {
  const source = await readFile(MUTATION_HOOK, "utf8");
  const personalIndex = source.indexOf("export function useGrantInventory()");
  const sharedIndex = source.indexOf(
    "export function useGrantSharedInventory()",
  );

  assert.match(
    source.slice(personalIndex, sharedIndex),
    /"Idempotency-Key":[\s\S]*createIdempotencyKey\([\s\S]*"inventory-grant",[\s\S]*input/,
  );
  assert.match(
    source.slice(sharedIndex),
    /"Idempotency-Key":[\s\S]*createIdempotencyKey\([\s\S]*"shared-inventory-grant",[\s\S]*data/,
  );
});
