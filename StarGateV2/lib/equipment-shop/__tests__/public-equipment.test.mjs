import assert from "node:assert/strict";
import test from "node:test";

import { mergePublicEquipment } from "../../equipment/public-equipment.ts";

test("equipped inventory replaces mapped legacy equipment", () => {
  assert.deepEqual(
    mergePublicEquipment({
      inventoryEntries: [
        {
          itemName: "보급형 돌격소총",
          slug: "basic-assault-rifle",
          equippedSlot: "WEAPON",
          damage: "2D6",
        },
      ],
      legacyEquipment: [{ name: "보급형 사냥용 소총", damage: "1D6" }],
    }),
    [
      {
        name: "보급형 돌격소총",
        price: "",
        damage: "2D6",
        description: "",
      },
    ],
  );
});

test("unequipped inventory items do not reappear through mapped legacy data", () => {
  assert.deepEqual(
    mergePublicEquipment({
      inventoryEntries: [
        {
          itemName: "보급형 돌격소총",
          slug: "basic-assault-rifle",
        },
      ],
      legacyEquipment: [{ name: "보급형 사냥용 소총" }],
    }),
    [],
  );
});

test("signature inventory replaces the original agent equipment records", () => {
  assert.deepEqual(
    mergePublicEquipment({
      inventoryEntries: [
        {
          itemName: "악식의 콘치타",
          slug: "conchita-of-gluttony",
          equippedSlot: "WEAPON",
          damage: "근거리 5 물리 / 중거리 5 물리",
        },
      ],
      legacyEquipment: [{ name: "악식의 콘치타", damage: "근거리/중거리 5" }],
    }),
    [
      {
        name: "악식의 콘치타",
        price: "",
        damage: "근거리 5 물리 / 중거리 5 물리",
        description: "",
      },
    ],
  );
});

test("equipped private workshop result exposes safe display fields and replaces its source", () => {
  assert.deepEqual(
    mergePublicEquipment({
      inventoryEntries: [
        {
          itemName: "악식의 콘치타 - 개조형",
          slug: "workshop-result-id",
          equippedSlot: "WEAPON",
          isPublic: false,
          damage: "근거리 15 물리 / 중거리 5 물리",
          description:
            "악식의 콘치타의 근거리 타격 구조를 보강하고 절제의 출혈 지속 피해를 연동한 개조형 단검.",
          workshop: {
            sourceItemName: "악식의 콘치타",
          },
        },
      ],
      legacyEquipment: [
        {
          name: "악식의 콘치타",
          damage: "근거리 5 물리 / 중거리 5 물리",
        },
      ],
    }),
    [
      {
        name: "악식의 콘치타 - 개조형",
        price: "",
        damage: "근거리 15 물리 / 중거리 5 물리",
        description:
          "악식의 콘치타의 근거리 타격 구조를 보강하고 절제의 출혈 지속 피해를 연동한 개조형 단검.",
      },
    ],
  );
});

test("authorized equipment projection can retain equipped private non-workshop items", () => {
  assert.deepEqual(
    mergePublicEquipment({
      includePrivate: true,
      inventoryEntries: [
        {
          itemName: "비공개 VTT 전용 장비",
          slug: "private-vtt-equipment",
          equippedSlot: "WEAPON",
          isPublic: false,
          damage: "20 물리",
          description: "인증된 VTT에는 유지되어야 한다.",
        },
      ],
      legacyEquipment: [],
    }),
    [
      {
        name: "비공개 VTT 전용 장비",
        price: "",
        damage: "20 물리",
        description: "인증된 VTT에는 유지되어야 한다.",
      },
    ],
  );
});

test("unequipped workshop result still suppresses its legacy source in authorized projections", () => {
  assert.deepEqual(
    mergePublicEquipment({
      includePrivate: true,
      inventoryEntries: [
        {
          itemName: "악식의 콘치타 - 개조형",
          equippedSlot: undefined,
          isPublic: false,
          workshop: { sourceItemName: "악식의 콘치타" },
        },
        {
          itemName: "교체 무기",
          equippedSlot: "WEAPON",
          isPublic: false,
          damage: "8 물리",
        },
      ],
      legacyEquipment: [
        {
          name: "악식의 콘치타",
          damage: "근거리 5 물리 / 중거리 5 물리",
        },
      ],
    }),
    [
      {
        name: "교체 무기",
        price: "",
        damage: "8 물리",
        description: "",
      },
    ],
  );
});

test("unequipped signature weapon suppresses the duplicated legacy claymore", () => {
  assert.deepEqual(
    mergePublicEquipment({
      inventoryEntries: [
        {
          itemName: "CMMG Mk.47 Mutant (N.O.S.B Mod.)",
          slug: "cmmg-mk47-mutant-nosb-mod",
          equippedSlot: "WEAPON",
        },
        {
          itemName: "택티컬 클레이모어",
          slug: "tactical-claymore",
        },
      ],
      legacyEquipment: [
        { name: "CMMG Mk.47 Mutant (N.O.S.B Mod.)" },
        { name: "택티컬 클레이모어" },
      ],
    }),
    [
      {
        name: "CMMG Mk.47 Mutant (N.O.S.B Mod.)",
        price: "",
        damage: "",
        description: "",
      },
    ],
  );
});

test("unmapped legacy equipment remains visible while private inventory stays hidden", () => {
  assert.deepEqual(
    mergePublicEquipment({
      inventoryEntries: [
        {
          itemName: "기밀 장비",
          equippedSlot: "WEAPON",
          isPublic: false,
        },
      ],
      legacyEquipment: [{ name: "고유 유산 장비", description: "기존 공개 기록" }],
    }),
    [
      {
        name: "고유 유산 장비",
        price: "",
        damage: "",
        description: "기존 공개 기록",
      },
    ],
  );
});
