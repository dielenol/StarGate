import type { EquipmentWorkshopBlueprintInput } from "@/lib/equipment-shop/workshop-blueprint";

export interface EquipmentWorkshopPreset {
  key: string;
  displayName: string;
  sourceClass: "design-proposal";
  balanceStatus: "balance-candidate";
  blueprint: EquipmentWorkshopBlueprintInput;
}

export const EQUIPMENT_WORKSHOP_PRESET_PREFIX = "preset:";

export const EQUIPMENT_WORKSHOP_PRESETS: readonly EquipmentWorkshopPreset[] = [
  {
    key: "claymore-assault-shield-u1",
    displayName: "공격 방패 - 크레모아 개조형",
    sourceClass: "design-proposal",
    balanceStatus: "balance-candidate",
    blueprint: {
      slug: "basic-assault-shield-claymore-u1",
      displayName: "공격 방패 - 크레모아 개조형",
      applicability: {
        kinds: ["upgrade"],
        sourceSlugs: ["basic-assault-shield"],
        sourceCategories: ["WEAPON"],
        resultCategory: "WEAPON",
      },
      defaults: {
        creditCost: 400,
        durationMinutes: 4_320,
        specialistCodename: "TEMPER",
        specialistWorkflow: [
          {
            specialistCodename: "TEMPER",
            task: "아케론 대장간에서 방패 본체 보강과 크레모아 장착부를 선행 제작한다.",
          },
          {
            specialistCodename: "TOWASKI",
            task: "전용 크레모아 장약과 기폭 계통을 통합하고 폭발물 최종 검수로 마감한다.",
          },
        ],
        specialistNote:
          "브리짓 케인 (TEMPER) 아케론 대장간 선행 제작 / 립 토와스키 (TOWASKI) 폭발물 최종 마감",
        modificationDomain: "ENERGY_EXPLOSIVE_OUTPUT",
        materials: [{ slug: "force_core", quantity: 1 }],
        result: {
          name: "공격 방패 - 크레모아 개조형",
          description:
            "아케론 대장간에서 방패 본체와 장약 마운트를 보강한 뒤 토와스키가 전용 크레모아 장약과 기폭 계통을 통합한 이동식 전용 개조형이다. 기본 공격은 12 물리로 상향한다.",
          damage: "12 물리",
          tags: [
            "공방개조",
            "전용장비",
            "방패",
            "폭발물",
            "크레모아",
            "아케론대장간",
            "TEMPER",
            "TOWASKI",
            "U1",
          ],
          equipmentAction: {
            code: "U1",
            name: "크레모아 반응장갑",
            description:
              "방패 전면의 크레모아 장약을 기폭해 사용자 주변을 포함한 범위에 화염 피해를 준다.",
            effect:
              "자신의 액션과 장비 충전 1회를 소모한다. 1×5 전장에서는 자신과 좌우 인접 1칸의 모든 대상에게 30 화염 피해를 준다. 5×5 전장에서는 자신 중심 3×3 영역의 모든 대상에게 30 화염 피해를 준 뒤 사용자가 후방 1칸 이동하며, 이동할 수 없으면 제자리에 남는다. 사용자와 아군도 피해를 받으며 충전이 0이면 사용할 수 없다.",
            actionCost: 1,
            chargeCost: 1,
            maxCharges: 1,
            reloadCreditCost: 200,
            reloadApproval: "GM",
          },
        },
      },
    },
  },
];

export function getEquipmentWorkshopPresetSelectionValue(key: string): string {
  return `${EQUIPMENT_WORKSHOP_PRESET_PREFIX}${key}`;
}

export function findEquipmentWorkshopPreset(
  selectionValue: string,
): EquipmentWorkshopPreset | undefined {
  if (!selectionValue.startsWith(EQUIPMENT_WORKSHOP_PRESET_PREFIX)) {
    return undefined;
  }
  const key = selectionValue.slice(EQUIPMENT_WORKSHOP_PRESET_PREFIX.length);
  return EQUIPMENT_WORKSHOP_PRESETS.find((preset) => preset.key === key);
}
