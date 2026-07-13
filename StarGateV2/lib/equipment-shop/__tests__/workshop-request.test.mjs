import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canTransitionEquipmentWorkshopRequestStatus,
  getEquipmentWorkshopComputedStatus,
  getEquipmentWorkshopRequestLabel,
  isSameEquipmentWorkshopRequestPayload,
  parseEquipmentWorkshopQuote,
  parseEquipmentWorkshopRequest,
  requiresEquipmentWorkshopOperatorNote,
  resolveEquipmentWorkshopSpecialist,
  WORKSHOP_REQUEST_DETAIL_MAX_LENGTH,
} from "../workshop-request.ts";

test("upgrade requests require an equipped inventory entry and enough detail", () => {
  assert.deepEqual(
    parseEquipmentWorkshopRequest({ kind: "upgrade", details: "충분히 자세한 요청입니다." }),
    { ok: false, error: "강화할 장착 장비를 선택해 주세요." },
  );

  assert.deepEqual(
    parseEquipmentWorkshopRequest({
      kind: "upgrade",
      inventoryEntryId: "entry-1",
      details: "반동 제어 성능을 강화하고 싶습니다.",
    }),
    {
      ok: true,
      input: {
        kind: "upgrade",
        inventoryEntryId: "entry-1",
        details: "반동 제어 성능을 강화하고 싶습니다.",
      },
    },
  );
});

test("custom requests normalize whitespace without accepting empty prose", () => {
  assert.equal(
    parseEquipmentWorkshopRequest({ kind: "custom", details: "  짧음  " }).ok,
    false,
  );
  assert.deepEqual(
    parseEquipmentWorkshopRequest({
      kind: "custom",
      details: "  접이식 창과 와이어 회수 장치를 결합한 무기를 원합니다.  ",
    }),
    {
      ok: true,
      input: {
        kind: "custom",
        details: "접이식 창과 와이어 회수 장치를 결합한 무기를 원합니다.",
      },
    },
  );
});

test("request validation rejects unknown kinds and oversized details", () => {
  assert.equal(
    parseEquipmentWorkshopRequest({ kind: "exclusive", details: "충분히 긴 요청 내용입니다." }).ok,
    false,
  );
  assert.equal(
    parseEquipmentWorkshopRequest({
      kind: "custom",
      details: "가".repeat(WORKSHOP_REQUEST_DETAIL_MAX_LENGTH + 1),
    }).ok,
    false,
  );
  assert.equal(getEquipmentWorkshopRequestLabel("upgrade"), "장착 장비 강화 문의");
  assert.equal(getEquipmentWorkshopRequestLabel("custom"), "커스텀 장비 제작 의뢰");
});

test("workshop request status transitions keep terminal states closed", () => {
  assert.equal(
    canTransitionEquipmentWorkshopRequestStatus("REQUESTED", "IN_REVIEW"),
    true,
  );
  assert.equal(
    canTransitionEquipmentWorkshopRequestStatus("IN_REVIEW", "APPROVED"),
    true,
  );
  assert.equal(
    canTransitionEquipmentWorkshopRequestStatus("APPROVED", "COMPLETED"),
    true,
  );
  assert.equal(canTransitionEquipmentWorkshopRequestStatus("APPROVED", "QUOTED"), true);
  assert.equal(canTransitionEquipmentWorkshopRequestStatus("QUOTED", "IN_PROGRESS"), true);
  assert.equal(canTransitionEquipmentWorkshopRequestStatus("QUOTED", "DECLINED"), true);
  assert.equal(canTransitionEquipmentWorkshopRequestStatus("IN_PROGRESS", "CANCELLED"), true);
  assert.equal(
    canTransitionEquipmentWorkshopRequestStatus("COMPLETED", "IN_REVIEW"),
    false,
  );
  assert.equal(
    canTransitionEquipmentWorkshopRequestStatus("REJECTED", "APPROVED"),
    false,
  );
  assert.equal(requiresEquipmentWorkshopOperatorNote("COMPLETED"), true);
  assert.equal(requiresEquipmentWorkshopOperatorNote("REJECTED"), true);
  assert.equal(requiresEquipmentWorkshopOperatorNote("IN_REVIEW"), false);
});

test("quote validation enforces cost precision, material quantities, duration and image URL", () => {
  const valid = {
    expectedVersion: 0,
    creditCost: 125.5,
    durationMinutes: 60,
    materials: [{ itemId: "64b64c1f4b13a06f4d0f0001", quantity: 2 }],
    result: {
      name: "개조형 장검",
      description: "균형추와 날 정렬을 조정한 캐릭터 전용 장검입니다.",
      tags: ["냉병기"],
      previewImage: "/assets/items/upgraded-sword.webp",
    },
  };
  assert.equal(parseEquipmentWorkshopQuote(valid).ok, true);
  assert.equal(parseEquipmentWorkshopQuote({ ...valid, creditCost: 0.29 }).ok, true);
  assert.equal(parseEquipmentWorkshopQuote({ ...valid, creditCost: 1.001 }).ok, false);
  assert.equal(parseEquipmentWorkshopQuote({ ...valid, durationMinutes: 43_201 }).ok, false);
  assert.equal(parseEquipmentWorkshopQuote({ ...valid, materials: [{ ...valid.materials[0], quantity: 1000 }] }).ok, false);
  assert.equal(parseEquipmentWorkshopQuote({ ...valid, result: { ...valid.result, previewImage: "http://unsafe.test/item.png" } }).ok, false);
});

test("specialist routing is deterministic and READY is derived from server time", () => {
  assert.equal(resolveEquipmentWorkshopSpecialist({ tags: ["냉병기"] }), "TEMPER");
  assert.equal(resolveEquipmentWorkshopSpecialist({ tags: ["화기", "소총"] }), "TOWASKI");
  assert.equal(resolveEquipmentWorkshopSpecialist({ tags: ["신체증강"] }), "SUTURE");
  assert.equal(resolveEquipmentWorkshopSpecialist({ tags: ["전략장비", "드론"] }), "RATCHET");
  assert.equal(resolveEquipmentWorkshopSpecialist({ tags: ["미분류"] }), "VERNIER");
  const now = new Date("2026-07-13T10:00:00.000Z");
  assert.equal(getEquipmentWorkshopComputedStatus("IN_PROGRESS", "2026-07-13T09:59:59.000Z", now), "READY");
  assert.equal(getEquipmentWorkshopComputedStatus("IN_PROGRESS", "2026-07-13T10:00:01.000Z", now), "IN_PROGRESS");
  assert.equal(getEquipmentWorkshopComputedStatus("COMPLETED", "2026-07-13T09:00:00.000Z", now), "COMPLETED");
});

test("workshop idempotency accepts only the same normalized payload", () => {
  const original = {
    kind: "upgrade",
    details: "반동 제어 장치를 보강해 주세요.",
    inventoryEntryId: "entry-1",
  };
  assert.equal(isSameEquipmentWorkshopRequestPayload(original, original), true);
  assert.equal(
    isSameEquipmentWorkshopRequestPayload(original, {
      ...original,
      inventoryEntryId: "entry-2",
    }),
    false,
  );
});

test("workshop route derives ownership and equipped gear on the server", () => {
  const route = readFileSync(
    new URL(
      "../../../app/api/erp/equipment-shop/workshop-request/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(route, /findMainCharacterByOwner\(session\.user\.id\)/);
  assert.match(route, /entry\.equippedSlot/);
  assert.match(route, /notifyEquipmentWorkshopRequest/);
  assert.match(route, /notifyUsers/);
  assert.match(route, /insertEquipmentWorkshopRequest/);
  assert.match(route, /getEquipmentResearchCapabilities/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /장착 장비 강화는 견적·수락·수령 또는 제작 취소 전용 API/);
});

test("workshop requests use idempotency and invalidate their request ledger", () => {
  const mutation = readFileSync(
    new URL(
      "../../../hooks/mutations/useEquipmentShopMutation.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(mutation, /equipment-workshop-request/);
  assert.match(mutation, /equipmentShopKeys\.workshopRequests/);
  assert.match(mutation, /inventoryKeys\.all/);
  assert.match(mutation, /creditKeys\.all/);
  assert.match(mutation, /notificationKeys\.all/);
});

test("player/admin DTOs are separated and economy routes require ownership and idempotency", () => {
  const db = readFileSync(new URL("../../db/equipment-workshop-requests.ts", import.meta.url), "utf8");
  const playerRoute = readFileSync(new URL("../../../app/api/erp/equipment-shop/workshop-request/[requestId]/[action]/route.ts", import.meta.url), "utf8");
  const adminRoute = readFileSync(new URL("../../../app/api/erp/admin/equipment-workshop/[requestId]/[action]/route.ts", import.meta.url), "utf8");
  assert.match(db, /internalNote: _internalNote/);
  assert.match(db, /serializeAdminEquipmentWorkshopRequest[\s\S]*request\.internalNote/);
  assert.match(playerRoute, /current\.userId !== session\.user\.id/);
  assert.match(playerRoute, /readIdempotencyKey\(request\)/);
  assert.match(adminRoute, /hasRole\(session\.user\.role, "GM"\)/);
  assert.match(adminRoute, /expectedVersion/);
});

test("image upload verifies GM role, declared MIME, file size and magic bytes", () => {
  const uploadRoute = readFileSync(new URL("../../../app/api/erp/admin/equipment-workshop/assets/route.ts", import.meta.url), "utf8");
  assert.match(uploadRoute, /hasRole\(session\.user\.role, "GM"\)/);
  assert.match(uploadRoute, /MAX_IMAGE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(uploadRoute, /detectImageType\(bytes\)/);
  assert.match(uploadRoute, /detectedType !== file\.type/);
  assert.match(uploadRoute, /BLOB_NOT_CONFIGURED/);
});

test("accept, claim and cancel keep every economy mutation inside the supplied transaction", () => {
  const operations = readFileSync(new URL("../workshop-operations.ts", import.meta.url), "utf8");
  const playerRoute = readFileSync(new URL("../../../app/api/erp/equipment-shop/workshop-request/[requestId]/[action]/route.ts", import.meta.url), "utf8");
  const adminRoute = readFileSync(new URL("../../../app/api/erp/admin/equipment-workshop/[requestId]/[action]/route.ts", import.meta.url), "utf8");
  assert.match(playerRoute, /executeEconomicOperation\([\s\S]*acceptWorkshopQuoteInTransaction/);
  assert.match(playerRoute, /executeEconomicOperation\([\s\S]*claimWorkshopResultInTransaction/);
  assert.match(adminRoute, /executeEconomicOperation\([\s\S]*cancelWorkshopInTransaction/);
  assert.match(operations, /escrowEquippedSource\(request, input\.session\)[\s\S]*consumeMaterials\(request, input\.session\)[\s\S]*addCredit\([\s\S]*session: input\.session/);
  assert.match(operations, /isAvailable: false/);
  assert.match(operations, /isPublic: false/);
  assert.match(operations, /price: 0/);
  assert.match(operations, /balanceStatus: "balance-candidate"/);
  assert.match(operations, /equipCharacterInventoryItem\(request\.characterId, request\.quote\.result\.itemId, request\.sourceSlot/);
});

test("only one in-progress request can escrow an inventory entry", () => {
  const indexes = readFileSync(new URL("../../../../packages/shared-db/src/indexes.ts", import.meta.url), "utf8");
  assert.match(indexes, /equipment_workshop_requests_inventoryEntry_in_progress_unique[\s\S]*unique: true[\s\S]*status: "IN_PROGRESS"/);
});
