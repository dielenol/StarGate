import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const snapshots = readFileSync(
  "app/api/vtt/nochichim/_lib/snapshots.ts",
  "utf8",
);

assert.match(
  snapshots,
  /inventory: NochichimInventorySnapshot\[\];[\s\S]*sharedInventory: NochichimInventorySnapshot\[\];/,
  "the VTT snapshot must expose personal and shared inventory separately",
);
assert.match(
  snapshots,
  /category: normalizedInventoryCategory\(item\)/,
  "the VTT inventory must use the same drift-safe category as the ERP",
);
assert.match(
  snapshots,
  /usable,[\s\S]*equippedSlot/,
  "inventory cards must distinguish safe consumable actions from equipped state",
);
assert.match(
  snapshots,
  /inventory: inventoryState\.inventory,[\s\S]*sharedInventory: inventoryState\.sharedInventory/,
  "the character response must include both complete inventory branches",
);
assert.match(
  snapshots,
  /consumables: \[[\s\S]*\.\.\.inventoryState\.sharedConsumables[\s\S]*sharedConsumables: inventoryState\.sharedConsumables/,
  "legacy combined consumables and the explicit shared branch must coexist during rollout",
);

console.log("Nochichim full inventory snapshot contract tests passed");
