import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
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

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/equipment-shop/workshop-request") {
      return nextResolve(new URL("../workshop-request.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { parseEquipmentWorkshopBlueprint } = await import(
  "../workshop-blueprint.ts"
);

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

test("reload requests require an equipped entry and use a server-owned description", () => {
  assert.equal(parseEquipmentWorkshopRequest({ kind: "reload" }).ok, false);
  assert.deepEqual(
    parseEquipmentWorkshopRequest({
      kind: "reload",
      inventoryEntryId: "entry-1",
      details: "클라이언트가 바꾸려는 설명",
    }),
    {
      ok: true,
      input: {
        kind: "reload",
        inventoryEntryId: "entry-1",
        details: "장착 장비 액션 재장전 승인 요청",
      },
    },
  );
  assert.equal(getEquipmentWorkshopRequestLabel("reload"), "장비 액션 재장전 결재 요청");
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

test("quote validation accepts specialist override and a charge-backed U action", () => {
  const parsed = parseEquipmentWorkshopQuote({
    expectedVersion: 0,
    creditCost: 400,
    durationMinutes: 4_320,
    specialistCodename: "TOWASKI",
    specialistNote: "VERNIER 접수·통합 / TOWASKI 폭발물 검수",
    modificationDomain: "ENERGY_EXPLOSIVE_OUTPUT",
    materials: [{ itemId: "6a00b417585bb4a1ce48b64f", quantity: 1 }],
    result: {
      name: "보급형 공격 방패 · 크레모아 개조형",
      description: "기존 공격 방패에 크레모아 반응장갑을 통합한 전용 개조형입니다.",
      damage: "10 물리",
      equipmentAction: {
        code: "U1",
        name: "크레모아 반응장갑",
        description: "방패 전면 장약을 기폭합니다.",
        effect: "자신의 액션과 장비 충전 1회를 소모해 전장 규격에 따른 범위에 30 화염 피해를 줍니다.",
        actionCost: 1,
        chargeCost: 1,
        maxCharges: 1,
        reloadCreditCost: 200,
        reloadApproval: "GM",
      },
    },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.input.specialistCodename, "TOWASKI");
  assert.equal(parsed.input.modificationDomain, "ENERGY_EXPLOSIVE_OUTPUT");
  assert.equal(parsed.input.result.equipmentAction.code, "U1");
  assert.equal(parsed.input.result.equipmentAction.reloadCreditCost, 200);
});

test("quote validation accepts stable material slugs and explicit custom result category", () => {
  const parsed = parseEquipmentWorkshopQuote({
    expectedVersion: 0,
    creditCost: 400,
    durationMinutes: 4_320,
    specialistCodename: "TOWASKI",
    modificationDomain: "ENERGY_EXPLOSIVE_OUTPUT",
    materials: [{ slug: "force_core", quantity: 1 }],
    result: {
      category: "WEAPON",
      name: "커스텀 폭발 방패",
      description: "신규 제작용 결과 장비 분류와 slug 재료를 검증합니다.",
      tags: ["공방제작"],
    },
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.input.materials, [{ slug: "force_core", quantity: 1 }]);
  assert.equal(parsed.input.result.category, "WEAPON");
});

test("workshop blueprint parser keeps reusable defaults separate from quote snapshots", () => {
  const blueprint = readFileSync(new URL("../workshop-blueprint.ts", import.meta.url), "utf8");
  const seed = JSON.parse(
    readFileSync(
      new URL(
        "../../../scripts/seed-payloads/equipment-workshop-blueprint-claymore-u1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.match(blueprint, /parseEquipmentWorkshopBlueprint/);
  assert.match(blueprint, /materials: Array<\{ slug: string; quantity: number \}>/);
  assert.equal(
    parseEquipmentWorkshopBlueprint(seed.update.$setOnInsert).ok,
    true,
  );
  assert.equal(seed.update.$setOnInsert.defaults.result.previewImage, undefined);
  assert.deepEqual(seed.update.$setOnInsert.defaults.materials, [{ slug: "force_core", quantity: 1 }]);
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
  assert.match(route, /장비 강화·신규 제작은 견적·수락·수령 또는 제작 취소 전용 API/);
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
  assert.match(adminRoute, /characterInventoryCol\(\)[\s\S]*sourceEntry/);
  assert.match(adminRoute, /sourceSnapshot/);
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
  assert.match(operations, /request\.kind === "upgrade"[\s\S]*escrowEquippedSource\(request, input\.session\)[\s\S]*consumeMaterials\(request, input\.session\)[\s\S]*addCredit\([\s\S]*session: input\.session/);
  assert.match(operations, /isAvailable: false/);
  assert.match(operations, /isPublic: false/);
  assert.match(operations, /price: 0/);
  assert.match(operations, /ownerId: request\.userId/);
  assert.match(operations, /lifecycle: "operational"/);
  assert.match(operations, /balanceStatus: "approved"/);
  assert.match(operations, /const resultSlot = request\.quote\.result\.category/);
  assert.match(operations, /equipCharacterInventoryItem\([\s\S]*request\.quote\.result\.itemId,[\s\S]*resultSlot/);
  assert.match(operations, /equipmentAction: request\.quote\.result\.equipmentAction/);
  assert.match(operations, /equipmentCharge:[\s\S]*current: request\.quote\.result\.equipmentAction\.maxCharges/);
  assert.match(operations, /const existingResult = await inventory\.findOne/);
  assert.match(operations, /결과 장비가 이미 인벤토리에 있어 안전하게 수령할 수 없습니다/);
  assert.match(operations, /sourceEquipmentCharge/);
});

test("reload approval revalidates ownership and empty equipped charge in one economy transaction", () => {
  const operations = readFileSync(new URL("../workshop-operations.ts", import.meta.url), "utf8");
  const adminRoute = readFileSync(new URL("../../../app/api/erp/admin/equipment-workshop/[requestId]/[action]/route.ts", import.meta.url), "utf8");
  assert.match(adminRoute, /executeEconomicOperation\([\s\S]*approveWorkshopReloadInTransaction/);
  assert.match(operations, /ownerId: request\.userId/);
  assert.match(operations, /equippedSlot: request\.sourceSlot/);
  assert.match(operations, /"equipmentCharge\.current": 0/);
  assert.match(operations, /amount: -request\.reload\.creditCost[\s\S]*"equipmentCharge\.current": action\.maxCharges/);
  assert.match(operations, /childIdempotencyKey\(input\.requestId, "reload-credit"\)/);
  assert.match(operations, /childIdempotencyKey\(input\.requestId, "credit"\)/);
  assert.match(operations, /childIdempotencyKey\(input\.requestId, "refund"\)/);
});

test("only one in-progress request can escrow an inventory entry", () => {
  const indexes = readFileSync(new URL("../../../../packages/shared-db/src/indexes.ts", import.meta.url), "utf8");
  assert.match(indexes, /equipment_workshop_requests_inventoryEntry_in_progress_unique[\s\S]*unique: true[\s\S]*status: "IN_PROGRESS"/);
  assert.match(indexes, /equipment_workshop_requests_active_operation_unique[\s\S]*unique: true[\s\S]*activeOperationKey/);
  assert.match(indexes, /equipment_workshop_blueprints_slug_unique[\s\S]*unique: true/);
});

test("blueprint API is GM-only and uses versioned soft archive semantics", () => {
  const route = readFileSync(
    new URL(
      "../../../app/api/erp/admin/equipment-workshop/blueprints/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const db = readFileSync(
    new URL("../../db/equipment-workshop-blueprints.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /hasRole\(session\.user\.role, "GM"\)/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /export async function DELETE/);
  assert.match(db, /expectedVersion/);
  assert.match(db, /status: "ARCHIVED"/);
  assert.match(db, /\$inc: \{ version: 1 \}/);
});

test("private workshop catalog items are visible only to their owner or V+", () => {
  const listPage = readFileSync(
    new URL(
      "../../../app/(erp)/erp/wiki/catalog/[category]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const detailPage = readFileSync(
    new URL(
      "../../../app/(erp)/erp/wiki/catalog/item/[key]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const itemsRoute = readFileSync(
    new URL("../../../app/api/erp/inventory/items/route.ts", import.meta.url),
    "utf8",
  );
  const inventoryDb = readFileSync(
    new URL("../../db/inventory.ts", import.meta.url),
    "utf8",
  );
  assert.match(listPage, /listVisibleMasterItems/);
  assert.match(detailPage, /findVisibleMasterItemBySlugOrId/);
  assert.match(itemsRoute, /listVisibleMasterItems/);
  assert.match(inventoryDb, /"workshop\.ownerId": input\.userId/);
  assert.match(inventoryDb, /includePrivate/);
});

test("quotes snapshot procurement cost and Nochichim exposes equipped actions separately", () => {
  const adminRoute = readFileSync(new URL("../../../app/api/erp/admin/equipment-workshop/[requestId]/[action]/route.ts", import.meta.url), "utf8");
  const playerClient = readFileSync(new URL("../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx", import.meta.url), "utf8");
  const snapshots = readFileSync(new URL("../../../app/api/vtt/nochichim/_lib/snapshots.ts", import.meta.url), "utf8");
  const actionRoute = readFileSync(new URL("../../../app/api/vtt/nochichim/characters/[id]/equipment-action/route.ts", import.meta.url), "utf8");
  assert.match(adminRoute, /findShopItemBySlug/);
  assert.match(adminRoute, /포스코어는 에너지장·폭발·출력 계통 개조에만/);
  assert.match(adminRoute, /VF혈액팩은 생체 접속·재생·자기수복 계통 개조에만/);
  assert.match(adminRoute, /materialCost/);
  assert.match(adminRoute, /totalCost/);
  assert.match(adminRoute, /slug: item\.slug/);
  assert.match(playerClient, /총 경제 부담/);
  assert.match(playerClient, /관료 결재 요청/);
  assert.match(snapshots, /equipmentActions/);
  assert.match(snapshots, /consumeEquippedEquipmentCharge/);
  assert.match(actionRoute, /requireNochichimSyncAuth/);
});

test("GM material picker supports name and category search", () => {
  const adminClient = readFileSync(
    new URL("../../../app/(erp)/erp/admin/equipment-workshop/EquipmentWorkshopAdminClient.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminClient, /role="combobox"/);
  assert.match(adminClient, /item\.name\.toLowerCase\(\)\.includes\(normalized\)/);
  assert.match(adminClient, /item\.slug\.toLowerCase\(\)\.includes\(normalized\)/);
  assert.match(adminClient, /item\.category\.toLowerCase\(\)\.includes\(normalized\)/);
  assert.match(adminClient, /현재 공개 마스터 품목에서 선택해 주세요/);
});
