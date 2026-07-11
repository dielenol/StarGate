import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findMainCharacterByOwnerCached as findMainCharacterByOwner } from "@/lib/db/characters";
import {
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import {
  listEquipmentResearchContributionRankings,
  listEquipmentResearchContributions,
  getEquipmentResearchCapabilities,
  listTeamFundingPools,
  listEquipmentResearchProjects,
  serializeEquipmentResearchContribution,
  serializeEquipmentResearchTeamFundingPool,
  serializeEquipmentResearchProject,
} from "@/lib/db/equipment-research";
import { listMasterItemsByCategoryFilter } from "@/lib/db/inventory";
import {
  hasOwnedTowaskiLicense,
  listOwnedTowaskiLicenseSlugs,
} from "@/lib/db/equipment-licenses";
import {
  applyEquipmentShopLicenseContext,
  EQUIPMENT_SHOP_CATEGORIES,
  type EquipmentShopZone,
  toEquipmentShopCatalogItem,
} from "@/lib/equipment-shop/catalog";
import type { EquipmentLicenseCharacter } from "@/lib/equipment-shop/licenses";
import { TOWASKI_BASIC_FIREARM_LICENSE_SLUG } from "@/lib/equipment-shop/license-test";
import {
  DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
  EQUIPMENT_RESEARCH_CAPS,
  EQUIPMENT_RESEARCH_NODES,
  EQUIPMENT_RESEARCH_RUSH_RULES,
  getComputedResearchStatus,
} from "@/lib/equipment-shop/research";

import type { CreditsResponse } from "@/hooks/queries/useCreditsQuery";
import type {
  EquipmentResearchOverviewResponse,
  EquipmentShopCatalogResponse,
} from "@/hooks/queries/useEquipmentShopQuery";

const INITIAL_LEDGER_LIMIT = 50;

interface MainCharacterStats {
  hp: number;
  san: number;
  def: number;
  atk: number;
}

export interface EquipmentShopPageData {
  initialCatalog: EquipmentShopCatalogResponse;
  initialResearch: EquipmentResearchOverviewResponse;
  mainCharacter: {
    id: string;
    codename: string;
    stats: MainCharacterStats;
    hasBasicFirearmLicense: boolean;
  } | null;
  initialBalance: number;
  initialCredits: CreditsResponse | undefined;
  mainCharacterError: string | null;
  isGM: boolean;
}

export async function buildEquipmentShopCatalogResponse(options: {
  zone?: EquipmentShopZone;
  character?: EquipmentLicenseCharacter | null;
  characterId?: string | null;
} = {}): Promise<EquipmentShopCatalogResponse> {
  const [masterItems, ownedLicenseSlugs] = await Promise.all([
    listMasterItemsByCategoryFilter(EQUIPMENT_SHOP_CATEGORIES),
    options.characterId
      ? listOwnedTowaskiLicenseSlugs(options.characterId)
      : Promise.resolve(new Set<string>()),
  ]);
  const catalogItems = masterItems
    .map(toEquipmentShopCatalogItem)
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .filter((item) => !options.zone || item.zone === options.zone);
  const items = applyEquipmentShopLicenseContext(catalogItems, {
    character: options.character ?? null,
    ownedLicenseSlugs,
  });

  return {
    items,
    isOpen: true,
    mode: "open",
    scheduledOpen: true,
    forceOpen: true,
    forceClosed: false,
  };
}

export async function buildEquipmentResearchOverviewResponse(
  mainCharacterId: string | null,
): Promise<EquipmentResearchOverviewResponse> {
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

  return {
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
  };
}

export async function loadEquipmentShopPageData(
  options: {
    requireGm?: boolean;
    includeResearch?: boolean;
    catalogZone?: EquipmentShopZone;
  } = {},
): Promise<EquipmentShopPageData> {
  const requireGm = options.requireGm ?? true;
  const includeResearch = options.includeResearch ?? true;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const isGM = hasRole(session.user.role, "GM");
  if (requireGm && !isGM) {
    redirect("/erp");
  }

  const userId = session.user.id;

  let mainCharacter: Awaited<
    ReturnType<typeof findMainCharacterByOwner>
  > | null = null;
  let mainCharacterError: string | null = null;
  try {
    mainCharacter = await findMainCharacterByOwner(userId);
  } catch (err) {
    console.error(
      `[equipment-shop] findMainCharacterByOwner integrity violation (userId=${userId}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainAgent = mainCharacter?.type === "AGENT" ? mainCharacter : null;
  const mainCharacterId = mainAgent ? String(mainAgent._id) : null;

  const [
    initialCatalog,
    initialResearch,
    initialBalance,
    initialLedger,
    hasBasicFirearmLicense,
  ] =
    await Promise.all([
      buildEquipmentShopCatalogResponse({
        zone: options.catalogZone,
        character: mainAgent,
        characterId: mainCharacterId,
      }).catch(
        (): EquipmentShopCatalogResponse => ({
          items: [],
          isOpen: true,
          mode: "open",
          scheduledOpen: true,
          forceOpen: true,
          forceClosed: false,
        }),
      ),
      includeResearch
        ? buildEquipmentResearchOverviewResponse(mainCharacterId).catch(
            (): EquipmentResearchOverviewResponse => ({
              tree: EQUIPMENT_RESEARCH_NODES,
              rushRules: Object.values(EQUIPMENT_RESEARCH_RUSH_RULES),
              caps: EQUIPMENT_RESEARCH_CAPS,
              capabilities: DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
              projects: [],
              fundingPools: [],
              recentContributions: [],
              contributionRankings: [],
            }),
          )
        : Promise.resolve<EquipmentResearchOverviewResponse>({
          tree: EQUIPMENT_RESEARCH_NODES,
          rushRules: Object.values(EQUIPMENT_RESEARCH_RUSH_RULES),
          caps: EQUIPMENT_RESEARCH_CAPS,
          capabilities: DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
          projects: [],
          fundingPools: [],
          recentContributions: [],
          contributionRankings: [],
        }),
      mainCharacterId
        ? getCharacterBalance(mainCharacterId).catch(() => 0)
        : Promise.resolve(0),
      mainCharacterId
        ? listCreditTransactions(mainCharacterId, INITIAL_LEDGER_LIMIT).catch(
            () => [],
          )
        : Promise.resolve([]),
      mainCharacterId
        ? hasOwnedTowaskiLicense(
            mainCharacterId,
            TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
          ).catch(() => false)
        : Promise.resolve(false),
    ]);

  const initialCredits: CreditsResponse | undefined =
    mainAgent && mainCharacterId
      ? {
          transactions: initialLedger.map((t) => ({
            ...t,
            _id: t._id?.toString() as unknown as typeof t._id,
          })),
          balance: initialBalance,
          characterId: mainCharacterId,
          characterCodename: mainAgent.codename,
        }
      : undefined;

  return {
    initialCatalog,
    initialResearch,
    mainCharacter: mainAgent
      ? {
          id: String(mainAgent._id),
          codename: mainAgent.codename,
          stats: {
            hp: mainAgent.play.hp,
            san: mainAgent.play.san,
            def: mainAgent.play.def,
            atk: mainAgent.play.atk,
          },
          hasBasicFirearmLicense,
        }
      : null,
    initialBalance,
    initialCredits,
    mainCharacterError,
    isGM,
  };
}
