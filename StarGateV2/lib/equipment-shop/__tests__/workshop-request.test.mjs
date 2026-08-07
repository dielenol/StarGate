import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

import {
  canTransitionEquipmentWorkshopRequestStatus,
  EQUIPMENT_WORKSHOP_TERMINAL_STATUSES,
  buildEquipmentWorkshopResultTags,
  getEquipmentWorkshopUserTags,
  getEquipmentWorkshopComputedStatus,
  getEquipmentWorkshopRequestLabel,
  isActiveEquipmentWorkshopRequestStatus,
  isSameEquipmentWorkshopRequestPayload,
  mergeEquipmentWorkshopRequestLists,
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
    if (specifier === "@/lib/equipment-shop/workshop-blueprint") {
      return nextResolve(new URL("../workshop-blueprint.ts", import.meta.url).href, context);
    }
    if (specifier === "@/lib/bureaucrat-votes/presets") {
      return nextResolve(
        new URL("../../bureaucrat-votes/presets.ts", import.meta.url).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

const { parseEquipmentWorkshopBlueprint } = await import(
  "../workshop-blueprint.ts"
);
const {
  EQUIPMENT_WORKSHOP_PRESETS,
  findEquipmentWorkshopPreset,
  getEquipmentWorkshopPresetSelectionValue,
} = await import("../workshop-presets.ts");
const { buildWorkshopResultMasterItem } = await import(
  "../workshop-result-master-item.ts"
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
  assert.equal(isActiveEquipmentWorkshopRequestStatus("REQUESTED"), true);
  assert.equal(isActiveEquipmentWorkshopRequestStatus("IN_PROGRESS"), true);
  assert.equal(isActiveEquipmentWorkshopRequestStatus("COMPLETED"), false);
  assert.equal(isActiveEquipmentWorkshopRequestStatus("REJECTED"), false);
  assert.deepEqual(EQUIPMENT_WORKSHOP_TERMINAL_STATUSES, [
    "COMPLETED",
    "DECLINED",
    "REJECTED",
    "CANCELLED",
  ]);
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

test("operations request merge preserves active requests beyond the recent history limit", () => {
  const activeRequests = Array.from({ length: 150 }, (_, index) => ({
    _id: `active-${index}`,
    status: "IN_PROGRESS",
  }));
  const recentRequests = [
    ...activeRequests.slice(100),
    ...Array.from({ length: 50 }, (_, index) => ({
      _id: `completed-${index}`,
      status: "COMPLETED",
    })),
  ];

  const mergedRequests = mergeEquipmentWorkshopRequestLists(
    activeRequests,
    recentRequests,
  );

  assert.equal(mergedRequests.length, 200);
  assert.deepEqual(
    mergedRequests.slice(0, 150).map((request) => request._id),
    activeRequests.map((request) => request._id),
  );
  assert.equal(
    new Set(mergedRequests.map((request) => request._id)).size,
    mergedRequests.length,
  );
});

test("quote validation enforces cost precision, material quantities, duration and image URL", () => {
  const valid = {
    expectedVersion: 0,
    creditCost: 125.5,
    durationMinutes: 1_440,
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
  assert.equal(parseEquipmentWorkshopQuote({ ...valid, durationMinutes: 1_439 }).ok, false);
  assert.equal(parseEquipmentWorkshopQuote({ ...valid, durationMinutes: 43_201 }).ok, false);
  assert.equal(parseEquipmentWorkshopQuote({ ...valid, materials: [{ ...valid.materials[0], quantity: 1000 }] }).ok, false);
  assert.equal(parseEquipmentWorkshopQuote({ ...valid, result: { ...valid.result, previewImage: "http://unsafe.test/item.png" } }).ok, false);
});

test("modification domains and selected materials validate independently", () => {
  const baseQuote = {
    expectedVersion: 0,
    creditCost: 1800,
    durationMinutes: 1_440,
    result: {
      name: "재료 독립 검증 장비",
      description: "개조 계통과 투입 재료를 독립적으로 검증하는 장비입니다.",
    },
  };

  assert.equal(
    parseEquipmentWorkshopQuote({
      ...baseQuote,
      modificationDomain: "BIO_REGEN_REPAIR",
      materials: [{ itemId: "64b64c1f4b13a06f4d0f0001", quantity: 1 }],
    }).ok,
    true,
  );
  assert.equal(
    parseEquipmentWorkshopQuote({
      ...baseQuote,
      modificationDomain: "GENERAL",
      materials: [{ itemId: "64b64c1f4b13a06f4d0f0002", quantity: 1 }],
    }).ok,
    true,
  );
});

test("quote materials keep personal and shared inventory scopes distinct", () => {
  const base = {
    expectedVersion: 0,
    creditCost: 0,
    durationMinutes: 1_440,
    modificationDomain: "GENERAL",
    result: {
      name: "재료 범위 검증 장비",
      description: "개인 재료와 공용 재료의 식별 범위를 검증합니다.",
    },
  };
  const parsed = parseEquipmentWorkshopQuote({
    ...base,
    materials: [
      { slug: "broken-syllable", quantity: 1 },
      { slug: "broken-syllable", scope: "SHARED", quantity: 3 },
    ],
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.input.materials, [
    { slug: "broken-syllable", quantity: 1 },
    { slug: "broken-syllable", scope: "SHARED", quantity: 3 },
  ]);
  assert.equal(
    parseEquipmentWorkshopQuote({
      ...base,
      materials: [
        { slug: "broken-syllable", scope: "SHARED", quantity: 1 },
        { slug: "broken-syllable", scope: "SHARED", quantity: 2 },
      ],
    }).ok,
    false,
  );
});

test("conditional vote materials and approved outputs remain separate from acceptance materials", () => {
  const base = {
    expectedVersion: 0,
    creditCost: 0,
    durationMinutes: 1_440,
    modificationDomain: "GENERAL",
    materials: [{ slug: "force_core", quantity: 1 }],
    approvalGate: {
      mode: "BUREAUCRAT_VOTE",
      title: "특수 산출물 제작 승인",
      content: "가결된 경우에만 완료품 수령 단계에서 재료를 차감합니다.",
      conditionalMaterials: [
        { slug: "broken-syllable", scope: "SHARED", quantity: 3 },
      ],
      approvedOutputs: [{ slug: "zulu-0028-censor-3", quantity: 3 }],
    },
    result: {
      name: "조건부 제작 검증 장비",
      description: "기본 제작과 조건부 표결 산출물을 함께 검증합니다.",
    },
  };

  const parsed = parseEquipmentWorkshopQuote(base);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.input.materials, [
    { slug: "force_core", quantity: 1 },
  ]);
  assert.deepEqual(parsed.input.approvalGate.conditionalMaterials, [
    { slug: "broken-syllable", scope: "SHARED", quantity: 3 },
  ]);
  assert.deepEqual(parsed.input.approvalGate.approvedOutputs, [
    { slug: "zulu-0028-censor-3", quantity: 3 },
  ]);
  assert.equal(
    parseEquipmentWorkshopQuote({
      ...base,
      approvalGate: {
        ...base.approvalGate,
        conditionalMaterials: [{ slug: "force_core", quantity: 1 }],
      },
    }).ok,
    false,
  );
});

test("quote validation preserves multiple actions, mount rules and non-reloadable charges", () => {
  const result = {
    name: "복수 액션 검증 장비",
    description: "구조화된 거치와 제한 탄환 계약을 검증합니다.",
    equipmentActions: [
      {
        code: "U1",
        name: "거치 전환",
        description: "장비의 거치 상태를 전환합니다.",
        effect: "거치와 회수 규칙은 전투 프로필을 따릅니다.",
        kind: "STANCE",
        actionCost: 1,
        chargeCost: 0,
        maxCharges: 0,
        reloadCreditCost: 0,
        reloadApproval: "GM",
        reloadable: false,
      },
      {
        code: "U2",
        name: "제한 탄환",
        description: "거치 중 제한 탄환을 발사합니다.",
        effect: "충전 1회를 소모합니다.",
        actionCost: 1,
        chargeCost: 1,
        maxCharges: 3,
        reloadCreditCost: 0,
        reloadApproval: "GM",
        reloadable: false,
        requiresMounted: true,
        consumesRegularAmmo: 0,
        rangeMinCells: 1,
        rangeMaxCells: 6,
        damage: {
          type: "PSYCHIC",
          amount: 30,
          ignoresDefense: true,
          scaling: "NONE",
        },
      },
    ],
    combatProfile: {
      ammoCapacity: 12,
      mount: {
        mountActionCost: 1,
        unmountActionCost: 1,
        blocksMovement: true,
        allowsDiagonalFire: true,
        bonusDamage: 0,
      },
    },
  };
  const parsed = parseEquipmentWorkshopQuote({
    expectedVersion: 0,
    creditCost: 0,
    durationMinutes: 1_440,
    modificationDomain: "GENERAL",
    materials: [],
    result,
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.input.result.equipmentActions[1].reloadable, false);
  assert.equal(parsed.input.result.equipmentActions[1].rangeMinCells, 1);
  assert.equal(parsed.input.result.equipmentActions[1].rangeMaxCells, 6);
  assert.deepEqual(parsed.input.result.equipmentActions[1].damage, {
    type: "PSYCHIC",
    amount: 30,
    ignoresDefense: true,
    scaling: "NONE",
  });
  assert.equal(parsed.input.result.combatProfile.ammoCapacity, 12);
  assert.equal(
    parseEquipmentWorkshopQuote({
      expectedVersion: 0,
      creditCost: 0,
      durationMinutes: 1_440,
      modificationDomain: "GENERAL",
      materials: [],
      result: {
        ...result,
        equipmentActions: result.equipmentActions.map((action) =>
          action.code === "U2"
            ? { ...action, reloadable: true }
            : action,
        ),
      },
    }).ok,
    false,
    "복수 액션 재장전 경로는 지원 근거가 없으므로 허용하지 않는다",
  );
  assert.equal(
    parseEquipmentWorkshopQuote({
      expectedVersion: 0,
      creditCost: 0,
      durationMinutes: 1_440,
      modificationDomain: "GENERAL",
      materials: [],
      result: {
        ...result,
        equipmentActions: result.equipmentActions.map((action) =>
          action.code === "U2" ? { ...action, actionCost: 2 } : action,
        ),
      },
    }).ok,
    false,
    "boolean action economy에서는 비용 2 이상을 허용하지 않는다",
  );
  assert.equal(
    parseEquipmentWorkshopQuote({
      expectedVersion: 0,
      creditCost: 0,
      durationMinutes: 1_440,
      modificationDomain: "GENERAL",
      materials: [],
      result: {
        ...result,
        combatProfile: {
          ...result.combatProfile,
          mount: { ...result.combatProfile.mount, unmountActionCost: 2 },
        },
      },
    }).ok,
    false,
    "거치와 회수도 현재 행동 자원 계약상 정확히 1만 허용한다",
  );
  assert.equal(
    parseEquipmentWorkshopQuote({
      expectedVersion: 0,
      creditCost: 0,
      durationMinutes: 1_440,
      modificationDomain: "GENERAL",
      materials: [],
      result: {
        ...result,
        equipmentAction: result.equipmentActions[1],
      },
    }).ok,
    false,
  );
});

test("네베드 preset은 소모품 기반 U2와 구조화 돌격소총 피해 계약을 통과한다", () => {
  const preset = findEquipmentWorkshopPreset(
    getEquipmentWorkshopPresetSelectionValue("neved-pian-bulwark"),
  );
  assert.ok(preset);
  assert.equal(preset.blueprint.defaults.creditCost, 1_200);
  assert.equal(preset.blueprint.defaults.durationMinutes, 1_440);
  assert.equal(parseEquipmentWorkshopBlueprint(preset.blueprint).ok, true);

  const result = preset.blueprint.defaults.result;
  const parsed = parseEquipmentWorkshopQuote({
    expectedVersion: 0,
    ...preset.blueprint.defaults,
    materials: preset.blueprint.defaults.materials,
    result: {
      ...result,
      category: "WEAPON",
    },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.input.result.combatProfile.weaponAttack.usesCharacterAttack, false);
  assert.deepEqual(
    parsed.input.result.combatProfile.weaponAttack.damageByRange.map(
      (band) => [band.minCells, band.maxCells, band.damage.amount],
    ),
    [
      [0, 0, 7],
      [1, 2, 12],
      [3, 4, 12],
    ],
  );
  assert.equal(parsed.input.result.combatProfile.mount.mountedRangeShape, "DIAMOND");
  assert.equal(
    parsed.input.approvalGate.presetKey,
    "zulu-0028-censor-3-manufacture-v1",
  );
  assert.deepEqual(parsed.input.approvalGate.conditionalMaterials, [
    { slug: "broken-syllable", scope: "SHARED", quantity: 3 },
  ]);
  assert.deepEqual(parsed.input.approvalGate.approvedOutputs, [
    { slug: "zulu-0028-censor-3", quantity: 3 },
  ]);
  const censor = parsed.input.result.equipmentActions.find(
    (action) => action.code === "U2",
  );
  assert.equal(censor.kind, "CONSUMABLE");
  assert.equal(censor.consumesRegularAmmo, 0);
  assert.deepEqual(censor.consumableCost, {
    slug: "zulu-0028-censor-3",
    quantity: 1,
  });
  assert.deepEqual(censor.additionalDamage, {
    type: "PSYCHIC",
    amount: 30,
    ignoresDefense: true,
    scaling: "NONE",
  });
});

test("구조화 총기는 캐릭터 ATK 적용이나 무탄약 기본 사격을 허용하지 않는다", () => {
  const preset = structuredClone(
    EQUIPMENT_WORKSHOP_PRESETS.find(
      (candidate) => candidate.key === "neved-pian-bulwark",
    ).blueprint.defaults,
  );
  preset.expectedVersion = 0;

  preset.result.combatProfile.weaponAttack.usesCharacterAttack = true;
  assert.equal(parseEquipmentWorkshopQuote(preset).ok, false);

  preset.result.combatProfile.weaponAttack.usesCharacterAttack = false;
  preset.result.combatProfile.weaponAttack.consumesRegularAmmo = 0;
  assert.equal(parseEquipmentWorkshopQuote(preset).ok, false);
});

test("quote validation accepts specialist override and a charge-backed U action", () => {
  const parsed = parseEquipmentWorkshopQuote({
    expectedVersion: 0,
    creditCost: 400,
    durationMinutes: 4_320,
    specialistCodename: "TEMPER",
    specialistWorkflow: [
      {
        specialistCodename: "TEMPER",
        task: "아케론 대장간에서 방패 본체와 장약 마운트를 선행 제작한다.",
      },
      {
        specialistCodename: "TOWASKI",
        task: "크레모아 장약과 기폭 계통을 통합하고 최종 검수한다.",
      },
    ],
    specialistNote: "아케론 대장간 선행 제작 / TOWASKI 최종 마감",
    modificationDomain: "ENERGY_EXPLOSIVE_OUTPUT",
    materials: [{ itemId: "6a00b417585bb4a1ce48b64f", quantity: 1 }],
    result: {
      name: "공격 방패 - 크레모아 개조형",
      description: "기존 공격 방패에 크레모아 반응장갑을 통합한 전용 개조형입니다.",
      damage: "12 물리",
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
  assert.equal(parsed.input.specialistCodename, "TEMPER");
  assert.deepEqual(
    parsed.input.specialistWorkflow.map((step) => step.specialistCodename),
    ["TEMPER", "TOWASKI"],
  );
  assert.equal(parsed.input.modificationDomain, "ENERGY_EXPLOSIVE_OUTPUT");
  assert.equal(parsed.input.result.damage, "12 물리");
  assert.equal(parsed.input.result.equipmentAction.code, "U1");
  assert.equal(parsed.input.result.equipmentAction.reloadCreditCost, 200);
});

test("quote validation preserves structured equipment ability overrides", () => {
  const parsed = parseEquipmentWorkshopQuote({
    expectedVersion: 0,
    creditCost: 500,
    durationMinutes: 4_320,
    specialistCodename: "TEMPER",
    specialistWorkflow: [
      { specialistCodename: "TEMPER", task: "근거리 타격 구조 개조" },
      { specialistCodename: "VERNIER", task: "절제 출혈 효과 연동 검수" },
    ],
    modificationDomain: "GENERAL",
    materials: [],
    result: {
      category: "WEAPON",
      name: "악식의 콘치타 - 개조형",
      description: "원본과 별개로 생성되는 캐릭터 전용 개조 결과입니다.",
      damage: "근거리 15 물리 / 중거리 5 물리",
      equipmentAbilityOverrides: [
        {
          targetCode: "A1",
          effect:
            "단일 대상에게 중근거리 출혈 상태이상을 부여한다. 라운드당 10 피해, 5라운드 지속.",
        },
      ],
    },
  });

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.input.result.equipmentAbilityOverrides, [
    {
      targetCode: "A1",
      effect:
        "단일 대상에게 중근거리 출혈 상태이상을 부여한다. 라운드당 10 피해, 5라운드 지속.",
    },
  ]);
  assert.equal(parsed.input.result.equipmentAction, undefined);
});

test("accepted quote builds the claimed master item without losing ability overrides", () => {
  const parsed = parseEquipmentWorkshopQuote({
    expectedVersion: 0,
    creditCost: 500,
    durationMinutes: 4_320,
    specialistCodename: "TEMPER",
    specialistWorkflow: [
      { specialistCodename: "TEMPER", task: "근거리 타격 구조 개조" },
      { specialistCodename: "VERNIER", task: "절제 출혈 효과 연동 검수" },
    ],
    modificationDomain: "GENERAL",
    materials: [],
    result: {
      category: "WEAPON",
      name: "악식의 콘치타 - 개조형",
      description: "개조형 단검",
      damage: "근거리 15 물리 / 중거리 5 물리",
      previewImage:
        "/assets/catalog/equipment/conchita-of-gluttony-modified.webp",
      equipmentAbilityOverrides: [
        {
          targetCode: "A1",
          effect:
            "단일 대상에게 중근거리 출혈 상태이상을 부여한다. 라운드당 10 피해, 5라운드 지속.",
        },
      ],
    },
  });
  assert.equal(parsed.ok, true);

  const resultItemId = "507f1f77bcf86cd799439011";
  const now = new Date("2026-07-28T08:00:00.000Z");
  const resultMaster = buildWorkshopResultMasterItem(
    {
      _id: "equipment-workshop-request:test",
      kind: "upgrade",
      userId: "owner-id",
      userName: "힘이",
      characterId: "character-id",
      characterCodename: "TIGER298",
      sourceItemId: "source-item-id",
      sourceSlot: "WEAPON",
      inventoryEntryId: "inventory-entry-id",
      equipmentName: "악식의 콘치타",
      details: "무기 기본 공격력 증가 강화",
      status: "IN_PROGRESS",
      createdAt: now,
      updatedAt: now,
      quote: {
        ...parsed.input,
        version: 1,
        materialCost: 0,
        totalCost: 500,
        result: {
          ...parsed.input.result,
          itemId: resultItemId,
          slug: `workshop-${resultItemId}`,
          category: "WEAPON",
          tags: ["공방개조", "TIGER298"],
          generation: 1,
        },
        issuedAt: now,
        issuedById: "gm-id",
        issuedByName: "GM",
      },
    },
    now,
  );

  assert.deepEqual(
    resultMaster.equipmentAbilityOverrides,
    parsed.input.result.equipmentAbilityOverrides,
  );
  assert.equal(resultMaster.name, "악식의 콘치타 - 개조형");
  assert.equal(resultMaster.damage, "근거리 15 물리 / 중거리 5 물리");
  assert.equal(
    resultMaster.previewImage,
    "/assets/catalog/equipment/conchita-of-gluttony-modified.webp",
  );
  assert.equal(resultMaster.workshop.sourceItemName, "악식의 콘치타");
});

test("quote validation rejects duplicate, empty and oversized ability overrides", () => {
  const base = {
    expectedVersion: 0,
    creditCost: 500,
    durationMinutes: 4_320,
    modificationDomain: "GENERAL",
    materials: [],
    result: {
      category: "WEAPON",
      name: "악식의 콘치타 - 개조형",
      description: "장착형 어빌리티 강화 입력 검증용 결과입니다.",
    },
  };

  assert.equal(
    parseEquipmentWorkshopQuote({
      ...base,
      result: {
        ...base.result,
        equipmentAbilityOverrides: [
          { targetCode: "A1", effect: "첫 효과" },
          { targetCode: "A1", effect: "중복 효과" },
        ],
      },
    }).ok,
    false,
  );
  assert.equal(
    parseEquipmentWorkshopQuote({
      ...base,
      result: {
        ...base.result,
        equipmentAbilityOverrides: [{ targetCode: "A1", effect: " " }],
      },
    }).ok,
    false,
  );
  assert.equal(
    parseEquipmentWorkshopQuote({
      ...base,
      result: {
        ...base.result,
        equipmentAbilityOverrides: [
          { targetCode: "A1", effect: "가".repeat(1_001) },
        ],
      },
    }).ok,
    false,
  );
});

test("quote validation rejects a mismatched primary specialist or duplicated workflow", () => {
  const base = {
    expectedVersion: 0,
    creditCost: 400,
    durationMinutes: 4_320,
    specialistCodename: "TEMPER",
    modificationDomain: "ENERGY_EXPLOSIVE_OUTPUT",
    materials: [{ slug: "force_core", quantity: 1 }],
    result: {
      category: "WEAPON",
      name: "공격 방패 - 크레모아 개조형",
      description: "복합 담당 공정 검증용 결과 장비입니다.",
    },
  };
  assert.equal(
    parseEquipmentWorkshopQuote({
      ...base,
      specialistWorkflow: [
        { specialistCodename: "TOWASKI", task: "최종 마감" },
      ],
    }).ok,
    false,
  );
  assert.equal(
    parseEquipmentWorkshopQuote({
      ...base,
      specialistWorkflow: [
        { specialistCodename: "TEMPER", task: "선행 제작" },
        { specialistCodename: "TEMPER", task: "중복 검수" },
      ],
    }).ok,
    false,
  );
  assert.equal(
    parseEquipmentWorkshopQuote({
      ...base,
      specialistWorkflow: [
        { specialistCodename: "TEMPER", task: "" },
      ],
    }).ok,
    false,
  );
});

test("requoting replaces system specialist tags while preserving operator tags", () => {
  const tags = buildEquipmentWorkshopResultTags({
    tags: [
      "전용장비",
      "공방개조",
      "TEMPER",
      "TOWASKI",
      "LEE DONGSIK",
    ],
    kind: "upgrade",
    specialistWorkflow: [
      { specialistCodename: "TEMPER", task: "방패 본체 보강" },
    ],
    characterCodename: "LEE DONGSIK",
  });
  assert.deepEqual(tags, [
    "전용장비",
    "공방개조",
    "TEMPER",
    "LEE DONGSIK",
  ]);
  assert.equal(tags.includes("TOWASKI"), false);
});

test("twenty operator tags remain valid after a multi-specialist quote round trip", () => {
  const operatorTags = Array.from({ length: 20 }, (_, index) => `태그-${index + 1}`);
  const workflow = [
    { specialistCodename: "TEMPER", task: "방패 본체 보강" },
    { specialistCodename: "TOWASKI", task: "폭발물 최종 마감" },
  ];
  const storedTags = buildEquipmentWorkshopResultTags({
    tags: operatorTags,
    kind: "upgrade",
    specialistWorkflow: workflow,
    characterCodename: "LEE DONGSIK",
  });
  assert.equal(storedTags.length, 24);
  const reparsed = parseEquipmentWorkshopQuote({
    expectedVersion: 1,
    creditCost: 400,
    durationMinutes: 4_320,
    specialistCodename: "TEMPER",
    specialistWorkflow: workflow,
    modificationDomain: "ENERGY_EXPLOSIVE_OUTPUT",
    materials: [{ slug: "force_core", quantity: 1 }],
    result: {
      category: "WEAPON",
      name: "공격 방패 - 크레모아 개조형",
      description: "복합 담당 공정 재견적 태그 경계 검증용 장비입니다.",
      tags: getEquipmentWorkshopUserTags(storedTags, "LEE DONGSIK"),
    },
  });
  assert.equal(reparsed.ok, true);
  assert.deepEqual(reparsed.input.result.tags, operatorTags);
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
  assert.match(blueprint, /materials: Array<\{/);
  assert.match(blueprint, /scope\?: "CHARACTER" \| "SHARED"/);
  assert.equal(
    parseEquipmentWorkshopBlueprint(seed.update.$setOnInsert).ok,
    true,
  );
  assert.equal(
    seed.update.$setOnInsert.defaults.result.previewImage,
    "/assets/catalog/equipment/assault-shield-claymore-modified-v2.webp",
  );
  assert.deepEqual(seed.update.$setOnInsert.defaults.materials, [{ slug: "force_core", quantity: 1 }]);
  assert.equal(seed.update.$setOnInsert.displayName, "공격 방패 - 크레모아 개조형");
  assert.equal(seed.update.$setOnInsert.defaults.result.damage, "12 물리");
  assert.deepEqual(
    seed.update.$setOnInsert.defaults.specialistWorkflow.map(
      (step) => step.specialistCodename,
    ),
    ["TEMPER", "TOWASKI"],
  );
});

test("workshop blueprint keeps equipment ability overrides in reusable defaults", () => {
  const parsed = parseEquipmentWorkshopBlueprint({
    slug: "conchita-of-gluttony-modified",
    displayName: "악식의 콘치타 - 개조형",
    applicability: {
      kinds: ["upgrade"],
      sourceSlugs: ["conchita-of-gluttony"],
      sourceCategories: ["WEAPON"],
      resultCategory: "WEAPON",
    },
    defaults: {
      creditCost: 500,
      durationMinutes: 4_320,
      specialistCodename: "TEMPER",
      specialistWorkflow: [
        { specialistCodename: "TEMPER", task: "근거리 타격 구조 개조" },
        { specialistCodename: "VERNIER", task: "절제 출혈 효과 연동 검수" },
      ],
      modificationDomain: "GENERAL",
      materials: [],
      result: {
        name: "악식의 콘치타 - 개조형",
        description: "원본과 별개로 생성되는 캐릭터 전용 개조 결과입니다.",
        damage: "근거리 15 물리 / 중거리 5 물리",
        equipmentAbilityOverrides: [
          {
            targetCode: "A1",
            effect:
              "단일 대상에게 중근거리 출혈 상태이상을 부여한다. 라운드당 10 피해, 5라운드 지속.",
          },
        ],
      },
    },
  });

  assert.equal(parsed.ok, true);
  assert.equal(
    parsed.input.defaults.result.equipmentAbilityOverrides[0].targetCode,
    "A1",
  );
});

test("conchita modification is available as a non-mutating built-in preset", () => {
  const preset = EQUIPMENT_WORKSHOP_PRESETS.find(
    (entry) => entry.key === "conchita-of-gluttony-modified",
  );

  assert.ok(preset);
  assert.equal(parseEquipmentWorkshopBlueprint(preset.blueprint).ok, true);
  assert.deepEqual(preset.blueprint.applicability.sourceSlugs, [
    "conchita-of-gluttony",
  ]);
  assert.equal(preset.blueprint.defaults.creditCost, 500);
  assert.equal(preset.blueprint.defaults.durationMinutes, 4_320);
  assert.deepEqual(preset.blueprint.defaults.materials, []);
  assert.equal(preset.blueprint.defaults.modificationDomain, "GENERAL");
  assert.deepEqual(
    preset.blueprint.defaults.specialistWorkflow.map(
      (step) => [step.specialistCodename, step.task],
    ),
    [
      ["TEMPER", "근거리 타격 구조 개조"],
      ["VERNIER", "절제 출혈 효과 연동 검수"],
    ],
  );
  assert.equal(
    preset.blueprint.defaults.result.description,
    "악식의 콘치타의 근거리 타격 구조를 보강하고 절제의 출혈 지속 피해를 연동한 개조형 단검.",
  );
  assert.equal(
    preset.blueprint.defaults.result.damage,
    "근거리 15 물리 / 중거리 5 물리",
  );
  assert.equal(
    preset.blueprint.defaults.result.previewImage,
    "/assets/catalog/equipment/conchita-of-gluttony-modified.webp",
  );
  assert.deepEqual(preset.blueprint.defaults.result.tags, [
    "전용장비",
    "단검",
    "TIGER298",
  ]);
  assert.deepEqual(
    preset.blueprint.defaults.result.equipmentAbilityOverrides,
    [
      {
        targetCode: "A1",
        effect:
          "단일 대상에게 중근거리 출혈 상태이상을 부여한다. 라운드당 10 피해, 5라운드 지속.",
      },
    ],
  );
  assert.equal(preset.blueprint.defaults.result.equipmentAction, undefined);
  assert.doesNotMatch(JSON.stringify(preset.blueprint), /atkDelta/);
});

test("claymore shield is available as a built-in editable workshop preset", () => {
  const seed = JSON.parse(
    readFileSync(
      new URL(
        "../../../scripts/seed-payloads/equipment-workshop-blueprint-claymore-u1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).update.$setOnInsert;
  const preset = EQUIPMENT_WORKSHOP_PRESETS.find(
    (entry) => entry.key === "claymore-assault-shield-u1",
  );
  assert.ok(preset);
  assert.equal(parseEquipmentWorkshopBlueprint(preset.blueprint).ok, true);
  assert.equal(preset.blueprint.displayName, "공격 방패 - 크레모아 개조형");
  assert.equal(preset.blueprint.defaults.creditCost, 400);
  assert.equal(preset.blueprint.defaults.durationMinutes, 4_320);
  assert.deepEqual(preset.blueprint.defaults.materials, [
    { slug: "force_core", quantity: 1 },
  ]);
  assert.equal(preset.blueprint.defaults.result.damage, "12 물리");
  assert.equal(
    preset.blueprint.defaults.result.previewImage,
    "/assets/catalog/equipment/assault-shield-claymore-modified-v2.webp",
  );
  assert.equal(
    existsSync(
      new URL(
        `../../../public${preset.blueprint.defaults.result.previewImage}`,
        import.meta.url,
      ),
    ),
    true,
  );
  assert.equal(
    preset.blueprint.defaults.result.equipmentAction?.reloadCreditCost,
    200,
  );
  assert.deepEqual(
    preset.blueprint.defaults.specialistWorkflow?.map(
      (step) => step.specialistCodename,
    ),
    ["TEMPER", "TOWASKI"],
  );
  assert.equal(
    findEquipmentWorkshopPreset(
      getEquipmentWorkshopPresetSelectionValue(preset.key),
    ),
    preset,
  );
  assert.deepEqual(preset.blueprint, {
    slug: seed.slug,
    displayName: seed.displayName,
    applicability: seed.applicability,
    defaults: seed.defaults,
  });
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
  assert.doesNotMatch(route, /mainCharacter\.type !== "AGENT"/);
  assert.match(route, /entry\.equippedSlot/);
  assert.match(route, /enqueueEquipmentWorkshopWebhook/);
  assert.doesNotMatch(route, /notifyEquipmentWorkshopRequest/);
  assert.match(route, /notifyUsers/);
  assert.match(route, /insertEquipmentWorkshopRequest/);
  assert.match(
    route,
    /withTransaction\(async \(\) => \{[\s\S]*insertEquipmentWorkshopRequest\(requestDoc,[\s\S]*session: dbSession[\s\S]*enqueueEquipmentWorkshopWebhook\([\s\S]*session: dbSession/,
  );
  assert.match(
    route,
    /if \(!isSameEquipmentWorkshopRequestPayload\(existing, requestDoc\)\)[\s\S]*enqueueEquipmentWorkshopWebhook\([\s\S]*createWebhookPayload\(existing\),[\s\S]*webhookDedupeKey/,
  );
  assert.doesNotMatch(
    route,
    /CUSTOM_WEAPON_SLOT_REQUIRED|getEquipmentResearchCapabilities/,
  );
  assert.match(route, /export async function GET/);
  assert.match(
    route,
    /listActiveEquipmentWorkshopRequests\(\{\s*userId: session\.user\.id,\s*\}\)/,
  );
  assert.match(
    route,
    /listEquipmentWorkshopOperationsRequests\(\{ recentLimit: 100 \}\)/,
  );
  assert.match(route, /export async function PATCH/);
  assert.match(route, /장비 강화·신규 제작은 견적·수락·수령 또는 제작 취소 전용 API/);
});

test("operations request query leaves the active request list uncapped", () => {
  const db = readFileSync(
    new URL("../../db/equipment-workshop-requests.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    db,
    /if \(options\.limit !== undefined\) \{[\s\S]*cursor\.limit/,
  );
  assert.match(
    db,
    /listEquipmentWorkshopOperationsRequests[\s\S]*listActiveEquipmentWorkshopRequests\(\)/,
  );
  assert.match(
    db,
    /listEquipmentWorkshopOperationsRequests[\s\S]*listTerminalEquipmentWorkshopRequests\(\{[\s\S]*limit: options\.recentLimit \?\? 100/,
  );
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
  const resultMasterItem = readFileSync(
    new URL("../workshop-result-master-item.ts", import.meta.url),
    "utf8",
  );
  const playerRoute = readFileSync(new URL("../../../app/api/erp/equipment-shop/workshop-request/[requestId]/[action]/route.ts", import.meta.url), "utf8");
  const adminRoute = readFileSync(new URL("../../../app/api/erp/admin/equipment-workshop/[requestId]/[action]/route.ts", import.meta.url), "utf8");
  assert.match(playerRoute, /executeEconomicOperation\([\s\S]*acceptWorkshopQuoteInTransaction/);
  assert.match(playerRoute, /executeEconomicOperation\([\s\S]*claimWorkshopResultInTransaction/);
  assert.match(adminRoute, /executeEconomicOperation\([\s\S]*cancelWorkshopInTransaction/);
  assert.match(operations, /request\.kind === "upgrade"[\s\S]*escrowEquippedSource\(request, input\.session\)[\s\S]*consumeMaterials\(request, request\.quote\.materials, input\.session\)[\s\S]*addCredit\([\s\S]*session: input\.session/);
  assert.match(
    operations,
    /amount: -request\.quote\.creditCost[\s\S]*type: "PURCHASE"[\s\S]*requestId: childIdempotencyKey\(input\.requestId, "credit"\)[\s\S]*session: input\.session/,
  );
  assert.match(resultMasterItem, /isAvailable: false/);
  assert.match(resultMasterItem, /isPublic: false/);
  assert.match(resultMasterItem, /price: 0/);
  assert.match(resultMasterItem, /ownerId: request\.userId/);
  assert.match(resultMasterItem, /lifecycle: "operational"/);
  assert.match(resultMasterItem, /balanceStatus: "approved"/);
  assert.match(resultMasterItem, /specialistWorkflow: request\.quote\.specialistWorkflow/);
  assert.match(operations, /const resultSlot = request\.quote\.result\.category/);
  assert.match(operations, /equipCharacterInventoryItem\([\s\S]*request\.quote\.result\.itemId,[\s\S]*resultSlot/);
  assert.match(resultMasterItem, /equipmentAction: request\.quote\.result\.equipmentAction/);
  assert.match(operations, /equipmentCharge:[\s\S]*current: request\.quote\.result\.equipmentAction\.maxCharges/);
  assert.match(operations, /const existingResult = await inventory\.findOne/);
  assert.match(operations, /결과 장비가 이미 인벤토리에 있어 안전하게 수령할 수 없습니다/);
  assert.match(operations, /sourceEquipmentCharge/);
  assert.match(operations, /sourceEquipmentCharges/);
  assert.match(operations, /sourceEquipmentAmmo/);
  assert.match(
    operations,
    /hasStatefulEquipmentData && source\.quantity !== 1[\s\S]*수량이 1개인 인벤토리 항목만 접수/,
  );
  assert.match(operations, /sharedInventory\.findOneAndUpdate\([\s\S]*scope: "GLOBAL"[\s\S]*session/);
  assert.match(operations, /addToSharedInventory\([\s\S]*공방 취소 공용 재료 반환/);
  assert.match(operations, /requireWorkshopCharacterOwnership/);
  assert.match(
    operations,
    /type: \{ \$in: \["AGENT", "NPC"\] \}[\s\S]*role: "GM"[\s\S]*status: "ACTIVE"/,
  );
});

test("linked workshop vote is created at acceptance and executed atomically only at approved claim", () => {
  const operations = readFileSync(
    new URL("../workshop-operations.ts", import.meta.url),
    "utf8",
  );
  const playerRoute = readFileSync(
    new URL(
      "../../../app/api/erp/equipment-shop/workshop-request/[requestId]/[action]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const acceptOperation = operations.slice(
    operations.indexOf("export async function acceptWorkshopQuoteInTransaction"),
    operations.indexOf("async function requireClosedWorkshopApproval"),
  );
  const claimOperation = operations.slice(
    operations.indexOf("export async function claimWorkshopResultInTransaction"),
    operations.indexOf("export async function approveWorkshopReloadInTransaction"),
  );

  assert.match(
    acceptOperation,
    /createBureaucratVote\([\s\S]*source: "WORKSHOP"[\s\S]*workshopRef:[\s\S]*quoteVersion: request\.quote\.version[\s\S]*session: input\.session/,
  );
  assert.match(acceptOperation, /approvalVoteId = vote\._id\.toHexString\(\)/);
  assert.match(
    acceptOperation,
    /consumeMaterials\(request, request\.quote\.materials, input\.session\)/,
  );
  assert.doesNotMatch(
    acceptOperation,
    /consumeMaterials\([\s\S]{0,100}conditionalMaterials/,
  );
  assert.match(
    claimOperation,
    /requireClosedWorkshopApproval\([\s\S]*approvalOutcome === "APPROVED"[\s\S]*consumeMaterials\([\s\S]*request\.quote\.approvalGate\.conditionalMaterials[\s\S]*ensureResultMasterItem/,
  );
  assert.match(
    claimOperation,
    /approvalOutcome === "APPROVED"[\s\S]*validateAndGrantApprovedOutputs\([\s\S]*session: input\.session/,
  );
  assert.match(
    claimOperation,
    /approvalOutcome[\s\S]*approvalResolvedAt: approval\.resolvedAt/,
  );
  assert.match(playerRoute, /const guildId = process\.env\.GUILD_ID\?\.trim\(\)/);
  assert.match(playerRoute, /acceptWorkshopQuoteInTransaction\([\s\S]*guildId,/);
  assert.match(playerRoute, /APPROVAL_PENDING: "WORKSHOP_APPROVAL_PENDING"/);
});

test("workshop quote acceptance blocks insufficient credit while still requiring materials", () => {
  const operations = readFileSync(
    new URL("../workshop-operations.ts", import.meta.url),
    "utf8",
  );
  const acceptOperation = operations.slice(
    operations.indexOf("export async function acceptWorkshopQuoteInTransaction"),
    operations.indexOf("export async function cancelWorkshopInTransaction"),
  );
  const playerClient = readFileSync(
    new URL(
      "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    playerClient,
    /const creditReady = balance >= quote\.creditCost/,
  );
  assert.match(
    playerClient,
    /disabled=\{!materialsReady \|\| !creditReady \|\| acceptWorkshopQuoteMutation\.isPending\}/,
  );
  assert.doesNotMatch(
    playerClient,
    /공임 부족분은 마이너스 잔액으로 이월/,
  );
  assert.doesNotMatch(
    acceptOperation,
    /allowNegative: true/,
  );
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
  assert.doesNotMatch(adminRoute, /incompatibleSpecialMaterial/);
  assert.doesNotMatch(adminRoute, /포스코어는 .* 계통 개조에만/);
  assert.doesNotMatch(adminRoute, /VF혈액팩은 .* 계통 개조에만/);
  assert.match(adminRoute, /materialCost/);
  assert.match(adminRoute, /specialistWorkflow/);
  assert.match(playerClient, /workshopSpecialistWorkflow/);
  assert.match(playerClient, /specialistWorkflow\.at\(-1\)/);
  assert.match(playerClient, /activeSpecialistCodename/);
  assert.match(adminRoute, /totalCost/);
  assert.match(adminRoute, /slug: item\.slug/);
  assert.match(playerClient, /총 경제 부담/);
  assert.match(playerClient, /관료 결재 요청/);
  assert.match(snapshots, /equipmentActions/);
  assert.match(snapshots, /consumeEquippedEquipmentCharge/);
  assert.match(actionRoute, /requireNochichimSyncAuth/);
});

test("ability overrides flow from quote validation to equipped ERP, public and VTT sheets", () => {
  const adminRoute = readFileSync(
    new URL(
      "../../../app/api/erp/admin/equipment-workshop/[requestId]/[action]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const operations = readFileSync(
    new URL("../workshop-operations.ts", import.meta.url),
    "utf8",
  );
  const inventory = readFileSync(
    new URL("../../db/inventory.ts", import.meta.url),
    "utf8",
  );
  const characterDetail = readFileSync(
    new URL(
      "../../../app/(erp)/erp/characters/[id]/CharacterDetailClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const publicPlayer = readFileSync(
    new URL("../../public-player.ts", import.meta.url),
    "utf8",
  );
  const snapshots = readFileSync(
    new URL(
      "../../../app/api/vtt/nochichim/_lib/snapshots.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const playerQuote = readFileSync(
    new URL(
      "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(adminRoute, /ABILITY_TARGET_CHANGED/);
  assert.match(adminRoute, /equipmentAbilityOverrides/);
  assert.match(operations, /equipmentAbilityOverrides/);
  assert.match(inventory, /equipmentAbilityOverrides/);
  assert.match(characterDetail, /applyEquipmentAbilityOverrides/);
  assert.match(publicPlayer, /applyEquipmentAbilityOverrides/);
  assert.match(snapshots, /applyEquipmentAbilityOverrides/);
  assert.match(playerQuote, /장착형 어빌리티 강화/);
});

test("quote issuance persists its outbox event without web-process Discord drain", () => {
  const adminRoute = readFileSync(
    new URL(
      "../../../app/api/erp/admin/equipment-workshop/[requestId]/[action]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const persistenceIndex = adminRoute.indexOf(
    "const updated = await updateEquipmentWorkshopQuote",
  );
  const erpNotificationIndex = adminRoute.indexOf(
    "await notifyUser",
    persistenceIndex,
  );
  const responseIndex = adminRoute.indexOf(
    "return NextResponse.json({ request:",
    erpNotificationIndex,
  );

  assert.ok(persistenceIndex >= 0);
  assert.ok(erpNotificationIndex > persistenceIndex);
  assert.ok(responseIndex > erpNotificationIndex);
  assert.doesNotMatch(adminRoute, /drainEquipmentWorkshopDiscordDms/);
  assert.doesNotMatch(adminRoute, /\bafter\(/);
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
  assert.match(adminClient, /task: ""/);
  assert.match(adminClient, /specialistWorkflowError/);
  assert.match(adminClient, /getEquipmentWorkshopUserTags/);
  assert.match(adminClient, /EQUIPMENT_WORKSHOP_PRESETS/);
  assert.match(adminClient, /기본 제공 프리셋/);
  assert.match(adminClient, /모든 항목 수정 가능/);
  assert.match(
    adminClient,
    /selectedBlueprint[\s\S]*blueprintRef:[\s\S]*id: selectedBlueprint\._id/,
  );
  assert.match(adminClient, /preservedEquipmentActions/);
  assert.match(adminClient, /preservedCombatProfile/);
  assert.match(adminClient, /formatEquipmentActionSummary/);
  assert.match(
    adminClient,
    /equipmentActions: draft\.preservedEquipmentActions/,
  );
  assert.match(adminClient, /combatProfile: draft\.preservedCombatProfile/);
  assert.match(adminClient, /구조화 계약은 현재 읽기 전용/);
});

test("GM workshop uses the shared accessible dropdown instead of native selects", () => {
  const adminClient = readFileSync(
    new URL(
      "../../../app/(erp)/erp/admin/equipment-workshop/EquipmentWorkshopAdminClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const dropdown = readFileSync(
    new URL(
      "../../../components/ui/DropdownSelect/DropdownSelect.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(adminClient, /<select\b/);
  assert.match(adminClient, /DropdownSelect/);
  assert.match(adminClient, /미저장 변경을 버리고 다른 요청으로 전환/);
  assert.match(adminClient, /조건에 맞는 요청 없음/);
  assert.match(dropdown, /aria-haspopup="listbox"/);
  assert.match(dropdown, /role="option"/);
  assert.match(dropdown, /event\.key === "ArrowDown"/);
  assert.match(dropdown, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(dropdown, /event\.key === "Escape"/);
});

test("GM workshop keeps quote steps visible for newly requested build requests", () => {
  const adminClient = readFileSync(
    new URL(
      "../../../app/(erp)/erp/admin/equipment-workshop/EquipmentWorkshopAdminClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const editableStatuses = adminClient.match(
    /const QUOTE_EDITABLE_STATUSES = new Set<EquipmentWorkshopRequestStatus>\(\[([\s\S]*?)\]\);/,
  )?.[1];
  const publishableStatuses = adminClient.match(
    /const QUOTE_PUBLISHABLE_STATUSES = new Set<EquipmentWorkshopRequestStatus>\(\[([\s\S]*?)\]\);/,
  )?.[1];

  assert.ok(editableStatuses);
  assert.ok(publishableStatuses);
  assert.match(editableStatuses, /"REQUESTED"/);
  assert.doesNotMatch(publishableStatuses, /"REQUESTED"/);
  assert.match(
    adminClient,
    /isBuildRequest && QUOTE_EDITABLE_STATUSES\.has\(selected\.status\)/,
  );
  assert.match(
    adminClient,
    /!QUOTE_PUBLISHABLE_STATUSES\.has\(selected\.status\)/,
  );
  assert.match(adminClient, /검토 시작 후 견적 발행 가능/);
});

test("workshop ledger hides terminal requests while GM operations renders result snapshots", () => {
  const playerClient = readFileSync(
    new URL(
      "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const adminClient = readFileSync(
    new URL(
      "../../../app/(erp)/erp/admin/equipment-workshop/EquipmentWorkshopAdminClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    playerClient,
    /\.filter\([\s\S]*isActiveEquipmentWorkshopRequestStatus\(request\.status\)/,
  );
  assert.match(adminClient, /발행 결과 장비 \(RESULT SNAPSHOT\)/);
  assert.match(adminClient, /readOnlyQuote\.result\.previewImage/);
  assert.match(adminClient, /readOnlyQuote\.result\.description/);
  assert.match(adminClient, /readOnlyQuote\.result\.equipmentAction/);
  assert.match(adminClient, /readOnlyQuote\.result\.equipmentActions\.map/);
  assert.match(adminClient, /readOnlyQuote\.result\.equipmentAbilityOverrides/);
  assert.match(
    adminClient,
    /개조 계통은 결과 장비의 분류이며,[\s\S]*투입 재료와 독립적으로/,
  );
});
