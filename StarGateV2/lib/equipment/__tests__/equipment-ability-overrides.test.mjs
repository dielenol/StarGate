import assert from "node:assert/strict";
import test from "node:test";

import { applyEquipmentAbilityOverrides } from "../equipment-ability-overrides.ts";

const abilities = [
  {
    slot: "A1",
    code: "절제",
    name: "절제",
    effect: "라운드당 7 피해, 5라운드 지속.",
  },
  {
    slot: "A2",
    code: "레퀴엠",
    name: "레퀴엠",
    effect: "기본 공격 수치만큼 추가 피해를 준다.",
  },
];

test("equipped weapon overrides only the targeted ability effect", () => {
  const result = applyEquipmentAbilityOverrides(abilities, [
    {
      equippedSlot: "WEAPON",
      equipmentAbilityOverrides: [
        {
          targetCode: "A1",
          effect:
            "단일 대상에게 중근거리 출혈 상태이상을 부여한다. 라운드당 10 피해, 5라운드 지속.",
        },
      ],
    },
  ]);

  assert.equal(
    result[0].effect,
    "단일 대상에게 중근거리 출혈 상태이상을 부여한다. 라운드당 10 피해, 5라운드 지속.",
  );
  assert.equal(result[1], abilities[1]);
  assert.equal(abilities[0].effect, "라운드당 7 피해, 5라운드 지속.");
});

test("unequipped overrides are ignored and armor wins after weapon", () => {
  const ignored = applyEquipmentAbilityOverrides(abilities, [
    {
      equipmentAbilityOverrides: [
        { targetCode: "A1", effect: "장착되지 않은 효과" },
      ],
    },
  ]);
  assert.equal(ignored[0], abilities[0]);

  const result = applyEquipmentAbilityOverrides(abilities, [
    {
      equippedSlot: "ARMOR",
      equipmentAbilityOverrides: [
        { targetCode: "절제", effect: "방어구 우선 효과" },
      ],
    },
    {
      equippedSlot: "WEAPON",
      equipmentAbilityOverrides: [
        { targetCode: "A1", effect: "무기 효과" },
      ],
    },
  ]);
  assert.equal(result[0].effect, "방어구 우선 효과");
});

test("missing target codes leave the original sheet unchanged", () => {
  const result = applyEquipmentAbilityOverrides(abilities, [
    {
      equippedSlot: "WEAPON",
      equipmentAbilityOverrides: [
        { targetCode: "A5", effect: "존재하지 않는 대상" },
      ],
    },
  ]);
  assert.deepEqual(result, abilities);
});
