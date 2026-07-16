import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canManageCharacterEquipment,
  canViewCharacter,
  canViewPersonalInventory,
  isActiveUserStatus,
} from "../access-policy.ts";
import { safeCallbackUrl } from "../callback-url.ts";

test("active-user guard는 ACTIVE만 허용한다", () => {
  assert.equal(isActiveUserStatus("ACTIVE"), true);
  assert.equal(isActiveUserStatus("INACTIVE"), false);
  assert.equal(isActiveUserStatus("SUSPENDED"), false);
});

test("비공개 캐릭터는 GM에게만 보인다", () => {
  assert.equal(canViewCharacter("GM", { isPublic: false }), true);
  assert.equal(canViewCharacter("V", { isPublic: false }), false);
  assert.equal(canViewCharacter("U", { isPublic: false }), false);
  assert.equal(canViewCharacter("U", { isPublic: true }), true);
  assert.equal(canViewCharacter("U", {}), true);
});

test("개인 인벤토리는 소유자 또는 V+만 볼 수 있다", () => {
  const ownCharacter = { ownerId: "user-a" };
  const otherCharacter = { ownerId: "user-b" };

  assert.equal(canViewPersonalInventory("user-a", "U", ownCharacter), true);
  assert.equal(canViewPersonalInventory("user-a", "U", otherCharacter), false);
  assert.equal(canViewPersonalInventory("user-a", "V", otherCharacter), true);
  assert.equal(canViewPersonalInventory("user-a", "GM", otherCharacter), true);
  assert.equal(
    canViewPersonalInventory("user-a", "V", { ownerId: "user-a", isPublic: false }),
    false,
  );
  assert.equal(
    canViewPersonalInventory("user-a", "GM", { ownerId: "user-b", isPublic: false }),
    true,
  );
});

test("장비 교체는 AGENT 또는 GM 본인 소유 NPC만 허용한다", () => {
  const ownAgent = { ownerId: "user-a", type: "AGENT" };
  const otherAgent = { ownerId: "user-b", type: "AGENT" };
  const ownNpc = { ownerId: "user-a", type: "NPC" };
  const otherNpc = { ownerId: "user-b", type: "NPC" };

  assert.equal(canManageCharacterEquipment("user-a", "U", ownAgent), true);
  assert.equal(canManageCharacterEquipment("user-a", "V", otherAgent), true);
  assert.equal(canManageCharacterEquipment("user-a", "GM", otherAgent), true);
  assert.equal(canManageCharacterEquipment("user-a", "U", ownNpc), false);
  assert.equal(canManageCharacterEquipment("user-a", "V", ownNpc), false);
  assert.equal(canManageCharacterEquipment("user-a", "GM", ownNpc), true);
  assert.equal(canManageCharacterEquipment("user-a", "GM", otherNpc), false);
});

test("장비 교체 mutation은 트랜잭션 안에서 최신 권한을 다시 확인한다", async () => {
  const source = await readFile(
    new URL(
      "../../../app/api/erp/inventory/[characterId]/equipment/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /mongoSession\.withTransaction/);
  assert.match(source, /status: "ACTIVE"/);
  assert.match(
    source,
    /canManageCharacterEquipment\([\s\S]*transactionViewer\.role[\s\S]*transactionCharacter/,
  );
  assert.match(
    source,
    /equipCharacterInventoryItem\([\s\S]*session: mongoSession/,
  );
});

test("callback URL은 /erp pathname과 query만 보존한다", () => {
  assert.equal(safeCallbackUrl("/erp"), "/erp");
  assert.equal(safeCallbackUrl("/erp?tab=security"), "/erp?tab=security");
  assert.equal(
    safeCallbackUrl("/erp/sessions?year=2026&month=7"),
    "/erp/sessions?year=2026&month=7",
  );
  assert.equal(safeCallbackUrl("/erp/account#discord"), "/erp/account");
});

test("callback URL은 외부 및 유사 경로를 /erp로 폴백한다", () => {
  assert.equal(safeCallbackUrl("https://evil.example/erp"), "/erp");
  assert.equal(safeCallbackUrl("//evil.example/erp"), "/erp");
  assert.equal(safeCallbackUrl("/erpish?next=/erp"), "/erp");
  assert.equal(safeCallbackUrl("/public"), "/erp");
  assert.equal(safeCallbackUrl("/erp/\\evil.example"), "/erp");
});
