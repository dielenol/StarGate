import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("session credit rewards consume equipment research credit bonuses", () => {
  const route = readFileSync(
    new URL(
      "../../../app/api/erp/admin/credits/sessions/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(route, /getEquipmentResearchCapabilities/);
  assert.match(route, /quoteEquipmentResearchCreditBonus/);
  assert.match(route, /researchBonusAmount/);
});

test("public player equipment comes from character inventory", () => {
  const page = readFileSync(
    new URL(
      "../../../app/(public)/world/player/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const route = readFileSync(
    new URL(
      "../../../app/api/public/world/player/[id]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(page, /listCharacterInventoryEntries/);
  assert.match(route, /listCharacterInventoryEntries/);
  assert.match(route, /toPublicAgentDetail\(character, inventory\.entries\)/);
});

test("master item creation invalidates equipment shop catalog queries", () => {
  const mutation = readFileSync(
    new URL(
      "../../../hooks/mutations/useInventoryMutation.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(mutation, /equipmentShopKeys\.catalog/);
});
