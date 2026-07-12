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
