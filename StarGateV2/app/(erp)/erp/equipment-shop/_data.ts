import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findMainCharacterByOwnerCached as findMainCharacterByOwner } from "@/lib/db/characters";
import {
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import {
  getEquipmentResearchCapabilities,
  listEquipmentResearchProjects,
  serializeEquipmentResearchProject,
} from "@/lib/db/equipment-research";
import { listMasterItemsByCategoryFilter } from "@/lib/db/inventory";
import {
  EQUIPMENT_SHOP_CATEGORIES,
  toEquipmentShopCatalogItem,
} from "@/lib/equipment-shop/catalog";
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
  } | null;
  initialBalance: number;
  initialCredits: CreditsResponse | undefined;
  mainCharacterError: string | null;
  isGM: boolean;
}

export async function buildEquipmentShopCatalogResponse(): Promise<EquipmentShopCatalogResponse> {
  const masterItems = await listMasterItemsByCategoryFilter(
    EQUIPMENT_SHOP_CATEGORIES,
  );
  const items = masterItems
    .map(toEquipmentShopCatalogItem)
    .filter((item): item is NonNullable<typeof item> => item !== null);

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
  const [projects, capabilities] = await Promise.all([
    listEquipmentResearchProjects(),
    getEquipmentResearchCapabilities(mainCharacterId),
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
  };
}

export async function loadEquipmentShopPageData(): Promise<EquipmentShopPageData> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!hasRole(session.user.role, "GM")) {
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

  const [initialCatalog, initialResearch, initialBalance, initialLedger] =
    await Promise.all([
      buildEquipmentShopCatalogResponse().catch(
        (): EquipmentShopCatalogResponse => ({
          items: [],
          isOpen: true,
          mode: "open",
          scheduledOpen: true,
          forceOpen: true,
          forceClosed: false,
        }),
      ),
      buildEquipmentResearchOverviewResponse(mainCharacterId).catch(
        (): EquipmentResearchOverviewResponse => ({
          tree: EQUIPMENT_RESEARCH_NODES,
          rushRules: Object.values(EQUIPMENT_RESEARCH_RUSH_RULES),
          caps: EQUIPMENT_RESEARCH_CAPS,
          capabilities: DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
          projects: [],
        }),
      ),
      mainCharacterId
        ? getCharacterBalance(mainCharacterId).catch(() => 0)
        : Promise.resolve(0),
      mainCharacterId
        ? listCreditTransactions(mainCharacterId, INITIAL_LEDGER_LIMIT).catch(
            () => [],
          )
        : Promise.resolve([]),
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
        }
      : null,
    initialBalance,
    initialCredits,
    mainCharacterError,
    isGM: true,
  };
}
