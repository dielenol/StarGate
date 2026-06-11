import { Suspense } from "react";

import { redirect } from "next/navigation";

import type { Character, FactionCode, InstitutionCode } from "@/types/character";
import { FACTIONS, INSTITUTIONS } from "@/types/character";
import type { UserRole } from "@/types/user";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listCharacters } from "@/lib/db/characters";
import { listFactionFavorabilityOverrides } from "@/lib/db/faction-favorability";
import { listSessionReports } from "@/lib/db/session-reports";
import { listWikiPages } from "@/lib/db/wiki";
import {
  getTopLevelGroup,
  isFaction,
} from "@/lib/org-structure";

import ERPLoading from "../loading";
import {
  EXTERNAL_SUB_ORGS,
  FACTION_DOCTRINE,
  FACTION_LOGO,
  INSTITUTION_DOCTRINE,
  INSTITUTION_LOGO,
  getExternalSubOrg,
} from "../personnel/_constants";

import FactionsClient from "./FactionsClient";
import type {
  FactionBoardData,
  FactionBoardNode,
  FactionBoardTotals,
} from "./FactionsClient";

const EXTERNAL_FACTION_CODES = ["COUNCIL", "MILITARY", "CIVIL"] as const;
const HOSTILE_FACTION_CODE = "HOSTILE" as const;
const INTERNAL_NODE_CODES = ["NOVUS_ORDO", "SECRETARIAT", "MANUS"] as const;

const TRACKED_NODE_CODES = [
  ...EXTERNAL_FACTION_CODES,
  HOSTILE_FACTION_CODE,
  ...EXTERNAL_SUB_ORGS.map((org) => org.code),
  ...INTERNAL_NODE_CODES,
] as const;

const TRACKED_NODE_CODE_SET = new Set<string>(TRACKED_NODE_CODES);

const FAVORABILITY_BY_CODE: Record<string, number> = {
  COUNCIL: 3,
  MILITARY: 4,
  CIVIL: 5,
  HOSTILE: 0,
  WHITE_ROSE: 10,
  SPACE_ZERO: 3,
  GOLDEN_DAWN: 0,
  AHNENERBE: 0,
};

const BOARD_LOGO_BY_CODE: Record<string, string> = {
  SPACE_ZERO: "/assets/faction/space_zero_logo.webp",
};

function resolveExternalSubOrg(c: Character) {
  return (
    getExternalSubOrg(c.department ?? "") ??
    getExternalSubOrg(c.factionCode ?? "") ??
    getExternalSubOrg(c.institutionCode ?? "")
  );
}

function resolvePrimaryGroup(c: Character): string | null {
  const externalSubOrg = resolveExternalSubOrg(c);
  if (externalSubOrg) return externalSubOrg.parentCode;

  const dept = c.department;
  if (dept && dept !== "UNASSIGNED") {
    const top = getTopLevelGroup(dept);
    if (top !== "UNASSIGNED") return top;
  }

  if (c.institutionCode) {
    const top = getTopLevelGroup(c.institutionCode);
    return top !== "UNASSIGNED" ? top : c.institutionCode;
  }

  if (c.factionCode && isFaction(c.factionCode)) {
    return c.factionCode;
  }

  return null;
}

function getContactBucketCodes(c: Character): string[] {
  const primary = resolvePrimaryGroup(c);
  if (!primary || !TRACKED_NODE_CODE_SET.has(primary)) return [];

  const codes = new Set<string>([primary]);
  const externalSubOrg = resolveExternalSubOrg(c);
  if (externalSubOrg) codes.add(externalSubOrg.code);

  if (primary === "SECRETARIAT" || primary === "MANUS") {
    codes.add("NOVUS_ORDO");
  }

  return [...codes];
}

function keywordSetFor(code: string): string[] {
  const faction = FACTIONS.find((f) => f.code === code);
  const institution = INSTITUTIONS.find((inst) => inst.code === code);
  const subOrg = getExternalSubOrg(code);
  const subUnitLabels =
    institution?.subUnits.flatMap((unit) => [unit.code, unit.label]) ?? [];
  const keywords = [
    code,
    faction?.label,
    faction?.labelEn,
    FACTION_DOCTRINE[code as FactionCode],
    institution?.label,
    institution?.labelEn,
    INSTITUTION_DOCTRINE[code as InstitutionCode],
    subOrg?.label,
    subOrg?.labelEn,
    subOrg?.summary,
    subOrg?.doctrine,
    ...subUnitLabels,
  ].filter((value): value is string => Boolean(value));

  if (code === "CIVIL") {
    for (const org of EXTERNAL_SUB_ORGS.filter(
      (entry) => entry.parentCode === "CIVIL",
    )) {
      keywords.push(org.code, org.label, org.labelEn, org.summary, org.doctrine);
    }
  }

  if (code === HOSTILE_FACTION_CODE) {
    for (const org of EXTERNAL_SUB_ORGS.filter(
      (entry) => entry.parentCode === HOSTILE_FACTION_CODE,
    )) {
      keywords.push(org.code, org.label, org.labelEn, org.summary, org.doctrine);
    }
  }

  if (code === "NOVUS_ORDO") {
    keywords.push("노부스 오르도", "Novus Ordo", "사무국", "MANUS", "현장요원");
  }

  return [...new Set(keywords.map((value) => value.toLowerCase()))];
}

function textMatchesFaction(text: string, code: string): boolean {
  const normalized = text.toLowerCase();
  return keywordSetFor(code).some((keyword) => normalized.includes(keyword));
}

function addStats(
  node: Omit<
    FactionBoardNode,
    | "favorability"
    | "memberCount"
    | "contactCount"
    | "wikiCount"
    | "signalCount"
  >,
  groupCounts: Record<string, number>,
  wikiCounts: Record<string, number>,
  signalCounts: Record<string, number>,
  favorabilityByCode: Record<string, number>,
): FactionBoardNode {
  return {
    ...node,
    favorability: favorabilityByCode[node.code] ?? null,
    memberCount: groupCounts[node.code] ?? 0,
    contactCount: groupCounts[node.code] ?? 0,
    wikiCount: wikiCounts[node.code] ?? 0,
    signalCount: signalCounts[node.code] ?? 0,
  };
}

function buildBoardNodes(
  groupCounts: Record<string, number>,
  wikiCounts: Record<string, number>,
  signalCounts: Record<string, number>,
  favorabilityByCode: Record<string, number>,
): FactionBoardNode[] {
  const externalNodes = EXTERNAL_FACTION_CODES.map((code) => {
    const faction = FACTIONS.find((f) => f.code === code);
    return addStats(
      {
        code,
        label: faction?.label ?? code,
        labelEn: faction?.labelEn ?? code,
        kind: "external",
        scopeLabel: "외부 권력 블록",
        parentCode: null,
        summary: "외부 권력 블록",
        doctrine: FACTION_DOCTRINE[code],
        logoUrl: FACTION_LOGO[code],
      },
      groupCounts,
      wikiCounts,
      signalCounts,
      favorabilityByCode,
    );
  });

  const branchNodes = EXTERNAL_SUB_ORGS.filter(
    (org) => org.parentCode === "CIVIL",
  ).map((org) =>
    addStats(
      {
        code: org.code,
        label: org.label,
        labelEn: org.labelEn,
        kind: "branch",
        scopeLabel: "시민사회 하위 세력",
        parentCode: org.parentCode,
        parentLabel: org.parentLabel,
        summary: org.summary,
        doctrine: org.doctrine,
        logoUrl: BOARD_LOGO_BY_CODE[org.code] ?? org.logoUrl,
      },
      groupCounts,
      wikiCounts,
      signalCounts,
      favorabilityByCode,
    ),
  );

  const hostileFaction = FACTIONS.find((f) => f.code === HOSTILE_FACTION_CODE);
  const hostileNode = addStats(
    {
      code: HOSTILE_FACTION_CODE,
      label: hostileFaction?.label ?? "적대세력",
      labelEn: hostileFaction?.labelEn ?? "Hostile Forces",
      kind: "hostile",
      scopeLabel: "적대세력 분류",
      parentCode: null,
      summary: "작전상 적대 또는 충돌 대상으로 분류되는 세력",
      doctrine: FACTION_DOCTRINE[HOSTILE_FACTION_CODE],
      logoUrl: FACTION_LOGO[HOSTILE_FACTION_CODE],
    },
    groupCounts,
    wikiCounts,
    signalCounts,
    favorabilityByCode,
  );

  const hostileBranchNodes = EXTERNAL_SUB_ORGS.filter(
    (org) => org.parentCode === HOSTILE_FACTION_CODE,
  ).map((org) =>
    addStats(
      {
        code: org.code,
        label: org.label,
        labelEn: org.labelEn,
        kind: "hostile",
        scopeLabel: "적대 하위 세력",
        parentCode: org.parentCode,
        parentLabel: org.parentLabel,
        summary: org.summary,
        doctrine: org.doctrine,
        logoUrl: BOARD_LOGO_BY_CODE[org.code] ?? org.logoUrl,
      },
      groupCounts,
      wikiCounts,
      signalCounts,
      favorabilityByCode,
    ),
  );

  const novusOrdo = FACTIONS.find((f) => f.code === "NOVUS_ORDO");
  const internalNodes = [
    addStats(
      {
        code: "NOVUS_ORDO",
        label: novusOrdo?.label ?? "노부스 오르도",
        labelEn: novusOrdo?.labelEn ?? "Novus Ordo",
        kind: "internal",
        scopeLabel: "내부 본부",
        parentCode: null,
        summary: "본부 통할",
        doctrine: FACTION_DOCTRINE.NOVUS_ORDO,
        logoUrl: FACTION_LOGO.NOVUS_ORDO,
      },
      groupCounts,
      wikiCounts,
      signalCounts,
      favorabilityByCode,
    ),
    ...INSTITUTIONS.map((institution) =>
      addStats(
        {
          code: institution.code,
          label: institution.label,
          labelEn: institution.labelEn,
          kind: "internal",
          scopeLabel: "내부 기관",
          parentCode: "NOVUS_ORDO",
          parentLabel: "노부스 오르도",
          summary: `${institution.subUnits.length}개 하위 기구`,
          doctrine: INSTITUTION_DOCTRINE[institution.code],
          logoUrl: INSTITUTION_LOGO,
          subUnitCount: institution.subUnits.length,
        },
        groupCounts,
        wikiCounts,
        signalCounts,
        favorabilityByCode,
      ),
    ),
  ];

  return [
    ...externalNodes,
    ...branchNodes,
    hostileNode,
    ...hostileBranchNodes,
    ...internalNodes,
  ];
}

async function FactionsBody({ role }: { role: UserRole }) {
  const [rawCharacters, rawReports, rawWikiPages, favorabilityOverrides] =
    await Promise.all([
      listCharacters().catch(() => []),
      listSessionReports().catch(() => []),
      listWikiPages().catch(() => []),
      listFactionFavorabilityOverrides().catch(() => ({})),
    ]);

  const isGM = hasRole(role, "GM");
  const visibleCharacters = isGM
    ? rawCharacters
    : rawCharacters.filter((c) => c.isPublic !== false);

  const groupCounts: Record<string, number> = {};
  let visibleTrackedMemberCount = 0;

  for (const raw of visibleCharacters) {
    const primaryGroup = resolvePrimaryGroup(raw);
    const bucketCodes = getContactBucketCodes(raw);
    if (bucketCodes.length === 0 || !primaryGroup) continue;

    visibleTrackedMemberCount += 1;

    for (const code of bucketCodes) {
      groupCounts[code] = (groupCounts[code] ?? 0) + 1;
    }
  }

  const wikiCounts: Record<string, number> = {};
  for (const page of rawWikiPages) {
    if (!isGM && page.isPublic === false) continue;

    const text = `${page.title} ${page.category} ${page.tags.join(" ")} ${page.content}`;

    for (const code of TRACKED_NODE_CODES) {
      if (textMatchesFaction(text, code)) {
        wikiCounts[code] = (wikiCounts[code] ?? 0) + 1;
      }
    }
  }

  const signalCounts: Record<string, number> = {};
  for (const report of rawReports) {
    const text = [
      report.sessionTitle,
      report.summary,
      report.highlights.join(" "),
      report.participants.join(" "),
      report.locationLabel ?? "",
    ].join(" ");

    for (const code of TRACKED_NODE_CODES) {
      if (textMatchesFaction(text, code)) {
        signalCounts[code] = (signalCounts[code] ?? 0) + 1;
      }
    }
  }

  const boardNodes = buildBoardNodes(
    groupCounts,
    wikiCounts,
    signalCounts,
    {
      ...FAVORABILITY_BY_CODE,
      ...favorabilityOverrides,
    },
  );
  const totals: FactionBoardTotals = {
    nodeCount: boardNodes.length,
    factionCount: EXTERNAL_FACTION_CODES.length + 1,
    internalCount: INTERNAL_NODE_CODES.length,
    subOrgCount: EXTERNAL_SUB_ORGS.length,
    memberCount: visibleTrackedMemberCount,
    contactCount: visibleTrackedMemberCount,
    wikiCount: Object.values(wikiCounts).reduce((sum, count) => sum + count, 0),
    signalCount: Object.values(signalCounts).reduce((sum, count) => sum + count, 0),
  };

  const data: FactionBoardData = {
    boardNodes,
    totals,
    generatedAt: new Date().toISOString(),
    canEditFavorability: isGM,
  };

  return <FactionsClient data={data} />;
}

export default async function FactionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Suspense fallback={<ERPLoading />}>
      <FactionsBody role={session.user.role} />
    </Suspense>
  );
}
