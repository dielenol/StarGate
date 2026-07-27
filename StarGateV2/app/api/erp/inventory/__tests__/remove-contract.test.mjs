import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE = new URL("../[characterId]/route.ts", import.meta.url);
const MUTATION_HOOK = new URL(
  "../../../../../hooks/mutations/useInventoryMutation.ts",
  import.meta.url,
);
const ADMIN_PAGE = new URL(
  "../../../../(erp)/erp/admin/inventory/[characterId]/page.tsx",
  import.meta.url,
);
const PERSONAL_PAGE = new URL(
  "../../../../(erp)/erp/inventory/[characterId]/page.tsx",
  import.meta.url,
);
const INVENTORY_CLIENT = new URL(
  "../../../../(erp)/erp/inventory/[characterId]/InventoryClient.tsx",
  import.meta.url,
);

test("관리자 인벤토리 제거는 GM 권한과 공개 범위·입력 검증 뒤 원자 차감을 수행한다", async () => {
  const source = await readFile(ROUTE, "utf8");
  const deleteIndex = source.indexOf("export async function DELETE(");
  const roleIndex = source.indexOf(
    'requireRole(session.user.role, "GM")',
    deleteIndex,
  );
  const idempotencyIndex = source.indexOf(
    "readIdempotencyKey(request)",
    roleIndex,
  );
  const characterValidationIndex = source.indexOf(
    "isValidObjectId(characterId)",
    idempotencyIndex,
  );
  const accessPolicyIndex = source.indexOf(
    "canViewPersonalInventory(",
    characterValidationIndex,
  );
  const itemValidationIndex = source.indexOf(
    "isValidObjectId(body.itemId.trim())",
    accessPolicyIndex,
  );
  const quantityValidationIndex = source.indexOf(
    "Number.isSafeInteger(body.quantity)",
    deleteIndex,
  );
  const lockIndex = source.indexOf(
    "prepareCharacterInventoryItemLocks(characterId, [itemId])",
    quantityValidationIndex,
  );
  const operationIndex = source.indexOf(
    "executeEconomicOperationResult<RemoveInventoryOperationBody>",
    lockIndex,
  );
  const runIndex = source.indexOf("run: async (dbSession)", operationIndex);
  const targetLookupIndex = source.indexOf(
    "listCharacterInventoryEntries(characterId)",
    runIndex,
  );
  const mutationIndex = source.indexOf("removeFromInventory(", deleteIndex);
  const sessionIndex = source.indexOf("{ session: dbSession }", mutationIndex);

  assert.notEqual(deleteIndex, -1, "DELETE handler 누락");
  assert.ok(roleIndex > deleteIndex, "GM RBAC 검증 누락");
  assert.ok(idempotencyIndex > roleIndex, "멱등 키 검증 누락");
  assert.ok(
    characterValidationIndex > idempotencyIndex,
    "characterId 검증 순서 오류",
  );
  assert.ok(
    accessPolicyIndex > characterValidationIndex,
    "캐릭터 공개 범위 검증 누락",
  );
  assert.ok(
    itemValidationIndex > accessPolicyIndex,
    "itemId 검증 순서 오류",
  );
  assert.ok(
    quantityValidationIndex > itemValidationIndex,
    "quantity 검증 순서 오류",
  );
  assert.ok(
    lockIndex > quantityValidationIndex,
    "검증 전 inventory lock 준비 금지",
  );
  assert.ok(operationIndex > lockIndex, "멱등 operation ledger 누락");
  assert.ok(runIndex > operationIndex, "transaction callback 누락");
  assert.ok(
    targetLookupIndex > runIndex,
    "mutable target precondition은 replay 전 검사하면 안 됨",
  );
  assert.ok(mutationIndex > targetLookupIndex, "transaction 밖 inventory 차감 금지");
  assert.ok(sessionIndex > mutationIndex, "차감에 transaction session 누락");
  assert.match(source, /code: "INVENTORY_REMOVE_CONFLICT"/);
});

test("제거 성공과 감사 outbox를 함께 커밋하고 replay에서는 outbox만 복구한다", async () => {
  const source = await readFile(ROUTE, "utf8");
  const deleteIndex = source.indexOf("export async function DELETE(");
  const mutationIndex = source.indexOf("removeFromInventory(", deleteIndex);
  const conflictIndex = source.indexOf("if (!ok)", mutationIndex);
  const auditIndex = source.indexOf("await enqueueGmAdminAudit(", conflictIndex);
  const auditSessionIndex = source.indexOf("session: dbSession", auditIndex);
  const successBodyIndex = source.indexOf("body: { remaining", auditIndex);
  const replayGuardIndex = source.indexOf(
    "if (operation.replayed)",
    successBodyIndex,
  );
  const repairIndex = source.indexOf("await enqueueGmAdminAudit(", replayGuardIndex);
  const notificationGuardIndex = source.indexOf(
    "if (!operation.replayed)",
    repairIndex,
  );
  const notificationIndex = source.indexOf(
    "await notifyUser({",
    notificationGuardIndex,
  );

  assert.ok(conflictIndex > mutationIndex, "차감 실패 분기 누락");
  assert.ok(auditIndex > conflictIndex, "성공 mutation 뒤 감사 outbox 누락");
  assert.ok(auditSessionIndex > auditIndex, "감사 outbox transaction session 누락");
  assert.ok(successBodyIndex > auditSessionIndex, "outbox 전 operation 완료 금지");
  assert.ok(replayGuardIndex > successBodyIndex, "replay 복구 분기 누락");
  assert.ok(repairIndex > replayGuardIndex, "replay outbox 복구 누락");
  assert.ok(
    notificationGuardIndex > repairIndex,
    "사용자 알림은 최초 처리에만 생성해야 함",
  );
  assert.ok(
    notificationIndex > notificationGuardIndex,
    "성공 확인 전 사용자 알림 생성 금지",
  );
  assert.match(source.slice(deleteIndex), /action: "캐릭터 아이템 제거"/);
  assert.match(source.slice(notificationIndex), /title: "아이템이 제거되었습니다"/);
});

test("제거 mutation은 DELETE 후 인벤토리와 알림 캐시를 무효화한다", async () => {
  const source = await readFile(MUTATION_HOOK, "utf8");
  const hookIndex = source.indexOf("export function useRemoveInventory(");
  const deleteIndex = source.indexOf('method: "DELETE"', hookIndex);
  const idempotencyIndex = source.indexOf('"Idempotency-Key"', deleteIndex);
  const keyFactoryIndex = source.indexOf(
    'createIdempotencyKey(\n            "inventory-remove"',
    idempotencyIndex,
  );
  const inventoryIndex = source.indexOf("inventoryKeys.all", deleteIndex);
  const notificationIndex = source.indexOf("notificationKeys.all", deleteIndex);

  assert.notEqual(hookIndex, -1, "제거 mutation hook 누락");
  assert.ok(deleteIndex > hookIndex, "DELETE 요청 누락");
  assert.ok(idempotencyIndex > deleteIndex, "Idempotency-Key 헤더 누락");
  assert.ok(keyFactoryIndex > idempotencyIndex, "재시도 안정 멱등 키 생성 누락");
  assert.ok(inventoryIndex > deleteIndex, "인벤토리 캐시 무효화 누락");
  assert.ok(notificationIndex > inventoryIndex, "알림 캐시 무효화 누락");
});

test("제거 UI는 관리자 화면에만 노출하고 previewImage를 카드에 연결한다", async () => {
  const [adminPage, personalPage, inventoryClient] = await Promise.all([
    readFile(ADMIN_PAGE, "utf8"),
    readFile(PERSONAL_PAGE, "utf8"),
    readFile(INVENTORY_CLIENT, "utf8"),
  ]);

  assert.match(adminPage, /canRemove=\{role === "GM"\}/);
  assert.doesNotMatch(personalPage, /<InventoryClient[\s\S]*?canRemove/);
  assert.match(inventoryClient, /previewImage=\{entry\.previewImage\}/);
  assert.match(inventoryClient, /getConsumableItemImageSrc\(slug\)/);
  assert.match(inventoryClient, /previewImageSrc\?\.startsWith\("\/assets\/"\)/);
  assert.match(inventoryClient, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(inventoryClient, /key=\{`\$\{entry\.itemId\}:/);
  assert.match(personalPage, /previewImage: item\.previewImage/);
});

test("마스터가 유실된 보유 행도 저장된 이름으로 제거할 수 있다", async () => {
  const source = await readFile(ROUTE, "utf8");
  const deleteIndex = source.indexOf("export async function DELETE(");
  const deleteSource = source.slice(deleteIndex);

  assert.doesNotMatch(deleteSource, /findMasterItemById\(/);
  assert.match(deleteSource, /itemName: targetEntry\.itemName/);
  assert.match(deleteSource, /보유 중인 아이템을 찾을 수 없습니다/);
});
