import { Suspense } from "react";

import { redirect } from "next/navigation";

import type { Character, FactionCode, InstitutionCode } from "@/types/character";
import { FACTIONS, INSTITUTIONS } from "@/types/character";
import type { UserRole } from "@/types/user";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listCharacters } from "@/lib/db/characters";
import { listSessionReports } from "@/lib/db/session-reports";
import { listWikiPages } from "@/lib/db/wiki";
import { filterCharacterByClearance, getUserClearance } from "@/lib/personnel";
import {
  getDepartmentLabel,
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
  FactionBoardContact,
  FactionBoardData,
  FactionBoardLink,
  FactionBoardNode,
  FactionBoardRelationship,
  FactionBoardSignal,
  FactionBoardTotals,
} from "./FactionsClient";

const EXTERNAL_FACTION_CODES = ["COUNCIL", "MILITARY", "CIVIL"] as const;
const INTERNAL_NODE_CODES = ["NOVUS_ORDO", "SECRETARIAT", "MANUS"] as const;

const TRACKED_NODE_CODES = [
  ...EXTERNAL_FACTION_CODES,
  ...EXTERNAL_SUB_ORGS.map((org) => org.code),
  ...INTERNAL_NODE_CODES,
] as const;

const TRACKED_NODE_CODE_SET = new Set<string>(TRACKED_NODE_CODES);

const FAVORABILITY_BY_CODE: Record<string, number> = {
  COUNCIL: 3,
  MILITARY: 4,
  CIVIL: 5,
  WHITE_ROSE: 10,
  SPACE_ZERO: 3,
};

const RELATIONSHIPS: FactionBoardRelationship[] = [
  {
    from: "COUNCIL",
    to: "MILITARY",
    label: "의결권 · 무력 통제",
    detail: "견제·보고 라인",
  },
  {
    from: "COUNCIL",
    to: "CIVIL",
    label: "최고 의결 · 시민 대표",
    detail: "견제·대표성 조율",
  },
  {
    from: "MILITARY",
    to: "CIVIL",
    label: "외적 방위 · 사회 기반",
    detail: "긴장·여론 견제",
  },
  {
    from: "CIVIL",
    to: "WHITE_ROSE",
    label: "시민사회 내부 분기",
    detail: "급진 인권운동 · 정보공개",
  },
  {
    from: "CIVIL",
    to: "SPACE_ZERO",
    label: "시민사회 내부 분기",
    detail: "기술 자본 · 글로벌 시장",
  },
  {
    from: "NOVUS_ORDO",
    to: "SECRETARIAT",
    label: "의회 운영 · 행정 총괄",
    detail: "내부 운영",
  },
  {
    from: "NOVUS_ORDO",
    to: "MANUS",
    label: "섹터 작전 수행 · 현장 관리",
    detail: "내부 실행",
  },
];

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

function contactDisplayName(c: Character): string {
  const name = c.lore?.name;
  if (name && name !== "[CLASSIFIED]") return name;
  return c.codename;
}

function contactRole(c: Character): string {
  const roleDetail = c.lore?.roleDetail;
  if (roleDetail && roleDetail !== "[CLASSIFIED]") return roleDetail;
  if (c.type === "NPC") return "NPC";
  return c.agentLevel ? `${c.agentLevel} 등급` : "AGENT";
}

function pushContact(
  bucket: Record<string, FactionBoardContact[]>,
  code: string,
  contact: FactionBoardContact,
) {
  if (!bucket[code]) bucket[code] = [];
  bucket[code].push(contact);
}

function sortContacts(a: FactionBoardContact, b: FactionBoardContact): number {
  const typeCompare = a.type.localeCompare(b.type, "en");
  if (typeCompare !== 0) return typeCompare;
  return a.codename.localeCompare(b.codename, "ko");
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
    for (const org of EXTERNAL_SUB_ORGS) {
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
  contactBuckets: Record<string, FactionBoardContact[]>,
  wikiBuckets: Record<string, FactionBoardLink[]>,
  signalBuckets: Record<string, FactionBoardSignal[]>,
): FactionBoardNode {
  return {
    ...node,
    favorability: FAVORABILITY_BY_CODE[node.code] ?? null,
    memberCount: groupCounts[node.code] ?? 0,
    contactCount: contactBuckets[node.code]?.length ?? 0,
    wikiCount: wikiBuckets[node.code]?.length ?? 0,
    signalCount: signalBuckets[node.code]?.length ?? 0,
  };
}

function buildBoardNodes(
  groupCounts: Record<string, number>,
  contactBuckets: Record<string, FactionBoardContact[]>,
  wikiBuckets: Record<string, FactionBoardLink[]>,
  signalBuckets: Record<string, FactionBoardSignal[]>,
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
      contactBuckets,
      wikiBuckets,
      signalBuckets,
    );
  });

  const branchNodes = EXTERNAL_SUB_ORGS.map((org) =>
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
        logoUrl: org.logoUrl,
      },
      groupCounts,
      contactBuckets,
      wikiBuckets,
      signalBuckets,
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
      contactBuckets,
      wikiBuckets,
      signalBuckets,
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
        contactBuckets,
        wikiBuckets,
        signalBuckets,
      ),
    ),
  ];

  return [...externalNodes, ...branchNodes, ...internalNodes];
}

async function FactionsBody({ role }: { role: UserRole }) {
  const [rawCharacters, rawReports, rawWikiPages] = await Promise.all([
    listCharacters().catch(() => []),
    listSessionReports().catch(() => []),
    listWikiPages().catch(() => []),
  ]);

  const clearance = getUserClearance(role);
  const isGM = hasRole(role, "GM");
  const visibleCharacters = isGM
    ? rawCharacters
    : rawCharacters.filter((c) => c.isPublic !== false);

  const groupCounts: Record<string, number> = {};
  const contactBuckets: Record<string, FactionBoardContact[]> = {};
  let visibleTrackedMemberCount = 0;

  for (const raw of visibleCharacters) {
    const primaryGroup = resolvePrimaryGroup(raw);
    const bucketCodes = getContactBucketCodes(raw);
    if (bucketCodes.length === 0 || !primaryGroup) continue;

    visibleTrackedMemberCount += 1;

    const externalSubOrg = resolveExternalSubOrg(raw);
    const internalUnitCode =
      !externalSubOrg && raw.department && raw.department !== primaryGroup
        ? raw.department
        : null;
    const branchCode = externalSubOrg?.code ?? internalUnitCode;
    const branchLabel =
      externalSubOrg?.label ??
      (branchCode && branchCode !== primaryGroup
        ? getDepartmentLabel(branchCode)
        : null);

    const masked = filterCharacterByClearance(raw, clearance);
    const id = raw._id?.toString() ?? "";
    const contact: FactionBoardContact = {
      id,
      codename: masked.codename,
      displayName: contactDisplayName(masked),
      role: contactRole(masked),
      type: masked.type,
      level: masked.agentLevel ?? null,
      groupCode: primaryGroup,
      subOrgCode: branchCode,
      subOrgLabel: branchLabel,
      profileHref: id
        ? `/erp/personnel/${id}`
        : `/erp/personnel?group=${primaryGroup}`,
    };

    for (const code of bucketCodes) {
      groupCounts[code] = (groupCounts[code] ?? 0) + 1;
      pushContact(contactBuckets, code, contact);
    }
  }

  for (const contacts of Object.values(contactBuckets)) {
    contacts.sort(sortContacts);
  }

  const wikiBuckets: Record<string, FactionBoardLink[]> = {};
  for (const page of rawWikiPages) {
    if (!isGM && page.isPublic === false) continue;

    const text = `${page.title} ${page.category} ${page.tags.join(" ")} ${page.content}`;
    const link: FactionBoardLink = {
      id: page._id?.toString() ?? page.slug,
      title: page.title,
      category: page.category,
      href: `/erp/wiki/${page._id?.toString() ?? page.slug}`,
      updatedAt: page.updatedAt.toISOString(),
    };

    for (const code of TRACKED_NODE_CODES) {
      if (textMatchesFaction(text, code)) {
        if (!wikiBuckets[code]) wikiBuckets[code] = [];
        wikiBuckets[code].push(link);
      }
    }
  }

  for (const links of Object.values(wikiBuckets)) {
    links.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const signalBuckets: Record<string, FactionBoardSignal[]> = {};
  for (const report of rawReports) {
    const text = [
      report.sessionTitle,
      report.summary,
      report.highlights.join(" "),
      report.participants.join(" "),
      report.locationLabel ?? "",
    ].join(" ");

    const signal: FactionBoardSignal = {
      id: report._id?.toString() ?? report.sessionId,
      sessionId: report.sessionId,
      title: report.sessionTitle,
      summary: report.summary,
      href: `/erp/sessions/report/${report._id?.toString() ?? report.sessionId}`,
      updatedAt: report.updatedAt.toISOString(),
    };

    for (const code of TRACKED_NODE_CODES) {
      if (textMatchesFaction(text, code)) {
        if (!signalBuckets[code]) signalBuckets[code] = [];
        signalBuckets[code].push(signal);
      }
    }
  }

  for (const signals of Object.values(signalBuckets)) {
    signals.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const boardNodes = buildBoardNodes(
    groupCounts,
    contactBuckets,
    wikiBuckets,
    signalBuckets,
  );
  const totals: FactionBoardTotals = {
    nodeCount: boardNodes.length,
    factionCount: EXTERNAL_FACTION_CODES.length,
    internalCount: INTERNAL_NODE_CODES.length,
    subOrgCount: EXTERNAL_SUB_ORGS.length,
    memberCount: visibleTrackedMemberCount,
    contactCount: visibleTrackedMemberCount,
    wikiCount: Object.values(wikiBuckets).reduce((sum, links) => sum + links.length, 0),
    signalCount: Object.values(signalBuckets).reduce(
      (sum, signals) => sum + signals.length,
      0,
    ),
  };

  const data: FactionBoardData = {
    boardNodes,
    relationships: RELATIONSHIPS,
    contactsByCode: contactBuckets,
    wikiLinksByCode: wikiBuckets,
    signalsByCode: signalBuckets,
    totals,
    generatedAt: new Date().toISOString(),
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
