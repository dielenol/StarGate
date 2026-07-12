import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canTransitionEquipmentWorkshopRequestStatus,
  getEquipmentWorkshopRequestLabel,
  isSameEquipmentWorkshopRequestPayload,
  parseEquipmentWorkshopRequest,
  requiresEquipmentWorkshopOperatorNote,
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
});
