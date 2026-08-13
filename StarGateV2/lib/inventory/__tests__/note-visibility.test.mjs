import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  redactInternalInventoryNote,
  visibleInventoryNote,
} from "../note-visibility.ts";

const WEB_ROOT = new URL("../../../", import.meta.url);

test("플레이어에게 공방 요청 추적 메모를 숨긴다", () => {
  assert.equal(
    visibleInventoryNote(
      "공방 강화 완료 · equipment-workshop-request:76055141-2cc3-4717-996f-fa0ec9559fd9",
    ),
    undefined,
  );
  assert.equal(
    visibleInventoryNote(
      "공방 조건부 가결 산출물 · equipment-workshop-request:76055141-2cc3-4717-996f-fa0ec9559fd9",
    ),
    undefined,
  );
});

test("일반 메모와 관리자용 공방 추적 메모는 유지한다", () => {
  const workshopNote =
    "공방 제작 완료 · equipment-workshop-request:76055141-2cc3-4717-996f-fa0ec9559fd9";

  assert.equal(visibleInventoryNote("세션 12 전리품"), "세션 12 전리품");
  assert.equal(visibleInventoryNote(workshopNote, true), workshopNote);
});

test("플레이어 응답에서는 내부 메모 필드만 제거하고 원본은 보존한다", () => {
  const entry = {
    itemId: "item-1",
    note: "공방 강화 완료 · equipment-workshop-request:request-1",
  };

  assert.deepEqual(redactInternalInventoryNote(entry), { itemId: "item-1" });
  assert.deepEqual(redactInternalInventoryNote(entry, true), entry);
  assert.ok("note" in entry);
});

test("인벤토리 UI와 응답은 플레이어 메모를 숨기고 관리자 예외를 유지한다", async () => {
  const [
    client,
    playerPage,
    characterPage,
    personalRoute,
    sharedRoute,
    equipmentRoute,
    adminPage,
  ] =
    await Promise.all([
      readFile(
        new URL(
          "app/(erp)/erp/inventory/[characterId]/InventoryClient.tsx",
          WEB_ROOT,
        ),
        "utf8",
      ),
      readFile(
        new URL("app/(erp)/erp/inventory/[characterId]/page.tsx", WEB_ROOT),
        "utf8",
      ),
      readFile(
        new URL("app/(erp)/erp/characters/[id]/page.tsx", WEB_ROOT),
        "utf8",
      ),
      readFile(
        new URL("app/api/erp/inventory/[characterId]/route.ts", WEB_ROOT),
        "utf8",
      ),
      readFile(
        new URL("app/api/erp/inventory/shared/route.ts", WEB_ROOT),
        "utf8",
      ),
      readFile(
        new URL(
          "app/api/erp/inventory/[characterId]/equipment/route.ts",
          WEB_ROOT,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "app/(erp)/erp/admin/inventory/[characterId]/page.tsx",
          WEB_ROOT,
        ),
        "utf8",
      ),
    ]);

  assert.match(
    client,
    /visibleInventoryNote\(entry\.note, revealInternalNotes\)/,
  );
  assert.match(
    client,
    /matchesQuery\(entry, normalizedQuery, revealInternalNotes\)/,
  );
  assert.match(client, /visibleNote \? \(/);
  assert.match(playerPage, /redactInternalInventoryNote/);
  assert.match(characterPage, /redactInternalInventoryNote/);
  assert.match(personalRoute, /redactInternalInventoryNote/);
  assert.match(sharedRoute, /redactInternalInventoryNote/);
  assert.match(equipmentRoute, /visibleEntries\.find/);
  assert.match(equipmentRoute, /viewerRole = transactionViewer\.role/);
  assert.match(adminPage, /revealInternalNotes/);
});
