import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const snapshots = readFileSync(
  "app/api/vtt/nochichim/_lib/snapshots.ts",
  "utf8",
);
const route = readFileSync(
  "app/api/vtt/nochichim/characters/[id]/consume/route.ts",
  "utf8",
);

assert.match(
  snapshots,
  /NOCHICHIM_SHARED_CONSUMABLE_PREFIX = "shared:"/,
  "shared consumables need an explicit VTT item-id namespace",
);
assert.match(
  snapshots,
  /toNochichimInventorySnapshot\(entry, item, "PERSONAL"\)/,
  "personal consumables need an explicit inventory scope",
);
assert.match(
  snapshots,
  /toNochichimInventorySnapshot\(entry, item, "SHARED"\)/,
  "shared consumables need an explicit inventory scope",
);
assert.match(
  snapshots,
  /item\.slug === WHITE_ROSE_ASSISTANT_CALL_SLUG/,
  "only the sourced White Rose call ticket may enter this shared VTT path",
);
assert.match(
  snapshots,
  /scope: "GLOBAL"[\s\S]*quantity: \{ \$gte: input\.quantity \}/,
  "shared consumption must use an atomic sufficient-quantity predicate",
);
assert.match(
  snapshots,
  /findOneAndUpdate\([\s\S]*session: options\.session/,
  "shared decrement must participate in the economic operation transaction",
);
assert.match(
  snapshots,
  /deleteOne\([\s\S]*quantity: 0[\s\S]*session: options\.session/,
  "zero-quantity cleanup must use the same transaction",
);

assert.match(
  route,
  /requestId is required for shared consumables/,
  "shared VTT consumption must require an idempotency request id",
);
assert.match(
  route,
  /executeEconomicOperationResult/,
  "shared VTT consumption must use the economic operation runner",
);
assert.match(
  route,
  /domain: "shared-inventory-consume-vtt"/,
  "shared VTT consumption needs a dedicated idempotency domain",
);
assert.match(
  route,
  /quantity !== 1/,
  "the one-use call ticket must consume exactly one unit",
);
assert.match(
  route,
  /loadCharacterConsumables\(characterId\)/,
  "success, conflict, and replay responses must refresh the visible consumables",
);
assert.match(
  route,
  /inventory refresh failed[\s\S]*retryable: true[\s\S]*status: 503/,
  "post-commit snapshot failures must stay retryable instead of being misclassified as not-found",
);
assert.match(
  route,
  /"Shared consumable not found"[\s\S]*\? 404[\s\S]*: 500/,
  "only expected lookup failures may use 404; internal failures must remain retryable",
);

console.log("shared Nochichim consumable contract tests passed");
