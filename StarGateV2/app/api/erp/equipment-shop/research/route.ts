import { NextResponse } from "next/server";

import { findMainCharacterLiteByOwner } from "@/lib/db/characters";
import {
  listEquipmentResearchContributionRankings,
  listEquipmentResearchContributions,
  getEquipmentResearchCapabilities,
  listEquipmentResearchProjects,
  listTeamFundingPools,
  serializeEquipmentResearchContribution,
  serializeEquipmentResearchTeamFundingPool,
  serializeEquipmentResearchProject,
} from "@/lib/db/equipment-research";
import {
  EQUIPMENT_RESEARCH_CAPS,
  EQUIPMENT_RESEARCH_NODES,
  EQUIPMENT_RESEARCH_RUSH_RULES,
  getComputedResearchStatus,
} from "@/lib/equipment-shop/research";

import { requireResearchAccess } from "./_lib";

export async function GET() {
  const authResult = await requireResearchAccess();
  if ("response" in authResult) return authResult.response;

  let mainCharacterId: string | null = null;
  try {
    const mainCharacter = await findMainCharacterLiteByOwner(
      authResult.session.id,
    );
    mainCharacterId = mainCharacter?._id ? String(mainCharacter._id) : null;
  } catch {
    mainCharacterId = null;
  }

  const [
    projects,
    capabilities,
    fundingPools,
    recentContributions,
    contributionRankings,
  ] = await Promise.all([
    listEquipmentResearchProjects(),
    getEquipmentResearchCapabilities(mainCharacterId),
    listTeamFundingPools(),
    listEquipmentResearchContributions(),
    listEquipmentResearchContributionRankings(),
  ]);
  const now = new Date();

  return NextResponse.json(
    {
      tree: EQUIPMENT_RESEARCH_NODES,
      rushRules: Object.values(EQUIPMENT_RESEARCH_RUSH_RULES),
      caps: EQUIPMENT_RESEARCH_CAPS,
      capabilities,
      projects: projects.map((project) => ({
        ...serializeEquipmentResearchProject(project),
        computedStatus: getComputedResearchStatus(project, now),
      })),
      fundingPools: fundingPools.map(serializeEquipmentResearchTeamFundingPool),
      recentContributions: recentContributions.map(
        serializeEquipmentResearchContribution,
      ),
      contributionRankings,
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
