import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveConsumableOutcomes,
  resolveMrBeastSodaConsumptionOutcomes,
} from "../mrbeast-soda-consumption.ts";

const WEB_ROOT = new URL("../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("소다는 각 단위를 독립 판정하고 0.2 경계를 정상으로 분류한다", () => {
  const rolls = [0, 0.199999, 0.2, 0.999999];
  let cursor = 0;
  const outcomes = resolveMrBeastSodaConsumptionOutcomes(
    rolls.length,
    () => rolls[cursor++],
  );

  assert.deepEqual(outcomes, [
    { unit: 1, code: "DEFECTIVE", hpRecovery: 1, sanRecovery: 1 },
    { unit: 2, code: "DEFECTIVE", hpRecovery: 1, sanRecovery: 1 },
    { unit: 3, code: "NORMAL", hpRecovery: 10, sanRecovery: 10 },
    { unit: 4, code: "NORMAL", hpRecovery: 10, sanRecovery: 10 },
  ]);
  assert.equal(cursor, rolls.length);
});

test("다른 소모품은 RNG를 호출하지 않고 outcome을 만들지 않는다", () => {
  let calls = 0;
  const outcomes = resolveConsumableOutcomes("another-consumable", 3, () => {
    calls += 1;
    return 0;
  });

  assert.deepEqual(outcomes, []);
  assert.equal(calls, 0);
});

test("소다 판정은 양의 안전 정수 수량만 허용한다", () => {
  assert.throws(
    () => resolveMrBeastSodaConsumptionOutcomes(0),
    /positive safe integer/,
  );
  assert.throws(
    () => resolveMrBeastSodaConsumptionOutcomes(1.5),
    /positive safe integer/,
  );
});

test("ERP 소비는 멱등 transaction에 차감과 outcome을 함께 저장한다", async () => {
  const [route, hook] = await Promise.all([
    readWeb("app/api/erp/shop/consume/route.ts"),
    readWeb("hooks/mutations/useShopMutation.ts"),
  ]);

  assert.match(route, /executeEconomicOperationResult<ConsumeOperationBody>/);
  assert.match(route, /prepareCharacterInventoryItemLocks\(characterId, \[itemId\]\)/);
  assert.match(route, /domain: "shop-consume-personal"/);
  assert.match(
    route,
    /run: async \(dbSession\) => \{[\s\S]*charactersCol\(\)[\s\S]*usersCol\(\)[\s\S]*status: "ACTIVE"[\s\S]*type: "AGENT"[\s\S]*tier: "MAIN"/,
  );
  assert.match(route, /activeUser\?\.role === "GM"[\s\S]*type: "NPC"/);
  assert.match(
    route,
    /String\(currentMain\._id\) !== characterId[\s\S]*removeFromInventory/,
  );
  assert.match(
    route,
    /masterItemsCol\(\)[\s\S]*category: "CONSUMABLE"[\s\S]*session: dbSession[\s\S]*removeFromInventory\([\s\S]*\{ session: dbSession \}[\s\S]*resolveConsumableOutcomes\([\s\S]*committedItem\.slug/,
  );
  assert.match(route, /userId: operation\.body\.committedOwnerId/);
  assert.doesNotMatch(route, /userId: mainChar\.ownerId/);
  assert.match(route, /operation\.body\.remaining[\s\S]*!operation\.replayed/);
  assert.match(route, /failed to notify committed consumption/);
  assert.match(route, /"X-Idempotency-Replayed": "true"/);

  assert.match(hook, /createIdempotencyKey\("shop-consume", input\)/);
  assert.match(hook, /"Idempotency-Key": requestId/);
  assert.match(hook, /JSON\.stringify\(\{ \.\.\.input, requestId \}\)/);
  assert.match(hook, /retry: \(failureCount, error\)/);
  assert.match(hook, /invalidateQueries\(\{ queryKey: shopKeys\.inventory \}\)/);
  assert.match(hook, /invalidateQueries\(\{ queryKey: inventoryKeys\.all \}\)/);
  assert.match(
    hook,
    /invalidateQueries\(\{ queryKey: notificationKeys\.all \}\)/,
  );
});

test("Nochichim 개인 소비도 같은 멱등 경계와 commit 후 snapshot을 사용한다", async () => {
  const [route, snapshots] = await Promise.all([
    readWeb("app/api/vtt/nochichim/characters/[id]/consume/route.ts"),
    readWeb("app/api/vtt/nochichim/_lib/snapshots.ts"),
  ]);

  assert.match(route, /domain: "personal-inventory-consume-vtt"/);
  assert.match(route, /Idempotency-Key/);
  assert.match(
    route,
    /prepareCharacterInventoryConsumption\([\s\S]*executeEconomicOperationResult<[\s\S]*run: async \(dbSession\)[\s\S]*consumeCharacterConsumable\([\s\S]*dbSession/,
  );
  const operationIndex = route.indexOf(
    "executeEconomicOperationResult<",
    route.indexOf("const characterId = decodeURIComponent(id)"),
  );
  const refreshIndex = route.indexOf(
    "loadCharacterConsumables(characterId)",
    operationIndex,
  );
  assert.ok(operationIndex >= 0 && refreshIndex > operationIndex);
  assert.match(
    route,
    /operation\.body\.ok[\s\S]*operation\.body\.committedOwnerId[\s\S]*!operation\.replayed/,
  );
  assert.match(route, /delete responseBody\.committedOwnerId/);
  assert.match(route, /Personal consumable operation committed/);

  assert.match(
    snapshots,
    /removeFromInventory\([\s\S]*\{ session: input\.dbSession \}/,
  );
  assert.match(
    snapshots,
    /consumeSharedNochichimConsumable[\s\S]*findTransactionalAgentCharacterByKey\([\s\S]*options\.session[\s\S]*sharedInventoryCol/,
  );
  assert.match(
    snapshots,
    /consumeCharacterConsumable[\s\S]*findTransactionalAgentCharacterByKey\([\s\S]*input\.dbSession[\s\S]*removeFromInventory/,
  );
  assert.match(
    snapshots,
    /committedOwnerId: character\.ownerId[\s\S]*committedItemName: item\.name/,
  );
  const notifyStart = snapshots.indexOf(
    "export async function notifyCharacterConsumableUsed",
  );
  const consumeStart = snapshots.indexOf(
    "export async function consumeCharacterConsumable",
  );
  assert.doesNotMatch(
    snapshots.slice(notifyStart, consumeStart),
    /findAgentCharacterByKey|loadMasterItemMap/,
  );
  assert.doesNotMatch(
    snapshots.slice(snapshots.indexOf("consumeCharacterConsumable")),
    /consumables: await loadCharacterConsumables/,
  );
});
