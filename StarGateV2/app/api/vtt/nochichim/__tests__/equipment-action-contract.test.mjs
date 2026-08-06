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
    /prepareCharacterInventoryConsumption\([\s\S]*executeEconomicOperationResult/,
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
