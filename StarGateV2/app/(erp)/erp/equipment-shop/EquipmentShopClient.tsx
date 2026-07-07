"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type MouseEvent, useMemo, useState } from "react";

import {
  type CreditsResponse,
  useCredits,
} from "@/hooks/queries/useCreditsQuery";
import {
  type EquipmentResearchScope,
  type EquipmentResearchStat,
  useCompleteEquipmentResearch,
  useContributeEquipmentResearch,
  useCheckoutEquipmentShopCart,
  useRushEquipmentResearch,
  useStartEquipmentResearch,
} from "@/hooks/mutations/useEquipmentShopMutation";
import {
  EquipmentShopApiError,
  type EquipmentShopCatalogEntry,
  type EquipmentShopCatalogResponse,
  type EquipmentShopErrorCode,
  type EquipmentResearchOverviewResponse,
  type EquipmentResearchProjectEntry,
  useEquipmentShopCatalog,
  useEquipmentResearch,
} from "@/hooks/queries/useEquipmentShopQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import { describeApiError } from "@/lib/api/describe-error";
import { formatCredits } from "@/lib/format/credit";
import {
  DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
  describeEquipmentResearchEffect,
  getEquipmentResearchPrerequisiteTier,
  quoteEquipmentResearchRush,
  quoteEquipmentResearchStart,
  scopeLabel,
} from "@/lib/equipment-shop/research";

import ShopItemIcon from "../shop/ShopItemIcon";

import styles from "./page.module.css";

type ArmoryZone = "lab" | "towaski" | "acheron" | "strategic" | "custom";
type ArmoryDestination = ArmoryZone | "simulator";
type EquipmentShopMode = "hub" | "zone";
type EquipmentShopTabValue = "ALL" | "WEAPON" | "ARMOR";
type CartState = Record<string, number>;
type NoticeState = { tone: "success" | "info"; text: string } | null;
type MainCharacterStats = Record<EquipmentResearchStat, number>;
type ArmoryZoneDef = {
  value: ArmoryDestination;
  href: string;
  label: string;
  eyebrow: string;
  description: string;
  npc: string;
};

const MAX_CART_QUANTITY_PER_ITEM = 1;
const TOWASKI_PROFILE_SRC = "/assets/shop/hud/tia-profile.webp";
const TOWASKI_PORTRAIT_SRC = "/assets/shop/hud/tia-welcome.png";

const ARMORY_DESK_META: Pick<
  ArmoryZoneDef,
  "label" | "eyebrow" | "npc"
> = {
  label: "병기부 통합 관제실",
  eyebrow: "ARMORY BUREAU",
  npc: "병기부 관제 담당관",
};

const ZONE_DEFS: ArmoryZoneDef[] = [
  {
    value: "lab",
    href: "/erp/equipment-shop/lab",
    label: "신체증강 연구소",
    eyebrow: "RESEARCH LAB",
    description: "개인 강화와 전체 AGENT 팀 강화를 실제 스탯에 반영합니다.",
    npc: "연구 담당관",
  },
  {
    value: "towaski",
    href: "/erp/equipment-shop/towaski",
    label: "토와스키 건샵",
    eyebrow: "TOWASKI",
    description: "무기와 방어구를 구매해 인벤토리에 반출합니다.",
    npc: "립 토와스키",
  },
  {
    value: "acheron",
    href: "/erp/equipment-shop/acheron",
    label: "아케론 대장간",
    eyebrow: "ACHERON FORGE",
    description: "근접무기와 냉병기류를 구매해 인벤토리에 반출합니다.",
    npc: "단조 담당관",
  },
  {
    value: "strategic",
    href: "/erp/equipment-shop/strategic",
    label: "전략 장비 보급소",
    eyebrow: "STRATEGIC ASSETS",
    description: "차량, 전략 자산, 전투 보조품을 구매합니다.",
    npc: "전략 자산 담당관",
  },
  {
    value: "custom",
    href: "/erp/equipment-shop/custom",
    label: "공방",
    eyebrow: "CUSTOM WORKSHOP",
    description: "공방 상담 구역입니다. 전용무기 제작 요청 저장은 후속 단계에서 연결합니다.",
    npc: "제작 담당관",
  },
  {
    value: "simulator",
    href: "/erp/equipment-shop/simulator",
    label: "훈련장",
    eyebrow: "TEST RANGE",
    description: "보급형 장비의 사거리와 탄환 운용을 시험합니다.",
    npc: "시험장 담당관",
  },
];

const TAB_DEFS: { value: EquipmentShopTabValue; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "WEAPON", label: "무기" },
  { value: "ARMOR", label: "방어구" },
];

const CATEGORY_LABELS: Record<EquipmentShopCatalogEntry["category"], string> = {
  WEAPON: "WEAPON",
  ARMOR: "ARMOR",
  SPECIAL: "STRATEGIC",
};

const STAT_DEFS: Array<{
  value: EquipmentResearchStat;
  label: string;
  hint: string;
}> = [
  { value: "hp", label: "HP", hint: "체력" },
  { value: "san", label: "SAN", hint: "정신력" },
  { value: "def", label: "DEF", hint: "방어력" },
  { value: "atk", label: "ATK", hint: "공격력" },
];

const ERROR_MESSAGE: Record<EquipmentShopErrorCode, string> = {
  INSUFFICIENT_BALANCE: "잔액이 부족합니다.",
  NO_MAIN_CHARACTER: "메인 AGENT 캐릭터가 등록되지 않았습니다.",
  MAIN_CHARACTER_INTEGRITY:
    "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의하세요.",
  NO_AGENT_TARGETS: "강화를 적용할 AGENT 캐릭터가 없습니다.",
  INVENTORY_FAILED_REFUNDED:
    "구매에 실패했습니다. 차감된 잔액은 자동 환불되었습니다.",
  REFUND_FAILED:
    "구매 실패 + 자동 환불 실패. 운영자(GM)에게 문의해 잔액 정정을 요청하세요.",
  INVALID_CART: "장비 장바구니 구성이 올바르지 않습니다.",
  INVALID_RESEARCH: "연구 적용값이 올바르지 않습니다.",
  ITEM_NOT_AVAILABLE: "판매 가능한 병기부 카탈로그 품목이 아닙니다.",
  PRICE_NOT_SET: "가격이 확정되지 않은 장비는 구매할 수 없습니다.",
  RESEARCH_CAP_REACHED: "연구 누적 상한에 도달했습니다.",
  RESEARCH_PREREQUISITE_MISSING:
    "같은 범위의 이전 티어 연구를 먼저 적용해야 합니다.",
  RESEARCH_NOT_READY: "아직 완료되지 않은 연구입니다.",
  RUSH_LIMIT_REACHED: "더 이상 연구 시간을 단축할 수 없습니다.",
  TEAM_RESEARCH_REQUIRES_CONTRIBUTION:
    "팀 연구는 기여 누적을 통해서만 시작할 수 있습니다.",
  RESEARCH_ALREADY_STARTED: "이미 시작되었거나 적용된 연구입니다.",
  RESEARCH_FUNDING_CONFLICT:
    "동시에 다른 기여가 처리되었습니다. 다시 시도해 주세요.",
  RESEARCH_START_FAILED: "연구 시작 처리에 실패했습니다.",
  FORBIDDEN_RESEARCH_PROJECT: "이 연구를 조작할 권한이 없습니다.",
};

interface Props {
  mode: EquipmentShopMode;
  initialZone?: ArmoryZone;
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

type ResearchNodeEntry = EquipmentResearchOverviewResponse["tree"][number];
type ResearchNodeMapStatus =
  | EquipmentResearchProjectEntry["computedStatus"]
  | "available";

const RESEARCH_TIER_LABELS: Record<number, string> = {
  1: "기초 실험",
  2: "개인 안정화",
  3: "실전 프로토콜",
  4: "고급 병기 연구",
  5: "시즌급 최종 연구",
};

const RESEARCH_TIER_FEEL: Record<number, string> = {
  1: "미세 보정",
  2: "소폭 성장",
  3: "확실한 성장",
  4: "대형 해금",
  5: "피날레 보상",
};

const RESEARCH_BRANCH_ORDER = [
  "bio",
  "psy",
  "mun",
  "log",
  "lab",
  "trn",
  "cnt",
  "cst",
  "aeg",
  "pts",
] as const;

const RESEARCH_BRANCH_META: Record<string, { label: string; code: string }> = {
  bio: { label: "생체", code: "BIO" },
  psy: { label: "정신", code: "PSY" },
  mun: { label: "화력", code: "MUN" },
  log: { label: "보급 정산", code: "LOG" },
  lab: { label: "연구 운영", code: "LAB" },
  trn: { label: "훈련", code: "TRN" },
  cnt: { label: "개체 대응", code: "CNT" },
  cst: { label: "제작", code: "CST" },
  aeg: { label: "방호", code: "AEG" },
  pts: { label: "성장 배정", code: "PTS" },
};

function describeEquipmentShopError(err: unknown): string {
  return describeApiError(err, EquipmentShopApiError, ERROR_MESSAGE);
}

function activeZoneMeta(zone: ArmoryZone) {
  return ZONE_DEFS.find((item) => item.value === zone) ?? ZONE_DEFS[0];
}

function renderCatalogIcon(item: EquipmentShopCatalogEntry, size: number) {
  if (item.previewImage) {
    return (
      <Image
        src={item.previewImage}
        width={size}
        height={size}
        alt=""
        aria-hidden
        draggable={false}
        unoptimized
      />
    );
  }

  return <ShopItemIcon slug={item.slug ?? item.key} size={size} />;
}

function getResearchBranchRank(branch: string): number {
  const index = (RESEARCH_BRANCH_ORDER as readonly string[]).indexOf(branch);
  return index >= 0 ? index : RESEARCH_BRANCH_ORDER.length;
}

function getResearchBranchMeta(branch: string): { label: string; code: string } {
  return (
    RESEARCH_BRANCH_META[branch] ?? {
      label: branch.toUpperCase(),
      code: branch.toUpperCase(),
    }
  );
}

function getResearchNodeMapStatus(
  projects: EquipmentResearchProjectEntry[],
  key: string,
  scope: EquipmentResearchScope,
): ResearchNodeMapStatus {
  const related = projects.filter(
    (project) => project.key === key && project.scope === scope,
  );
  if (related.some((project) => project.computedStatus === "completed")) {
    return "completed";
  }
  if (related.some((project) => project.computedStatus === "applying")) {
    return "applying";
  }
  if (related.some((project) => project.computedStatus === "in_progress")) {
    return "in_progress";
  }
  if (related.some((project) => project.computedStatus === "applied")) {
    return "applied";
  }
  return "available";
}

function researchNodeMapStatusLabel(status: ResearchNodeMapStatus): string {
  if (status === "completed") return "완료 대기";
  if (status === "applied") return "적용됨";
  if (status === "applying") return "적용 중";
  if (status === "in_progress") return "진행 중";
  return "연구 가능";
}

function researchNodeClassName(
  status: ResearchNodeMapStatus,
  isSelected: boolean,
  isLocked: boolean,
): string {
  const classes = [styles.techNode];
  if (isLocked) classes.push(styles["techNode--locked"]);
  if (status === "completed") classes.push(styles["techNode--completed"]);
  if (status === "applied") classes.push(styles["techNode--applied"]);
  if (status === "applying" || status === "in_progress") {
    classes.push(styles["techNode--active"]);
  }
  if (isSelected) classes.push(styles["techNode--selected"]);
  return classes.join(" ");
}

function getFirstResearchKeyForScope(
  tree: EquipmentResearchOverviewResponse["tree"],
  scope: EquipmentResearchScope,
): string {
  return tree.find((node) => node.allowedScopes.includes(scope))?.key ?? "";
}

function isResearchNodeUnlocked(args: {
  node: ResearchNodeEntry;
  projects: EquipmentResearchProjectEntry[];
  scope: EquipmentResearchScope;
  targetCharacterId: string | null;
}): boolean {
  const requiredTier = getEquipmentResearchPrerequisiteTier(args.node.tier);
  const hasAppliedProject = (project: EquipmentResearchProjectEntry) => {
    if (project.scope !== args.scope) return false;
    if (project.computedStatus !== "applied") return false;
    if (args.scope === "team") return true;
    return args.targetCharacterId
      ? project.targetCharacterIds.includes(args.targetCharacterId)
      : false;
  };
  const hasRequiredTier =
    !requiredTier ||
    args.projects.some(
      (project) => project.tier === requiredTier && hasAppliedProject(project),
    );
  const hasRequiredNodes = (args.node.prerequisiteKeys ?? []).every((key) =>
    args.projects.some(
      (project) => project.key === key && hasAppliedProject(project),
    ),
  );
  return hasRequiredTier && hasRequiredNodes;
}

function researchNodeLockLabel(node: ResearchNodeEntry): string | null {
  const requiredTier = getEquipmentResearchPrerequisiteTier(node.tier);
  const labels = [
    requiredTier ? `T${requiredTier} 필요` : "",
    ...(node.prerequisiteKeys ?? []).map((key) => `${key} 필요`),
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(" · ") : null;
}

function ResearchPixelIcon({
  node,
  active,
}: {
  node: ResearchNodeEntry;
  active: boolean;
}) {
  function renderGlyph() {
    switch (node.branch) {
      case "bio":
        return (
          <>
            <rect x="10" y="5" width="4" height="14" />
            <rect x="5" y="10" width="14" height="4" />
            <rect x="6" y="6" width="2" height="2" />
            <rect x="16" y="16" width="2" height="2" />
          </>
        );
      case "psy":
        return (
          <>
            <rect x="8" y="5" width="8" height="8" />
            <rect x="7" y="13" width="10" height="4" />
            <rect x="10" y="17" width="4" height="2" />
            <rect x="18" y="6" width="2" height="2" />
            <rect x="20" y="8" width="2" height="2" />
          </>
        );
      case "mun":
        return (
          <>
            <rect x="11" y="4" width="2" height="16" />
            <rect x="4" y="11" width="16" height="2" />
            <rect x="8" y="8" width="2" height="2" />
            <rect x="14" y="8" width="2" height="2" />
            <rect x="8" y="14" width="2" height="2" />
            <rect x="14" y="14" width="2" height="2" />
          </>
        );
      case "log":
        return (
          <>
            <rect x="6" y="7" width="12" height="3" />
            <rect x="5" y="10" width="14" height="7" />
            <rect x="8" y="12" width="3" height="3" />
            <rect x="13" y="12" width="3" height="3" />
            <rect x="9" y="18" width="6" height="2" />
          </>
        );
      case "lab":
        return (
          <>
            <rect x="9" y="4" width="6" height="3" />
            <rect x="10" y="7" width="4" height="5" />
            <rect x="7" y="12" width="10" height="7" />
            <rect x="9" y="14" width="6" height="2" />
            <rect x="18" y="15" width="2" height="2" />
          </>
        );
      case "trn":
        return (
          <>
            <rect x="6" y="6" width="12" height="4" />
            <rect x="8" y="10" width="8" height="8" />
            <rect x="10" y="12" width="4" height="2" />
            <rect x="6" y="18" width="4" height="2" />
            <rect x="14" y="18" width="4" height="2" />
          </>
        );
      case "cnt":
        return (
          <>
            <rect x="6" y="5" width="12" height="4" />
            <rect x="7" y="9" width="10" height="6" />
            <rect x="9" y="15" width="6" height="3" />
            <rect x="11" y="18" width="2" height="2" />
            <rect x="11" y="10" width="2" height="4" />
          </>
        );
      case "cst":
        return (
          <>
            <rect x="6" y="6" width="5" height="3" />
            <rect x="10" y="9" width="4" height="4" />
            <rect x="13" y="13" width="5" height="3" />
            <rect x="5" y="15" width="4" height="4" />
            <rect x="16" y="5" width="3" height="5" />
          </>
        );
      case "aeg":
        return (
          <>
            <rect x="6" y="5" width="12" height="3" />
            <rect x="5" y="8" width="14" height="5" />
            <rect x="7" y="13" width="10" height="4" />
            <rect x="10" y="17" width="4" height="3" />
            <rect x="11" y="9" width="2" height="6" />
          </>
        );
      case "pts":
        return (
          <>
            <rect x="11" y="4" width="2" height="4" />
            <rect x="8" y="8" width="8" height="2" />
            <rect x="5" y="10" width="14" height="3" />
            <rect x="8" y="13" width="8" height="2" />
            <rect x="7" y="15" width="3" height="4" />
            <rect x="14" y="15" width="3" height="4" />
          </>
        );
      default:
        return <rect x="7" y="7" width="10" height="10" />;
    }
  }

  function renderTierMark() {
    switch (node.tier) {
      case 2:
        return (
          <>
            <rect x="4" y="4" width="4" height="2" />
            <rect x="16" y="18" width="4" height="2" />
          </>
        );
      case 3:
        return (
          <>
            <rect x="4" y="4" width="3" height="3" />
            <rect x="17" y="4" width="3" height="3" />
            <rect x="4" y="17" width="3" height="3" />
            <rect x="17" y="17" width="3" height="3" />
          </>
        );
      case 4:
        return (
          <>
            <rect x="3" y="11" width="3" height="2" />
            <rect x="18" y="11" width="3" height="2" />
            <rect x="11" y="3" width="2" height="3" />
            <rect x="11" y="18" width="2" height="3" />
          </>
        );
      case 5:
        return (
          <>
            <rect x="7" y="3" width="2" height="3" />
            <rect x="11" y="2" width="2" height="4" />
            <rect x="15" y="3" width="2" height="3" />
            <rect x="7" y="6" width="10" height="2" />
            <rect x="5" y="19" width="14" height="2" />
          </>
        );
      default:
        return <rect x="11" y="20" width="2" height="1" />;
    }
  }

  return (
    <svg
      className={[
        styles.researchPixelIcon,
        styles[`researchPixelIcon--tier${node.tier}`],
        active ? styles["researchPixelIcon--active"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
      viewBox="0 0 24 24"
      aria-hidden
      shapeRendering="crispEdges"
      focusable="false"
    >
      <rect x="1" y="1" width="22" height="22" className={styles.iconFrame} />
      <rect x="3" y="3" width="18" height="18" className={styles.iconPlate} />
      <g className={styles.iconGlyph}>{renderGlyph()}</g>
      <g className={styles.iconTierMark}>{renderTierMark()}</g>
    </svg>
  );
}

export default function EquipmentShopClient({
  mode,
  initialZone = "lab",
  initialCatalog,
  initialResearch,
  mainCharacter,
  initialBalance,
  initialCredits,
  mainCharacterError,
  isGM,
}: Props) {
  const router = useRouter();
  const catalogQuery = useEquipmentShopCatalog({ initialData: initialCatalog });
  const researchQuery = useEquipmentResearch({ initialData: initialResearch });
  const creditsQuery = useCredits({ initialData: initialCredits });
  const checkoutMutation = useCheckoutEquipmentShopCart();
  const startResearchMutation = useStartEquipmentResearch();
  const rushResearchMutation = useRushEquipmentResearch();
  const contributeResearchMutation = useContributeEquipmentResearch();
  const completeResearchMutation = useCompleteEquipmentResearch();

  const [activeTab, setActiveTab] = useState<EquipmentShopTabValue>("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState>({});
  const [localStats, setLocalStats] = useState<MainCharacterStats | null>(
    () => mainCharacter?.stats ?? null,
  );
  const [activeResearchScope, setActiveResearchScope] =
    useState<EquipmentResearchScope>("personal");
  const [selectedResearchKeys, setSelectedResearchKeys] = useState<
    Record<EquipmentResearchScope, string>
  >(() => ({
    personal: getFirstResearchKeyForScope(initialResearch.tree, "personal"),
    team: getFirstResearchKeyForScope(initialResearch.tree, "team"),
  }));
  const [teamContributionAmount, setTeamContributionAmount] = useState("100");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const catalog = catalogQuery.data ?? initialCatalog;
  const research = researchQuery.data ?? initialResearch;
  const researchTree = research.tree;
  const researchProjects = research.projects;
  const selectedResearchKey = selectedResearchKeys[activeResearchScope];
  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const isHub = mode === "hub";
  const activeZone = initialZone;
  const activeZoneDef = activeZoneMeta(activeZone);
  const zoneMeta = isHub ? ARMORY_DESK_META : activeZoneDef;

  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const catalogByKey = useMemo(() => {
    const map = new Map<string, EquipmentShopCatalogEntry>();
    for (const item of catalog.items) map.set(item.key, item);
    return map;
  }, [catalog.items]);

  const towaskiItems = useMemo(() => {
    if (activeTab === "ALL") {
      return catalog.items.filter((item) => item.zone === "towaski");
    }
    return catalog.items.filter(
      (item) => item.zone === "towaski" && item.category === activeTab,
    );
  }, [activeTab, catalog.items]);

  const acheronItems = useMemo(() => {
    if (activeTab === "ALL") {
      return catalog.items.filter((item) => item.zone === "acheron");
    }
    return catalog.items.filter(
      (item) => item.zone === "acheron" && item.category === activeTab,
    );
  }, [activeTab, catalog.items]);

  const strategicItems = useMemo(
    () => catalog.items.filter((item) => item.zone === "strategic"),
    [catalog.items],
  );

  const towaskiItemCount = useMemo(
    () => catalog.items.filter((item) => item.zone === "towaski").length,
    [catalog.items],
  );
  const acheronItemCount = useMemo(
    () => catalog.items.filter((item) => item.zone === "acheron").length,
    [catalog.items],
  );
  const strategicItemCount = strategicItems.length;
  const salesItems =
    activeZone === "strategic"
      ? strategicItems
      : activeZone === "acheron"
        ? acheronItems
        : towaskiItems;

  const selectedItem = useMemo(() => {
    const selectedInZone = selectedKey
      ? salesItems.find((item) => item.key === selectedKey)
      : undefined;
    return selectedInZone ?? salesItems[0] ?? null;
  }, [salesItems, selectedKey]);

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .map(([key, quantity]) => {
        const item = catalogByKey.get(key);
        if (!item || quantity <= 0) return null;
        const safeQuantity = Math.min(quantity, MAX_CART_QUANTITY_PER_ITEM);
        return {
          item,
          quantity: safeQuantity,
          total: item.price * safeQuantity,
          stockIssue: item.stock < safeQuantity || item.stock <= 0,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);
  }, [cart, catalogByKey]);

  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.total, 0);
  const cartHasStockIssue = cartLines.some((line) => line.stockIssue);
  const cartOverBalance = cartTotal > balance;
  const canUseShop = isGM && hasMainCharacter && catalog.isOpen;
  const canCheckout =
    canUseShop &&
    cartLines.length > 0 &&
    !cartHasStockIssue &&
    !cartOverBalance &&
    !checkoutMutation.isPending;

  const selectedQuantity = selectedItem ? cart[selectedItem.key] ?? 0 : 0;
  const selectedCanAdd =
    Boolean(selectedItem) &&
    canUseShop &&
    selectedItem?.available === true &&
    selectedItem.stock > 0 &&
    selectedQuantity < selectedItem.stock &&
    selectedQuantity < MAX_CART_QUANTITY_PER_ITEM;

  const scopedResearchTree = useMemo(
    () =>
      researchTree.filter((node) =>
        node.allowedScopes.includes(activeResearchScope),
      ),
    [activeResearchScope, researchTree],
  );

  const researchTrackLayout = useMemo(() => {
    const branches = new Map<string, ResearchNodeEntry[]>();
    for (const node of scopedResearchTree) {
      const bucket = branches.get(node.branch);
      if (bucket) bucket.push(node);
      else branches.set(node.branch, [node]);
    }

    const rows = Array.from(branches.entries())
      .sort(([branchA], [branchB]) => {
        const rankDiff =
          getResearchBranchRank(branchA) - getResearchBranchRank(branchB);
        return rankDiff !== 0 ? rankDiff : branchA.localeCompare(branchB);
      })
      .map(([branch, nodes]) => ({
        branch,
        meta: getResearchBranchMeta(branch),
        nodes,
      }));

    const tierWidths = new Map<number, number>();
    for (const row of rows) {
      const tierCounts = new Map<number, number>();
      for (const node of row.nodes) {
        tierCounts.set(node.tier, (tierCounts.get(node.tier) ?? 0) + 1);
      }
      for (const [tier, count] of tierCounts) {
        tierWidths.set(tier, Math.max(tierWidths.get(tier) ?? 0, count));
      }
    }

    const tierSegments: Array<{
      tier: number;
      startColumn: number;
      span: number;
    }> = [];
    const tierStartColumns = new Map<number, number>();
    let nextColumn = 1;
    for (const tier of Array.from(tierWidths.keys()).sort((a, b) => a - b)) {
      const span = Math.max(1, tierWidths.get(tier) ?? 1);
      tierSegments.push({ tier, startColumn: nextColumn, span });
      tierStartColumns.set(tier, nextColumn);
      nextColumn += span;
    }

    const rowsWithColumns = rows.map((row) => {
      const tierIndexes = new Map<number, number>();
      const nodes = row.nodes.map((node) => {
        const indexInTier = tierIndexes.get(node.tier) ?? 0;
        tierIndexes.set(node.tier, indexInTier + 1);
        return {
          node,
          column: (tierStartColumns.get(node.tier) ?? 1) + indexInTier,
        };
      });
      return {
        ...row,
        lastColumn: Math.max(...nodes.map(({ column }) => column), 1),
        nodes,
      };
    });

    return {
      columnCount: Math.max(1, nextColumn - 1),
      rows: rowsWithColumns,
      tiers: tierSegments,
    };
  }, [scopedResearchTree]);

  const activeResearchProjects = useMemo(
    () =>
      researchProjects.filter(
        (project) =>
          project.scope === activeResearchScope &&
          project.computedStatus !== "applied",
      ),
    [activeResearchScope, researchProjects],
  );

  const appliedResearchProjects = useMemo(
    () =>
      researchProjects.filter(
        (project) =>
          project.scope === activeResearchScope &&
          project.computedStatus === "applied",
      ),
    [activeResearchScope, researchProjects],
  );

  const selectedResearchNode = useMemo(() => {
    return (
      scopedResearchTree.find((node) => node.key === selectedResearchKey) ??
      scopedResearchTree[0] ??
      null
    );
  }, [scopedResearchTree, selectedResearchKey]);

  const selectedNodeProjects = useMemo(() => {
    if (!selectedResearchNode) return [];
    return researchProjects.filter(
      (project) =>
        project.key === selectedResearchNode.key &&
        project.scope === activeResearchScope,
    );
  }, [activeResearchScope, researchProjects, selectedResearchNode]);

  function setCartQuantity(key: string, quantity: number) {
    const item = catalogByKey.get(key);
    const max = item ? Math.min(item.stock, MAX_CART_QUANTITY_PER_ITEM) : 0;
    setCart((prev) => {
      const next = { ...prev };
      if (!item || max <= 0 || quantity <= 0) {
        delete next[key];
        return next;
      }
      next[key] = Math.min(max, Math.floor(quantity));
      return next;
    });
  }

  function handleAddToCart(item: EquipmentShopCatalogEntry, quantity = 1) {
    if (!canUseShop) {
      setErrorMessage(
        hasMainCharacter
          ? "GM preview 상태에서만 병기부 구매를 실행할 수 있습니다."
          : "메인 AGENT 캐릭터가 없어 구매할 수 없습니다.",
      );
      return;
    }

    if (item.stock <= 0 || !item.available) {
      setErrorMessage("현재 반출할 수 없는 품목입니다.");
      return;
    }

    setSelectedKey(item.key);
    setErrorMessage(null);
    setNotice(null);
    setCartQuantity(item.key, (cart[item.key] ?? 0) + quantity);
  }

  function handleRemoveFromCart(key: string) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleCheckout() {
    if (!canCheckout) return;
    setErrorMessage(null);
    setNotice(null);
    checkoutMutation.mutate(
      {
        items: cartLines.map((line) => ({
          key: line.item.key,
          quantity: line.quantity,
        })),
      },
      {
        onSuccess: (res) => {
          setCart({});
          setNotice({
            tone: "success",
            text: `${res.order.items.length}종 반출 결제가 완료되었습니다.`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function formatDuration(hours: number): string {
    if (hours % 24 === 0) return `${hours / 24}일`;
    if (hours > 24) return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
    return `${hours}시간`;
  }

  function formatDateTime(value: string): string {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function projectStatusLabel(
    status: EquipmentResearchProjectEntry["computedStatus"],
  ): string {
    if (status === "completed") return "완료 대기";
    if (status === "applied") return "적용됨";
    if (status === "applying") return "적용 중";
    return "진행 중";
  }

  function canStartResearch(scope: EquipmentResearchScope, cost: number): boolean {
    return (
      scope === "personal" &&
      hasMainCharacter &&
      balance >= cost &&
      !startResearchMutation.isPending
    );
  }

  function handleResearchScopeChange(scope: EquipmentResearchScope) {
    setActiveResearchScope(scope);
    setSelectedResearchKeys((prev) => ({
      ...prev,
      [scope]:
        prev[scope] ||
        getFirstResearchKeyForScope(research.tree, scope),
    }));
  }

  function handleSelectResearchNode(key: string) {
    setSelectedResearchKeys((prev) => ({
      ...prev,
      [activeResearchScope]: key,
    }));
  }

  function handleStartResearch(key: string, scope: EquipmentResearchScope) {
    const node = research.tree.find((item) => item.key === key);
    const startQuote = node
      ? quoteEquipmentResearchStart({
          node,
          capabilities: research.capabilities,
        })
      : null;
    if (
      !node ||
      !node.allowedScopes.includes(scope) ||
      !startQuote ||
      !canStartResearch(scope, startQuote.cost)
    ) {
      return;
    }
    setErrorMessage(null);
    setNotice(null);
    startResearchMutation.mutate(
      {
        key,
        scope,
        ...(mainCharacter ? { targetCharacterId: mainCharacter.id } : {}),
      },
      {
        onSuccess: (res) => {
          setNotice({
            tone: "success",
            text: `${res.project.key} 연구를 시작했습니다.`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function handleContributeTeamResearch(key: string, remainingCost: number) {
    if (contributeResearchMutation.isPending) return;
    const requestedAmount = Math.floor(Number(teamContributionAmount));
    const chargePreview = Math.min(requestedAmount, remainingCost);
    if (
      !Number.isInteger(requestedAmount) ||
      requestedAmount <= 0 ||
      chargePreview <= 0
    ) {
      setErrorMessage("기여 금액은 1 CR 이상이어야 합니다.");
      return;
    }
    if (!hasMainCharacter) {
      setErrorMessage("메인 AGENT 캐릭터가 없어 팀 연구에 기여할 수 없습니다.");
      return;
    }
    if (balance < chargePreview) {
      setErrorMessage("잔액이 부족합니다.");
      return;
    }

    setErrorMessage(null);
    setNotice(null);
    contributeResearchMutation.mutate(
      {
        key,
        amount: requestedAmount,
      },
      {
        onSuccess: (res) => {
          setNotice({
            tone: "success",
            text: res.project
              ? `${res.project.key} 팀 연구 목표액이 충족되어 연구를 시작했습니다.`
              : `${res.pool.key} 팀 연구에 ${formatCredits(res.chargedAmount)} 기여했습니다.`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function handleRushResearch(projectId: string) {
    if (rushResearchMutation.isPending) return;
    setErrorMessage(null);
    setNotice(null);
    rushResearchMutation.mutate(
      { projectId },
      {
        onSuccess: (res) => {
          setNotice({
            tone: "success",
            text:
              `연구 시간을 ${formatDuration(res.rush.hours)} 단축했습니다.` +
              `${res.rush.discountApplied ? " (할인 적용)" : ""}`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function handleCompleteResearch(project: EquipmentResearchProjectEntry) {
    if (completeResearchMutation.isPending) return;
    setErrorMessage(null);
    setNotice(null);
    completeResearchMutation.mutate(
      { projectId: project.id },
      {
        onSuccess: (res) => {
          if (mainCharacter && res.effect.kind === "stat") {
            const appliedStat = res.effect.stat;
            const ownResult = res.targets.find(
              (target) => target.id === mainCharacter.id,
            );
            if (ownResult) {
              setLocalStats((prev) =>
                prev ? { ...prev, [appliedStat]: ownResult.after } : prev,
              );
            }
          }
          setNotice({
            tone: "success",
            text:
              `${res.key} 연구 효과를 적용했습니다.` +
              `${res.skipped.length > 0 ? ` (${res.skipped.length}명 제외)` : ""}`,
          });
        },
        onError: (err) => {
          setErrorMessage(describeEquipmentShopError(err));
        },
      },
    );
  }

  function handleZoneLinkClick(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (
      event.button !== 0 ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    router.push(href);
  }

  function renderHubPanel() {
    const totalCatalogItemCount =
      towaskiItemCount + acheronItemCount + strategicItemCount;
    const availableCatalogItemCount = catalog.items.filter(
      (item) => item.available && item.stock > 0,
    ).length;
    const availableStockCount = catalog.items.reduce(
      (sum, item) => sum + (item.available ? item.stock : 0),
      0,
    );
    const activeProjectCount = researchProjects.filter(
      (project) => project.computedStatus !== "applied",
    ).length;
    const readyProjectCount = researchProjects.filter(
      (project) => project.computedStatus === "completed",
    ).length;
    const appliedProjectCount = researchProjects.filter(
      (project) => project.computedStatus === "applied",
    ).length;
    const personalResearchCount = research.tree.filter((node) =>
      node.allowedScopes.includes("personal"),
    ).length;
    const teamResearchCount = research.tree.filter((node) =>
      node.allowedScopes.includes("team"),
    ).length;

    const commandStats = [
      {
        key: "catalog",
        label: "반출 카탈로그",
        value: `${totalCatalogItemCount}종`,
        detail: `가용 ${availableCatalogItemCount}종 · 재고 ${availableStockCount}EA`,
        warning: false,
      },
      {
        key: "research",
        label: "연구 트리",
        value: `${personalResearchCount + teamResearchCount}노드`,
        detail: `개인 ${personalResearchCount} · 팀 ${teamResearchCount}`,
        warning: false,
      },
      {
        key: "projects",
        label: "진행 큐",
        value: `${activeProjectCount}건`,
        detail: `완료 대기 ${readyProjectCount} · 적용 ${appliedProjectCount}`,
        warning: false,
      },
      {
        key: "agent",
        label: "운영 대상",
        value: mainCharacter?.codename ?? "UNASSIGNED",
        detail: hasMainCharacter
          ? `${formatCredits(balance)} 운용 가능`
          : "개인 연구/구매 제한",
        warning: !hasMainCharacter,
      },
    ];

    const operationCards = [
      {
        key: "research",
        eyebrow: "RESEARCH CONTROL",
        title: "강화 연구",
        href: "/erp/equipment-shop/lab",
        status:
          activeProjectCount > 0
            ? `진행 ${activeProjectCount} · 완료 대기 ${readyProjectCount}`
            : "대기 큐 없음",
        detail: "개인/팀 연구를 시작하고 완료 연구를 실제 스탯에 적용합니다.",
        warning: false,
      },
      {
        key: "catalog",
        eyebrow: "ISSUE COUNTER",
        title: "토와스키 건샵",
        href: "/erp/equipment-shop/towaski",
        status:
          towaskiItemCount > 0
            ? `${towaskiItemCount}종 반출 가능`
            : "등록 품목 없음",
        detail: "표준 화기와 방어구를 크레딧 결제 후 인벤토리에 반출합니다.",
        warning: towaskiItemCount === 0,
      },
      {
        key: "acheron",
        eyebrow: "ACHERON FORGE",
        title: "아케론 대장간",
        href: "/erp/equipment-shop/acheron",
        status:
          acheronItemCount > 0
            ? `${acheronItemCount}종 반출 가능`
            : "등록 품목 없음",
        detail: "근접무기와 냉병기류를 별도 대장간 카탈로그에서 반출합니다.",
        warning: acheronItemCount === 0,
      },
      {
        key: "simulator",
        eyebrow: "TEST RANGE",
        title: "훈련장",
        href: "/erp/equipment-shop/simulator",
        status: "시험장 모듈 활성",
        detail: "보급형 장비의 사거리, 탄환 운용, 공격 흐름을 시험합니다.",
        warning: false,
      },
      {
        key: "strategic",
        eyebrow: "SPECIAL ASSETS",
        title: "전략 장비 보급소",
        href: "/erp/equipment-shop/strategic",
        status:
          strategicItemCount > 0
            ? `${strategicItemCount}종 승인 목록`
            : "승인 목록 없음",
        detail: "차량, 작전 보조품, 특수 장비처럼 SPECIAL 태그가 붙은 품목을 분리합니다.",
        warning: strategicItemCount === 0,
      },
      {
        key: "fabrication",
        eyebrow: "FABRICATION",
        title: "공방",
        href: "/erp/equipment-shop/custom",
        status: "공방 상담 · 훈련장 연결",
        detail: "전용무기 상담과 보급형 장비 성능 시험을 병기부 하위 모듈로 분리합니다.",
        warning: false,
      },
    ];

    return (
      <div className={styles.hubLayout}>
        <section className={styles.commandPanel} aria-label="병기부 운영 현황">
          <div className={styles.commandHero}>
            <span className={styles.bureauMark} aria-hidden>
              <span />
            </span>
            <div>
              <Eyebrow>ARMORY OPERATIONS</Eyebrow>
              <strong>병기부 통합 관제</strong>
              <p>
                연구, 장비 반출, 제작 상담, 성능 검증을 한 화면에서 분기합니다.
              </p>
            </div>
          </div>

          <div className={styles.commandStats}>
            {commandStats.map((stat) => (
              <div
                key={stat.key}
                className={[
                  styles.commandStat,
                  stat.warning ? styles["commandStat--warning"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <em>{stat.detail}</em>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.operationGrid} aria-label="병기부 업무 구분">
          {operationCards.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className={[
                styles.operationCard,
                card.warning ? styles["operationCard--warning"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={(event) => handleZoneLinkClick(event, card.href)}
            >
              <span>{card.eyebrow}</span>
              <strong>{card.title}</strong>
              <p>{card.detail}</p>
              <em>{card.status}</em>
            </Link>
          ))}
        </section>

        <aside className={styles.systemPanel} aria-label="병기부 시스템 상태">
          <div className={styles.panelIntro}>
            <Eyebrow>SYSTEM BOARD</Eyebrow>
            <strong>처리 대기</strong>
          </div>
          <div className={styles.systemList}>
            {[
              {
                key: "research",
                label: "완료 연구",
                value:
                  readyProjectCount > 0
                    ? `${readyProjectCount}건 적용 대기`
                    : "대기 없음",
                warning: readyProjectCount > 0,
              },
              {
                key: "strategic",
                label: "전략 장비 보급소",
                value:
                  strategicItemCount > 0
                    ? `${strategicItemCount}종 반출 목록`
                    : "목록 비어 있음",
                warning: strategicItemCount === 0,
              },
              {
                key: "custom",
                label: "공방",
                value: "상담 패널 활성",
                warning: false,
              },
              {
                key: "simulator",
                label: "훈련장",
                value: "훈련 모듈 활성",
                warning: false,
              },
            ].map((alert) => (
              <div
                key={alert.key}
                className={[
                  styles.systemItem,
                  alert.warning ? styles["systemItem--warning"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span>{alert.label}</span>
                <strong>{alert.value}</strong>
              </div>
            ))}
          </div>
        </aside>
      </div>
    );
  }

  function renderSalesPanel() {
    const isTowaski = activeZone === "towaski";
    const isAcheron = activeZone === "acheron";
    const isStandardCatalog = isTowaski || isAcheron;
    const activeCatalogZone = isAcheron ? "acheron" : "towaski";

    return (
      <div className={styles.salesLayout}>
        <section className={styles.shelfPanel} aria-label={zoneMeta.label}>
          {isStandardCatalog ? (
            <div
              role="tablist"
              aria-label={`${activeZoneDef.label} 카테고리`}
              className={styles.filters}
            >
              {TAB_DEFS.map((tab) => {
                const isActive = activeTab === tab.value;
                const count =
                  tab.value === "ALL"
                    ? catalog.items.filter(
                        (item) => item.zone === activeCatalogZone,
                      )
                        .length
                    : catalog.items.filter(
                        (item) =>
                          item.zone === activeCatalogZone &&
                          item.category === tab.value,
                      ).length;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={[
                      styles.filterTab,
                      isActive ? styles["filterTab--active"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setActiveTab(tab.value)}
                  >
                    {tab.label}
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.panelIntro}>
              <Eyebrow>STRATEGIC CATALOG</Eyebrow>
              <strong>전략 자산 반출대</strong>
            </div>
          )}

          {salesItems.length === 0 ? (
            <div className={styles.empty}>
              {isTowaski
                ? "등록된 토와스키 장비 품목이 없습니다."
                : isAcheron
                  ? "등록된 아케론 대장간 품목이 없습니다."
                  : "전략 장비 보급소 대상 품목이 없습니다. SPECIAL 카테고리에 병기부/전략자산/차량/전투보조 태그가 붙으면 이곳에 표시됩니다."}
            </div>
          ) : (
            <div className={styles.productGrid}>
              {salesItems.map((item) => {
                const inCart = cart[item.key] ?? 0;
                const isSelected = selectedItem?.key === item.key;
                const isSoldOut = item.stock <= 0 || !item.available;
                const canAdd =
                  canUseShop &&
                  !isSoldOut &&
                  inCart < item.stock &&
                  inCart < MAX_CART_QUANTITY_PER_ITEM;

                return (
                  <article
                    key={item.key}
                    className={[
                      styles.productCard,
                      isSelected ? styles["productCard--selected"] : "",
                      isSoldOut ? styles["productCard--locked"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <button
                      type="button"
                      className={styles.productSelect}
                      onClick={() => setSelectedKey(item.key)}
                      aria-pressed={isSelected}
                    >
                      <span className={styles.productTop}>
                        <span>{CATEGORY_LABELS[item.category]}</span>
                        <span>{isSoldOut ? "LOCKED" : `${item.stock} EA`}</span>
                      </span>
                      <span className={styles.productIcon} aria-hidden>
                        {renderCatalogIcon(item, 48)}
                      </span>
                      <span className={styles.productName}>{item.name}</span>
                      <span className={styles.productEffect}>{item.effect}</span>
                      <strong>{formatCredits(item.price)}</strong>
                    </button>
                    <button
                      type="button"
                      className={styles.productAction}
                      onClick={() => handleAddToCart(item)}
                      disabled={!canAdd}
                    >
                      {isSoldOut ? "반출 불가" : inCart > 0 ? "카트 등록" : "담기"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className={styles.counterPanel} aria-label="반출 계산대">
          <section className={styles.detailPanel}>
            {selectedItem ? (
              <>
                <div className={styles.detailHead}>
                  <span className={styles.detailIcon} aria-hidden>
                    {renderCatalogIcon(selectedItem, 58)}
                  </span>
                  <div>
                    <span>{CATEGORY_LABELS[selectedItem.category]}</span>
                    <h2>{selectedItem.name}</h2>
                  </div>
                </div>
                <p>{selectedItem.description}</p>
                <div className={styles.detailStats}>
                  <span>{selectedItem.effect}</span>
                  <strong>{formatCredits(selectedItem.price)}</strong>
                  <span>
                    {selectedItem.stock <= 0 || !selectedItem.available
                      ? "LOCKED"
                      : `STOCK ${selectedItem.stock}`}
                  </span>
                </div>
                <div className={styles.buyBox}>
                  <div className={styles.qtyStepper}>
                    <button
                      type="button"
                      onClick={() =>
                        setCartQuantity(selectedItem.key, selectedQuantity - 1)
                      }
                      disabled={selectedQuantity <= 0}
                      aria-label={`${selectedItem.name} 장바구니 수량 감소`}
                    >
                      -
                    </button>
                    <span>{selectedQuantity}</span>
                    <button
                      type="button"
                      onClick={() => handleAddToCart(selectedItem)}
                      disabled={!selectedCanAdd}
                      aria-label={`${selectedItem.name} 장바구니 수량 증가`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    onClick={() => handleAddToCart(selectedItem)}
                    disabled={!selectedCanAdd}
                  >
                    장바구니 담기
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.empty}>선택 가능한 품목이 없습니다.</div>
            )}
          </section>

          <section className={styles.receiptPanel}>
            <div className={styles.receiptHead}>
              <div>
                <Eyebrow>CART RECEIPT</Eyebrow>
                <h2>반출 장바구니</h2>
              </div>
              {cartLines.length > 0 ? (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setCart({})}
                  disabled={checkoutMutation.isPending}
                >
                  비우기
                </button>
              ) : null}
            </div>

            {cartLines.length === 0 ? (
              <div className={styles.receiptEmpty}>담긴 장비가 없습니다.</div>
            ) : (
              <div className={styles.receiptLines}>
                {cartLines.map((line) => (
                  <div
                    key={line.item.key}
                    className={[
                      styles.receiptLine,
                      line.stockIssue ? styles["receiptLine--warning"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div>
                      <span>{line.item.name}</span>
                      <small>
                        {formatCredits(line.item.price)} x {line.quantity}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCart(line.item.key)}
                      disabled={checkoutMutation.isPending}
                      aria-label={`${line.item.name} 제거`}
                    >
                      X
                    </button>
                    <strong>{formatCredits(line.total)}</strong>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.receiptSummary}>
              <div>
                <span>합계</span>
                <strong>{formatCredits(cartTotal)}</strong>
              </div>
              <div>
                <span>결제 후 잔액</span>
                <strong className={cartOverBalance ? styles.dangerText : ""}>
                  {formatCredits(balance - cartTotal)}
                </strong>
              </div>
            </div>

            {cartHasStockIssue ? (
              <div className={styles.cartWarning}>
                반출할 수 없는 장비가 있습니다.
              </div>
            ) : cartOverBalance ? (
              <div className={styles.cartWarning}>잔액이 부족합니다.</div>
            ) : null}

            <button
              type="button"
              className={styles.checkoutButton}
              onClick={handleCheckout}
              disabled={!canCheckout}
              aria-busy={checkoutMutation.isPending}
            >
              {checkoutMutation.isPending ? "결제 중" : "한번에 결제"}
            </button>
          </section>
        </aside>
      </div>
    );
  }

  function renderLabPanel() {
    const selectedResearchUnlocked = selectedResearchNode
      ? isResearchNodeUnlocked({
          node: selectedResearchNode,
          projects: researchProjects,
          scope: activeResearchScope,
          targetCharacterId: mainCharacter?.id ?? null,
        })
      : false;
    const selectedNodeState = selectedResearchNode
      ? getResearchNodeMapStatus(
          researchProjects,
          selectedResearchNode.key,
          activeResearchScope,
        )
      : "available";
    const selectedResearchEffect = selectedResearchNode
      ? selectedResearchNode.effects[activeResearchScope] ?? null
      : null;
    const selectedRushRule = selectedResearchNode
      ? research.rushRules.find((rule) => rule.tier === selectedResearchNode.tier)
      : null;
    const selectedPrerequisiteLabel = selectedResearchNode
      ? researchNodeLockLabel(selectedResearchNode)
      : null;
    const selectedStartQuote = selectedResearchNode
      ? quoteEquipmentResearchStart({
          node: selectedResearchNode,
          capabilities:
            activeResearchScope === "team"
              ? DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES
              : research.capabilities,
        })
      : null;
    const selectedFundingPool = selectedResearchNode
      ? research.fundingPools.find((pool) => pool.key === selectedResearchNode.key)
      : null;
    const selectedTeamFundedAmount =
      activeResearchScope === "team" ? (selectedFundingPool?.fundedAmount ?? 0) : 0;
    const selectedTeamTargetCost =
      activeResearchScope === "team" && selectedResearchNode
        ? (selectedFundingPool?.targetCost ?? selectedResearchNode.cost)
        : 0;
    const selectedTeamRemainingCost = Math.max(
      0,
      selectedTeamTargetCost - selectedTeamFundedAmount,
    );
    const parsedContributionAmount = Math.floor(Number(teamContributionAmount));
    const selectedTeamChargePreview =
      Number.isInteger(parsedContributionAmount) && parsedContributionAmount > 0
        ? Math.min(parsedContributionAmount, selectedTeamRemainingCost)
        : 0;
    const canContributeTeamResearch =
      activeResearchScope === "team" &&
      Boolean(selectedResearchNode) &&
      Boolean(selectedResearchEffect) &&
      selectedResearchUnlocked &&
      selectedTeamRemainingCost > 0 &&
      selectedTeamChargePreview > 0 &&
      balance >= selectedTeamChargePreview &&
      hasMainCharacter &&
      !contributeResearchMutation.isPending;
    const techTreeMapStyle = {
      gridTemplateColumns: `132px repeat(${researchTrackLayout.columnCount}, minmax(152px, 176px))`,
      gridTemplateRows: `70px repeat(${Math.max(1, researchTrackLayout.rows.length)}, minmax(118px, auto))`,
      minWidth: `${164 + researchTrackLayout.columnCount * 184}px`,
    };

    return (
      <div className={styles.labLayout}>
        <section className={styles.techTreeConsole}>
          <div className={styles.techTreeHeader}>
            <div>
              <Eyebrow>HORIZONTAL TECH TREE</Eyebrow>
              <strong>신체증강 연구소</strong>
            </div>
            <div className={styles.techTreeControls}>
              <div
                className={styles.techScopeSwitch}
                role="tablist"
                aria-label="연구 범위"
              >
                {(["personal", "team"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    role="tab"
                    aria-selected={activeResearchScope === scope}
                    className={
                      activeResearchScope === scope
                        ? styles["techScopeSwitch--active"]
                        : ""
                    }
                    onClick={() => handleResearchScopeChange(scope)}
                  >
                    {scope === "personal" ? "개인 연구" : "팀 연구"}
                  </button>
                ))}
              </div>
              <div className={styles.techTreeLegend}>
                <span>좌측 T1</span>
                <span>우측 T5</span>
                <span>{scopeLabel(activeResearchScope)} 트리</span>
              </div>
            </div>
          </div>

          <div className={styles.techCapRail}>
            <div>
              <span>누적 상한</span>
              <strong>
                HP {research.caps.hp} · SAN {research.caps.san} · ATK{" "}
                {research.caps.atk} · DEF {research.caps.def}
              </strong>
            </div>
            <div>
              <span>환급</span>
              <strong>
                {research.capabilities.refundPercent > 0
                  ? `${research.capabilities.refundPercent}% / cap ${research.capabilities.refundCap} CR`
                  : "미해금"}
              </strong>
            </div>
            <div>
              <span>RUSH 할인</span>
              <strong>
                {research.capabilities.rushDiscountPercent > 0
                  ? `${research.capabilities.rushDiscountPercent}%`
                  : "미해금"}
              </strong>
            </div>
            <div>
              <span>연구비</span>
              <strong>
                {research.capabilities.researchCostDiscountPercent > 0
                  ? `${research.capabilities.researchCostDiscountPercent}% / cap ${research.capabilities.researchCostDiscountCap} CR`
                  : "미해금"}
              </strong>
            </div>
            <div>
              <span>연구 시간</span>
              <strong>
                {research.capabilities.researchTimeDiscountPercent > 0
                  ? `${research.capabilities.researchTimeDiscountPercent}% / max ${research.capabilities.researchTimeDiscountMaxHours}h`
                  : "미해금"}
              </strong>
            </div>
            <div>
              <span>크레딧 보너스</span>
              <strong>
                {research.capabilities.creditBonusPercent > 0
                  ? `${research.capabilities.creditBonusPercent}% / cap ${research.capabilities.creditBonusCap} CR`
                  : "미해금"}
              </strong>
            </div>
          </div>

          <div className={styles.techTreeScroll}>
            <div
              className={styles.techTreeMap}
              style={techTreeMapStyle}
              aria-label="병기 연구 테크트리"
            >
              <div
                className={styles.techCornerHeader}
                style={{ gridColumn: 1, gridRow: 1 }}
              >
                <span>분류</span>
              </div>

              {researchTrackLayout.tiers.map(({ tier, startColumn, span }) => (
                <div
                  key={tier}
                  className={styles.techTierHeader}
                  style={{ gridColumn: `${startColumn + 1} / span ${span}`, gridRow: 1 }}
                >
                  <span>T{tier}</span>
                  <strong>{RESEARCH_TIER_LABELS[tier]}</strong>
                  <em>{RESEARCH_TIER_FEEL[tier]}</em>
                </div>
              ))}

              {researchTrackLayout.rows.map((row, rowIndex) => (
                <Fragment key={row.branch}>
                  <div
                    className={styles.techBranchRail}
                    style={{
                      gridColumn: `1 / ${row.lastColumn + 2}`,
                      gridRow: rowIndex + 2,
                    }}
                    aria-hidden
                  />
                  <div
                    className={styles.techBranchLabel}
                    style={{ gridColumn: 1, gridRow: rowIndex + 2 }}
                  >
                    <span>{row.meta.code}</span>
                    <strong>{row.meta.label}</strong>
                  </div>

                  {row.nodes.map(({ node, column }) => {
                    const isUnlocked = isResearchNodeUnlocked({
                      node,
                      projects: researchProjects,
                      scope: activeResearchScope,
                      targetCharacterId: mainCharacter?.id ?? null,
                    });
                    const nodeStatus = getResearchNodeMapStatus(
                      researchProjects,
                      node.key,
                      activeResearchScope,
                    );
                    const isSelected = selectedResearchNode?.key === node.key;
                    const effectSummary = node.effects[activeResearchScope]
                      ? describeEquipmentResearchEffect(
                          node.effects[activeResearchScope],
                        )
                      : "-";

                    return (
                      <button
                        key={node.key}
                        type="button"
                        className={researchNodeClassName(
                          nodeStatus,
                          isSelected,
                          !isUnlocked,
                        )}
                        style={{
                          gridColumn: column + 1,
                          gridRow: rowIndex + 2,
                        }}
                        onClick={() => handleSelectResearchNode(node.key)}
                        aria-pressed={isSelected}
                      >
                        <span className={styles.techNodeKey}>{node.key}</span>
                        <ResearchPixelIcon node={node} active={isSelected} />
                        <strong>{node.name}</strong>
                        <span className={styles.techNodeEffect}>
                          {effectSummary}
                        </span>
                        <span className={styles.techNodeBadge}>
                          {isUnlocked
                            ? researchNodeMapStatusLabel(nodeStatus)
                            : researchNodeLockLabel(node)}
                        </span>
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        <aside className={styles.techDetailPanel}>
          {selectedResearchNode ? (
            <div className={styles.techDetailHero}>
              <ResearchPixelIcon node={selectedResearchNode} active />
              <div>
                <Eyebrow>SELECTED RESEARCH</Eyebrow>
                <strong>{selectedResearchNode.name}</strong>
                <span>{selectedResearchNode.key}</span>
              </div>
              <span className={styles.techDetailStatus}>
                {researchNodeMapStatusLabel(selectedNodeState)}
              </span>
            </div>
          ) : null}

          {selectedResearchNode ? (
            <>
              <p className={styles.techDetailSummary}>
                {selectedResearchNode.summary}
              </p>

              <div className={styles.techDetailStats}>
                <div>
                  <span>비용</span>
                  <strong>
                    {selectedStartQuote
                      ? formatCredits(selectedStartQuote.cost)
                      : formatCredits(selectedResearchNode.cost)}
                  </strong>
                  {selectedStartQuote?.costDiscount ? (
                    <em>
                      정가 {formatCredits(selectedResearchNode.cost)} · 할인{" "}
                      {formatCredits(selectedStartQuote.costDiscount)}
                    </em>
                  ) : null}
                </div>
                <div>
                  <span>실제 시간</span>
                  <strong>
                    {selectedStartQuote
                      ? formatDuration(selectedStartQuote.durationHours)
                      : formatDuration(selectedResearchNode.durationHours)}
                  </strong>
                  {selectedStartQuote?.durationReductionHours ? (
                    <em>
                      기본 {formatDuration(selectedResearchNode.durationHours)} ·
                      단축{" "}
                      {formatDuration(selectedStartQuote.durationReductionHours)}
                    </em>
                  ) : null}
                </div>
                <div>
                  <span>RUSH</span>
                  <strong>
                    {selectedRushRule
                      ? `${formatCredits(selectedRushRule.cost)} / ${formatDuration(selectedRushRule.hours)}`
                      : "없음"}
                  </strong>
                </div>
                <div>
                  <span>하한</span>
                  <strong>
                    {selectedResearchNode.minDurationHours
                      ? formatDuration(selectedResearchNode.minDurationHours)
                      : "없음"}
                  </strong>
                </div>
                <div>
                  <span>선행</span>
                  <strong>
                    {selectedPrerequisiteLabel
                      ? selectedResearchUnlocked
                        ? `${selectedPrerequisiteLabel} 충족`
                        : selectedPrerequisiteLabel
                      : "없음"}
                  </strong>
                </div>
              </div>

              {activeResearchScope === "team" ? (
                <div className={styles.teamFundingPanel}>
                  <div className={styles.teamFundingMeter}>
                    <div>
                      <span>팀 연구 모금</span>
                      <strong>
                        {formatCredits(selectedTeamFundedAmount)} /{" "}
                        {formatCredits(selectedTeamTargetCost)}
                      </strong>
                    </div>
                    <progress
                      max={Math.max(1, selectedTeamTargetCost)}
                      value={selectedTeamFundedAmount}
                    />
                    <em>
                      남은 목표액 {formatCredits(selectedTeamRemainingCost)}
                    </em>
                  </div>

                  <div className={styles.teamFundingInput}>
                    <label htmlFor="team-research-contribution">
                      기여 금액
                    </label>
                    <input
                      id="team-research-contribution"
                      type="number"
                      min={1}
                      max={Math.max(1, selectedTeamRemainingCost)}
                      step={1}
                      value={teamContributionAmount}
                      onChange={(event) =>
                        setTeamContributionAmount(event.target.value)
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleContributeTeamResearch(
                          selectedResearchNode.key,
                          selectedTeamRemainingCost,
                        )
                      }
                      disabled={!canContributeTeamResearch}
                      aria-busy={contributeResearchMutation.isPending}
                    >
                      {selectedTeamChargePreview > 0
                        ? `${formatCredits(selectedTeamChargePreview)} 기여`
                        : "기여 불가"}
                    </button>
                  </div>

                  <div className={styles.teamFundingQuick}>
                    {[50, 100, 200, selectedTeamRemainingCost]
                      .filter((amount, index, list) => amount > 0 && list.indexOf(amount) === index)
                      .slice(0, 4)
                      .map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() =>
                            setTeamContributionAmount(String(amount))
                          }
                        >
                          {amount === selectedTeamRemainingCost
                            ? "목표 채우기"
                            : formatCredits(amount)}
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <div className={styles.techDetailActions}>
                  <button
                    type="button"
                    onClick={() =>
                      handleStartResearch(
                        selectedResearchNode.key,
                        activeResearchScope,
                      )
                    }
                    disabled={
                      !selectedResearchEffect ||
                      !selectedResearchUnlocked ||
                      !canStartResearch(
                        activeResearchScope,
                        selectedStartQuote?.cost ?? selectedResearchNode.cost,
                      )
                    }
                    aria-busy={startResearchMutation.isPending}
                  >
                    <span>{scopeLabel(activeResearchScope)} 연구 시작</span>
                    <strong>
                      {selectedResearchEffect
                        ? describeEquipmentResearchEffect(selectedResearchEffect)
                        : "-"}
                    </strong>
                  </button>
                </div>
              )}

              {selectedNodeProjects.length > 0 ? (
                <div className={styles.selectedHistory}>
                  {selectedNodeProjects.slice(0, 3).map((project) => (
                    <span key={project.id}>
                      {scopeLabel(project.scope)} ·{" "}
                      {projectStatusLabel(project.computedStatus)}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.empty}>선택 가능한 연구가 없습니다.</div>
          )}

          <div className={styles.agentSnapshot}>
            <div className={styles.panelIntro}>
              <Eyebrow>MAIN AGENT</Eyebrow>
              <strong>{mainCharacter?.codename ?? "UNASSIGNED"}</strong>
            </div>
            {localStats ? (
              <div className={styles.statsGrid}>
                {STAT_DEFS.map((stat) => (
                  <div key={stat.value} className={styles.statReadout}>
                    <span>{stat.label}</span>
                    <strong>{localStats[stat.value]}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                메인 AGENT 캐릭터가 없어 연구 비용 차감과 개인 연구를 실행할 수 없습니다.
              </div>
            )}
          </div>

          <div className={styles.projectPanel}>
            <div className={styles.panelIntro}>
              <Eyebrow>PROJECTS</Eyebrow>
              <strong>진행 큐</strong>
            </div>
            {activeResearchProjects.length === 0 ? (
              <div className={styles.empty}>진행 중인 연구가 없습니다.</div>
            ) : (
              <div className={styles.projectList}>
                {activeResearchProjects.slice(0, 4).map((project) => {
                  const rushRule = research.rushRules.find(
                    (rule) => rule.tier === project.tier,
                  );
                  const projectNode = research.tree.find(
                    (node) => node.key === project.key,
                  );
                  const rushQuote =
                    projectNode && rushRule
                      ? quoteEquipmentResearchRush({
                          node: projectNode,
                          project: {
                            tier: project.tier,
                            startedAt: new Date(project.startedAt),
                            completedAt: new Date(project.completedAt),
                            rushUsed: project.rushUsed,
                            rushDiscountUsed: project.rushDiscountUsed,
                          },
                          capabilities:
                            project.scope === "team"
                              ? DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES
                              : research.capabilities,
                        })
                      : null;
                  return (
                    <article key={project.id} className={styles.projectCard}>
                      <div className={styles.projectCardTop}>
                        <span>{project.key}</span>
                        <strong>{projectStatusLabel(project.computedStatus)}</strong>
                      </div>
                      <p>{describeEquipmentResearchEffect(project.effect)}</p>
                      <div className={styles.projectMeta}>
                        <span>{scopeLabel(project.scope)}</span>
                        <span>완료 {formatDateTime(project.completedAt)}</span>
                        <span>
                          RUSH {project.rushUsed}
                          {rushRule ? `/${rushRule.maxUses}` : ""}
                        </span>
                      </div>
                      <div className={styles.projectActions}>
                        <button
                          type="button"
                          onClick={() => handleRushResearch(project.id)}
                          disabled={
                            project.computedStatus !== "in_progress" ||
                            !rushQuote ||
                            rushResearchMutation.isPending
                          }
                          aria-busy={rushResearchMutation.isPending}
                        >
                          {rushQuote
                            ? `${formatCredits(rushQuote.cost)} / ${formatDuration(rushQuote.hours)}`
                            : rushRule
                              ? `${formatCredits(rushRule.cost)} / ${formatDuration(rushRule.hours)}`
                            : "단축 불가"}
                        </button>
                        {isGM ? (
                          <button
                            type="button"
                            onClick={() => handleCompleteResearch(project)}
                            disabled={
                              project.computedStatus !== "completed" ||
                              completeResearchMutation.isPending
                            }
                            aria-busy={completeResearchMutation.isPending}
                          >
                            완료 적용
                          </button>
                        ) : (
                          <span className={styles.projectAutoApply}>
                            자동 반영
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {activeResearchScope === "team" ? (
            <div className={styles.teamLedgerGrid}>
              <section className={styles.projectPanel}>
                <div className={styles.panelIntro}>
                  <Eyebrow>CONTRIBUTION LOG</Eyebrow>
                  <strong>최근 기여</strong>
                </div>
                {research.recentContributions.length === 0 ? (
                  <div className={styles.empty}>팀 연구 기여 기록이 없습니다.</div>
                ) : (
                  <div className={styles.contributionList}>
                    {research.recentContributions.slice(0, 6).map((entry) => (
                      <div key={entry.id}>
                        <span>{entry.projectKey}</span>
                        <strong>{entry.contributorCodename}</strong>
                        <em>
                          {entry.amount > 0
                            ? formatCredits(entry.amount)
                            : entry.action === "start"
                              ? "연구 시작"
                              : "자동 적용"}
                        </em>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.projectPanel}>
                <div className={styles.panelIntro}>
                  <Eyebrow>RANKING</Eyebrow>
                  <strong>누적 기여</strong>
                </div>
                {research.contributionRankings.length === 0 ? (
                  <div className={styles.empty}>랭킹 집계가 없습니다.</div>
                ) : (
                  <div className={styles.rankingList}>
                    {research.contributionRankings.slice(0, 5).map((row, index) => (
                      <div key={row.contributorCharacterId}>
                        <span>{index + 1}</span>
                        <strong>{row.contributorCodename}</strong>
                        <em>{formatCredits(row.totalAmount)}</em>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          <div className={styles.projectPanel}>
            <div className={styles.panelIntro}>
              <Eyebrow>ARCHIVE</Eyebrow>
              <strong>적용 완료</strong>
            </div>
            {appliedResearchProjects.length === 0 ? (
              <div className={styles.empty}>적용 완료된 연구가 없습니다.</div>
            ) : (
              <div className={styles.appliedList}>
                {appliedResearchProjects.slice(0, 6).map((project) => (
                  <div key={project.id}>
                    <span>{project.key}</span>
                    <strong>{describeEquipmentResearchEffect(project.effect)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    );
  }

  function renderCustomPanel() {
    return (
      <div className={styles.customPanel}>
        <div className={styles.panelIntro}>
          <Eyebrow>CUSTOM WEAPON</Eyebrow>
          <strong>공방 상담</strong>
        </div>
        <div className={styles.workshopGrid}>
          <div>
            <span>REQUEST</span>
            <strong>제작 요청서</strong>
            <p>전용무기 제작 요청 저장과 GM 승인 흐름은 후속 단계에서 연결합니다.</p>
          </div>
          <div>
            <span>MATERIAL</span>
            <strong>재료/비용 산정</strong>
            <p>실제 제작 데이터가 들어오면 요구 재료, 가격, 승인 조건을 표시합니다.</p>
          </div>
          <div>
            <span>OUTPUT</span>
            <strong>인벤토리 지급</strong>
            <p>완성품 지급은 기존 `master_items`와 인벤토리 적재 흐름을 재사용합니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.armoryRoot} data-pixel-font="full">
      <PageHead
        breadcrumb={
          isHub
            ? [
                { label: "ERP", href: "/erp" },
                { label: "ARMORY BUREAU" },
              ]
            : [
                { label: "ERP", href: "/erp" },
                { label: "병기부", href: "/erp/equipment-shop" },
                { label: zoneMeta.label },
              ]
        }
        title={isHub ? "병기부 안내데스크" : zoneMeta.label}
      />

      {!hasMainCharacter ? (
        <Box className={styles.notice}>
          {mainCharacterError ? (
            <>
              <strong>정합성 위반</strong>
              {": "}
              {mainCharacterError}
            </>
          ) : (
            "메인 AGENT 캐릭터가 없어 구매와 개인 강화가 제한됩니다. 팀 강화는 GM 권한으로 실행할 수 있습니다."
          )}
        </Box>
      ) : null}

      {errorMessage ? (
        <Box className={styles.errorBanner} role="alert">
          <strong>!</strong> {errorMessage}
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            aria-label="에러 메시지 닫기"
          >
            X
          </button>
        </Box>
      ) : null}

      {notice ? (
        <Box
          className={[
            styles.noticeBanner,
            notice.tone === "success" ? styles["noticeBanner--success"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="status"
        >
          {notice.text}
        </Box>
      ) : null}

      <section
        className={[
          styles.armoryStage,
          isHub ? styles["armoryStage--hub"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="병기부"
      >
        <header className={styles.armoryHeader}>
          <div>
            <Eyebrow>{zoneMeta.eyebrow}</Eyebrow>
            <h1>{zoneMeta.label}</h1>
          </div>
          <Tag tone="gold">{isGM ? "GM PREVIEW" : "RESEARCH ACCESS"}</Tag>
          <div className={styles.headerStats}>
            <div>
              <span>요원</span>
              <strong>{mainCharacter?.codename ?? "UNASSIGNED"}</strong>
            </div>
            <div>
              <span>잔액</span>
              <strong>{formatCredits(balance)}</strong>
            </div>
            <div>
              <span>{isHub ? "기능" : "카트"}</span>
              <strong>{isHub ? `${ZONE_DEFS.length}모듈` : `${cartCount}개`}</strong>
            </div>
          </div>
        </header>

        {isHub ? (
          renderHubPanel()
        ) : (
          <>
            <div className={styles.routeBar}>
              <Link href="/erp/equipment-shop" className={styles.backLink}>
                안내데스크로 돌아가기
              </Link>
              <span>{activeZoneDef.description}</span>
            </div>

            <div className={styles.zoneBody}>
              {activeZone === "lab"
                ? renderLabPanel()
                : activeZone === "custom"
                  ? renderCustomPanel()
                  : renderSalesPanel()}
            </div>
          </>
        )}

        <section className={styles.npcHud} aria-label="병기부 응대 HUD">
          <div
            className={[
              styles.npcPortrait,
              isHub ? styles["npcPortrait--mark"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {isHub ? (
              <span className={styles.npcPortraitMark} aria-hidden />
            ) : (
              <Image
                src={TOWASKI_PORTRAIT_SRC}
                alt=""
                fill
                sizes="148px"
                priority
              />
            )}
          </div>
          <div className={styles.npcDialogue}>
            <div className={styles.npcHead}>
              <span className={styles.npcProfile}>
                {isHub ? (
                  <span className={styles.npcProfileMark} aria-hidden />
                ) : (
                  <Image src={TOWASKI_PROFILE_SRC} alt="" fill sizes="38px" />
                )}
              </span>
              <div>
                <span>{zoneMeta.eyebrow}</span>
                <strong>{zoneMeta.npc}</strong>
              </div>
              <span className={styles.npcMood}>응대 중</span>
            </div>
            <p>
              {isHub
                ? "병기부 통합 관제실이다. 연구, 반출, 제작, 시험 상태를 확인하고 필요한 구역으로 이동해라."
                : activeZone === "lab"
                  ? "연구 적용은 즉시 기록된다. 개인인지, 팀 전체인지 먼저 확인해."
                  : activeZone === "towaski"
                    ? "토와스키다. 표준 장비는 여기서 보고, 장난감은 들고 오지 마."
                    : activeZone === "acheron"
                      ? "아케론 대장간이다. 날붙이와 타격 장비는 여기서 보고 골라."
                    : activeZone === "strategic"
                      ? "차량과 전략 자산은 태그가 붙은 품목만 반출대에 올라온다."
                      : "전용무기는 상담부터다. 제작 요청 저장은 다음 단계에서 연결한다."}
            </p>
          </div>
        </section>
      </section>
    </div>
  );
}
