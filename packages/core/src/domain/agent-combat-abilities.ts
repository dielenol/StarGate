/** GM 제공 원문을 기준으로 한 요원 전투 스킬 데이터. */

export const AGENT_COMBAT_ABILITY_SOURCE = {
  classification: "canon-from-source",
  providedBy: "GM",
  recordedAt: "2026-08-03",
} as const;

export const PARK_AESOL_FLAMETHROWER_ATTRIBUTES = [
  "fire",
  "cold",
  "acid",
] as const;

export type ParkAesolFlamethrowerAttribute =
  (typeof PARK_AESOL_FLAMETHROWER_ATTRIBUTES)[number];

export const PARK_AESOL_COMBAT_ABILITIES = {
  A1: {
    slot: "A1",
    code: "PARK_AESOL_A1_FIRE_SHOW",
    name: "불쇼",
    description: "양손에 화염 방사기를 장착합니다.",
    effect:
      "두 배로 증가하지만 탄환 소모도 두 배가 됩니다. 화상 피해의 N치도 10으로 증가합니다. 종료시까지 매 자신의 턴 SAN치 5를 소모합니다.",
    equippedFlamethrowerCount: 2,
    doubling: {
      multiplier: 2,
      target: "source-unspecified",
      requiresGmClarification: true,
    },
    ammoConsumptionMultiplier: 2,
    burnN: 10,
    upkeep: {
      resource: "san",
      amount: 5,
      timing: "each-own-turn",
    },
    duration: "until-ended",
  },
  A2: {
    slot: "A2",
    code: "PARK_AESOL_A2_MULTIPURPOSE_PROJECTOR",
    name: "다목적 방사기",
    description:
      "SAN치 10을 소모하여 화염방사기 하나의 속성을 \"화염, 냉기, 산성\" 중에 하나로 바꿀 수 있습니다.",
    activationCost: {
      resource: "san",
      amount: 10,
    },
    target: {
      equipment: "flamethrower",
      count: 1,
    },
    attributeChoices: PARK_AESOL_FLAMETHROWER_ATTRIBUTES,
  },
} as const;
