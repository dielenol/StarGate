import type { EquipmentWorkshopBlueprintInput } from "@/lib/equipment-shop/workshop-blueprint";
import { CATALOG_ITEM_IMAGE_BY_SLUG } from "../assets/catalog.ts";
import {
  CENSOR3_MANUFACTURE_VOTE_PRESET,
  CENSOR3_MANUFACTURE_VOTE_PRESET_KEY,
} from "@/lib/bureaucrat-votes/presets";

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
    key: "conchita-of-gluttony-modified",
    displayName: "악식의 콘치타 - 개조형",
    sourceClass: "design-proposal",
    balanceStatus: "balance-candidate",
    blueprint: {
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
          {
            specialistCodename: "TEMPER",
            task: "근거리 타격 구조 개조",
          },
          {
            specialistCodename: "VERNIER",
            task: "절제 출혈 효과 연동 검수",
          },
        ],
        modificationDomain: "GENERAL",
        materials: [],
        result: {
          name: "악식의 콘치타 - 개조형",
          description:
            "악식의 콘치타의 근거리 타격 구조를 보강하고 절제의 출혈 지속 피해를 연동한 개조형 단검.",
          damage: "근거리 15 물리 / 중거리 5 물리",
          previewImage:
            CATALOG_ITEM_IMAGE_BY_SLUG["conchita-of-gluttony-modified"],
          tags: ["전용장비", "단검", "TIGER298"],
          equipmentAbilityOverrides: [
            {
              targetCode: "A1",
              effect:
                "단일 대상에게 중근거리 출혈 상태이상을 부여한다. 라운드당 10 피해, 5라운드 지속.",
            },
          ],
        },
      },
    },
  },
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
          previewImage:
            CATALOG_ITEM_IMAGE_BY_SLUG[
              "assault-shield-claymore-modified-v2"
            ],
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
  {
    key: "neved-pian-bulwark",
    displayName: "CMMG Mk.47 Mutant 「피안의 보루」",
    sourceClass: "design-proposal",
    balanceStatus: "balance-candidate",
    blueprint: {
      slug: "cmmg-mk47-mutant-pian-bulwark",
      displayName: "CMMG Mk.47 Mutant 「피안의 보루」",
      applicability: {
        kinds: ["upgrade"],
        sourceSlugs: ["cmmg-mk47-mutant-nosb-mod"],
        sourceCategories: ["WEAPON"],
        resultCategory: "WEAPON",
      },
      defaults: {
        creditCost: 1_200,
        durationMinutes: 1_440,
        specialistCodename: "TOWASKI",
        specialistWorkflow: [
          {
            specialistCodename: "TOWASKI",
            task: "Mk.47 총기 거치대·강화 탄창·급탄 계통을 일체형으로 개조한다.",
          },
          {
            specialistCodename: "VERNIER",
            task: "가공한 포스코어를 리시버 내부 안정화 계통에 통합하고 출력 안전성을 검수한다.",
          },
        ],
        specialistNote:
          "립 토와스키 (TOWASKI) 화기 개조 주담당 / 베르니에 (VERNIER) 포스코어 통합 검수",
        modificationDomain: "ENERGY_EXPLOSIVE_OUTPUT",
        materials: [
          { slug: "force_core", quantity: 1 },
          { slug: "extended-magazine-mod", quantity: 1 },
        ],
        approvalGate: {
          mode: "BUREAUCRAT_VOTE",
          presetKey: CENSOR3_MANUFACTURE_VOTE_PRESET_KEY,
          title: CENSOR3_MANUFACTURE_VOTE_PRESET.title,
          content: CENSOR3_MANUFACTURE_VOTE_PRESET.content,
          conditionalMaterials: [
            { slug: "broken-syllable", scope: "SHARED", quantity: 3 },
          ],
          approvedOutputs: [
            { slug: "zulu-0028-censor-3", quantity: 3 },
          ],
        },
        result: {
          name: "CMMG Mk.47 Mutant 「피안의 보루」",
          description:
            "네베드의 Mk.47에 강화 12발 탄창과 접이식 일체형 거치대, 가공 포스코어 안정화 계통을 통합한 전용 개조 돌격소총.",
          damage: "근거리 7 물리 / 중거리 12 물리 / 장거리 12 물리",
          effect:
            "거치와 해제는 각각 액션 1을 소모한다. 거치 상태에서는 이동할 수 없지만, 대각선 사격이 가능해진다. 대각선 사격은 다이아몬드 범위로 판정하며, 자세한 범위는 훈련장을 참조한다.",
          previewImage:
            CATALOG_ITEM_IMAGE_BY_SLUG[
              "cmmg-mk47-mutant-pian-bulwark"
            ],
          tags: [
            "공방개조",
            "전용장비",
            "원거리무기",
            "화기",
            "돌격소총",
            "네베드",
            "피안의보루",
            "거치무기",
            "TOWASKI",
            "VERNIER",
            "U1",
            "U2",
          ],
          equipmentActions: [
            {
              code: "U1",
              name: "총기 거치 전환",
              description:
                "접이식 거치대를 전개하거나 회수해 총기의 거치 상태를 전환한다.",
              effect:
                "거치와 해제는 각각 액션 1을 소모한다. 거치 상태에서는 이동할 수 없지만, 대각선 사격이 가능해진다. 대각선 사격은 다이아몬드 범위로 판정하며, 자세한 범위는 훈련장을 참조한다.",
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
              name: "파쇄음절탄 사격",
              description:
                "거치 상태에서 CENSOR-3 한 발을 장전한다. 네베드의 소총 패시브가 반영된 총기 기본 물리 피해를 가하고 대상 SAN을 15 감소시킨다.",
              effect:
                "액션 1과 실제 CENSOR-3 1발을 소모한다. 총기 기본 물리 피해를 판정한 뒤, 방어 수단과 DEF를 무시하고 대상 SAN을 고정 15 감소시킨다. SAN 감소는 HP 추가 피해가 아니다.",
              kind: "CONSUMABLE",
              actionCost: 1,
              chargeCost: 0,
              maxCharges: 0,
              reloadCreditCost: 0,
              reloadApproval: "GM",
              reloadable: false,
              requiresMounted: true,
              consumesRegularAmmo: 0,
              rangeMinCells: 0,
              rangeMaxCells: 4,
              usesWeaponAttack: true,
              additionalDamage: {
                type: "SOUND",
                amount: 15,
                ignoresDefense: true,
                scaling: "NONE",
              },
              consumableCost: {
                slug: "zulu-0028-censor-3",
                quantity: 1,
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
              diagonalFireRequiresMounted: true,
              mountedRangeShape: "DIAMOND",
              bonusDamage: 0,
            },
            weaponAttack: {
              weaponCategory: "rifle",
              rangeMinCells: 0,
              rangeMaxCells: 4,
              usesCharacterAttack: false,
              consumesRegularAmmo: 1,
              damageByRange: [
                {
                  minCells: 0,
                  maxCells: 0,
                  damage: {
                    type: "PHYSICAL",
                    amount: 7,
                    scaling: "NONE",
                  },
                },
                {
                  minCells: 1,
                  maxCells: 2,
                  damage: {
                    type: "PHYSICAL",
                    amount: 12,
                    scaling: "NONE",
                  },
                },
                {
                  minCells: 3,
                  maxCells: 4,
                  damage: {
                    type: "PHYSICAL",
                    amount: 12,
                    scaling: "NONE",
                  },
                },
              ],
            },
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
