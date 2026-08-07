import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("구조화 장비 snapshot은 서버가 확정한 ID·분류·슬롯·액션만 전달한다", async () => {
  const snapshots = await readWeb("app/api/vtt/nochichim/_lib/snapshots.ts");

  assert.match(snapshots, /interface NochichimEquipmentSnapshot/);
  assert.match(snapshots, /category: "WEAPON" \| "ARMOR"/);
  assert.match(snapshots, /equippedSlot: "WEAPON" \| "ARMOR"/);
  assert.match(snapshots, /inventoryEntryId: objectIdString\(entry\._id\)/);
  assert.match(snapshots, /item\.equipmentActions \?\?/);
  assert.match(snapshots, /entry\.equipmentCharges\?\.\[action\.code\]/);
  assert.match(snapshots, /entry\.equipmentAmmo/);
  assert.match(snapshots, /item\.combatProfile/);
  assert.match(snapshots, /action\.rangeMinCells/);
  assert.match(snapshots, /action\.rangeMaxCells/);
  const equipmentMapper = snapshots.slice(
    snapshots.indexOf("function toNochichimEquipmentActions"),
    snapshots.indexOf("export async function loadCharacterEquippedState"),
  );
  assert.doesNotMatch(
    equipmentMapper,
    /includes\(|match\(|test\(/,
    "장비 명칭이나 설명 문자열에서 구조화 규칙을 추정하면 안 된다",
  );
});

test("충전형 U 액션은 충전·일반 탄약을 같은 멱등 transaction에서 차감하고 최신 상태를 반환한다", async () => {
  const [route, snapshots, inventory, transactionalCharacter] = await Promise.all([
    readWeb(
      "app/api/vtt/nochichim/characters/[id]/equipment-action/route.ts",
    ),
    readWeb("app/api/vtt/nochichim/_lib/snapshots.ts"),
    readFile(
      new URL(
        "../../../../../../packages/shared-db/src/crud/inventory.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readWeb("app/api/vtt/nochichim/_lib/transactional-character.ts"),
  ]);

  assert.match(route, /Idempotency-Key/);
  assert.match(route, /headerRequestId !== bodyRequestId/);
  assert.match(route, /domain: "equipment-action-consume-vtt"/);
  assert.match(
    route,
    /prepareCharacterEquipmentActionConsumption\([\s\S]*executeEconomicOperationResult/,
  );
  assert.match(route, /executeEconomicOperationResult/);
  assert.match(route, /run: async \(dbSession\)/);
  assert.match(route, /consumeCharacterEquipmentAction\(\{[\s\S]*dbSession/);
  assert.match(route, /"X-Idempotency-Replayed": "true"/);
  assert.match(
    route,
    /executeEconomicOperationResult[\s\S]*loadCharacterEquippedState\(characterId\)/,
  );
  assert.match(route, /EQUIPMENT_STATE_REFRESH_FAILED/);
  assert.match(route, /EQUIPMENT_UNAVAILABLE/);

  assert.match(snapshots, /action\.kind \?\? "CHARGED"/);
  assert.match(snapshots, /Equipment stance action is local-only/);
  assert.match(
    snapshots,
    /consumeEquippedEquipmentCharge\([\s\S]*session: input\.dbSession[\s\S]*actionCode: action\.code[\s\S]*ammunitionCost: action\.consumesRegularAmmo \?\? 0/,
  );
  assert.match(
    snapshots,
    /findTransactionalAgentCharacterByKey\([\s\S]*input\.dbSession[\s\S]*consumeEquippedEquipmentCharge/,
  );
  assert.match(transactionalCharacter, /type: "AGENT"/);
  assert.match(transactionalCharacter, /findOne\(filter, \{ session \}\)/);

  assert.match(inventory, /const chargePath = options\.actionCode/);
  assert.match(inventory, /equipmentCharges\.\$\{options\.actionCode\}/);
  assert.match(inventory, /\[currentPath\]: \{ \$gte: chargeCost \}/);
  assert.match(inventory, /\[maximumPath\]: expectedMaximum/);
  assert.match(
    inventory,
    /"equipmentAmmo\.current": \{ \$gte: ammunitionCost \}/,
  );
  assert.match(
    inventory,
    /"equipmentAmmo\.current": -ammunitionCost/,
  );
  assert.match(inventory, /findOneAndUpdate\([\s\S]*session: options\.session/);
  assert.match(
    snapshots,
    /prepareCharacterInventoryItemLocks\(characterId, \[input\.itemId\]\)/,
  );
});

test("피안의 보루 W1·CENSOR-3 U2는 탄창과 실물 소모품을 각각 원자 처리한다", async () => {
  const [route, consumeRoute, snapshots, inventory] = await Promise.all([
    readWeb(
      "app/api/vtt/nochichim/characters/[id]/equipment-action/route.ts",
    ),
    readWeb("app/api/vtt/nochichim/characters/[id]/consume/route.ts"),
    readWeb("app/api/vtt/nochichim/_lib/snapshots.ts"),
    readFile(
      new URL(
        "../../../../../../packages/shared-db/src/crud/inventory.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(route, /\/\^\(\?:U\|W\)\[1-9\]\[0-9\]\?\$\//);
  assert.match(route, /prepareCharacterEquipmentActionConsumption/);
  assert.match(route, /requestId,[\s\S]*dbSession/);
  assert.doesNotMatch(route, /APPROVAL_UNAVAILABLE/);
  assert.match(route, /CONSUMABLE_UNAVAILABLE/);

  assert.match(snapshots, /code: "W1"/);
  assert.match(snapshots, /kind: "WEAPON"/);
  assert.match(snapshots, /item\.combatProfile\?\.weaponAttack/);
  assert.match(snapshots, /consumeEquippedEquipmentAmmo/);
  assert.match(snapshots, /action\.consumableCost/);
  assert.match(snapshots, /character\.codename !== "네베드"/);
  assert.match(snapshots, /item\.slug !== PIAN_BULWARK_WEAPON_SLUG/);
  assert.doesNotMatch(snapshots, /claimApprovedCensorUseVote/);
  assert.match(snapshots, /removeFromInventory\([\s\S]*input\.dbSession/);
  assert.match(
    snapshots,
    /lockItemIds\.push\(equipmentSlotLockId\("WEAPON"\)\)/,
  );
  assert.match(
    snapshots,
    /lockCharacterInventoryItems\([\s\S]*equipmentSlotLockId\("WEAPON"\)[\s\S]*input\.dbSession[\s\S]*const equippedEntry/,
  );
  assert.match(snapshots, /item\.slug === CENSOR_3_CONSUMABLE_SLUG/);
  assert.match(snapshots, /throw new Error\("Consumable requires equipment action"\)/);
  assert.match(consumeRoute, /EQUIPMENT_ACTION_REQUIRED/);

  assert.doesNotMatch(snapshots, /approvalVoteId|approvalRequestRef/);

  assert.match(inventory, /export async function consumeEquippedEquipmentAmmo/);
  assert.match(inventory, /export function equipmentSlotLockId/);
  assert.match(inventory, /"equipmentAmmo\.maximum": expectedMaximum/);
  assert.match(inventory, /equippedSlot: "WEAPON"/);
  assert.match(inventory, /"equipmentAmmo\.current": -ammunitionCost/);
});
