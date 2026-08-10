import {
  DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
  EQUIPMENT_RESEARCH_CAPS,
  EQUIPMENT_RESEARCH_NODES,
  EQUIPMENT_RESEARCH_RUSH_RULES,
} from "./research.ts";
import type { EquipmentResearchOverviewResponse } from "@/hooks/queries/useEquipmentShopQuery";

/** 게스트에게는 연구 구조만 보여 주고 사용자·요청·DB 식별자가 있는 원장은 비운다. */
export function buildGuestEquipmentResearchOverviewResponse(): EquipmentResearchOverviewResponse {
  return {
    tree: EQUIPMENT_RESEARCH_NODES,
    rushRules: Object.values(EQUIPMENT_RESEARCH_RUSH_RULES),
    caps: EQUIPMENT_RESEARCH_CAPS,
    capabilities: DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
    projects: [],
    fundingPools: [],
    recentContributions: [],
    contributionRankings: [],
  };
}
