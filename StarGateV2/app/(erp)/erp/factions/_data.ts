import type { Character, FactionCode, InstitutionCode } from "@/types/character";
import { FACTIONS, INSTITUTIONS } from "@/types/character";
import type { UserRole } from "@/types/user";

import { hasRole } from "@/lib/auth/rbac";
import { listCharacters } from "@/lib/db/characters";
import { listFactionFavorabilityOverrides } from "@/lib/db/faction-favorability";
import { listSessionReports } from "@/lib/db/session-reports";
import { listWikiPages } from "@/lib/db/wiki";
import { getTopLevelGroup, isFaction } from "@/lib/org-structure";

import {
  EXTERNAL_SUB_ORGS,
  FACTION_DOCTRINE,
  FACTION_LOGO,
  INSTITUTION_DOCTRINE,
  INSTITUTION_LOGO,
  getExternalSubOrg,
} from "../personnel/_constants";

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

export const DEFAULT_FACTION_FAVORABILITY_BY_CODE: Record<string, number> = {
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

const EXTERNAL_FACTION_BRIEFING: Record<
  (typeof EXTERNAL_FACTION_CODES)[number],
  {
    scopeLabel: string;
    doctrine: string;
    summary: string;
    briefingPoints: readonly string[];
  }
> = {
  COUNCIL: {
    scopeLabel: "후원·의결 권력",
    doctrine: "현상 유지 · 공리주의 · 후원/의결 압력",
    summary:
      "세계의 부 98%와 각 정부 실세의 권력망을 배경으로 노부스 오르도에 후원금, 정치적 승인, 의결 압력을 제공한다.",
    briefingPoints: [
      "후원금과 의결 보고 라인을 통해 본부 정책 방향에 압력을 행사한다.",
      "노부스 오르도가 자신들의 권력을 지켜주길 원하지만, 본부 권한 비대화는 경계한다.",
      "블랑셰 데 로랑과 로샹 재단은 이사회 재정 영향력의 대표 사례로 기록된다.",
    ],
  },
  MILITARY: {
    scopeLabel: "군사·봉쇄 권력",
    doctrine: "전통 복고 · 권위주의 · 선제 격리",
    summary:
      "광원화 사태 이전부터 이어진 국가 군사 권력의 총합. 각국 군부와 정보기관의 영향력을 바탕으로 무장 대응과 선제 격리를 선호한다.",
    briefingPoints: [
      "노부스 오르도의 조율주의와 MANUS 중심 현장 대응 체계를 불편하게 여긴다.",
      "Zulu 및 이상 현상에는 봉쇄, 선제 격리, 무장 대응을 우선한다.",
      "오로라 바이러스 이후 독자 대응 국가 움직임을 군부 주도 재편의 명분으로 활용한다.",
    ],
  },
  CIVIL: {
    scopeLabel: "민간·여론 권력",
    doctrine: "진보주의 · 인본주의 · 여론/시장 압력",
    summary:
      "지구 대부분을 차지하는 민간 권위의 총칭. 여론, 시장, NGO, 언론, 기업 집단을 통해 본부와 군부 양쪽을 견제한다.",
    briefingPoints: [
      "기술 진보와 생존을 바라지만, 통제주의와 비인도적 선택에는 여론으로 반발한다.",
      "공식 지휘권보다 자본, 언론, 피해자 운동, 시민 외교 채널로 영향력을 행사한다.",
      "백장미단은 공개와 권리를, 스페이스 제로는 기술 자본과 시장 확장을 대표한다.",
    ],
  },
} as const;

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
    const briefing = EXTERNAL_FACTION_BRIEFING[code];
    return addStats(
      {
        code,
        label: faction?.label ?? code,
        labelEn: faction?.labelEn ?? code,
        kind: "external",
        scopeLabel: briefing.scopeLabel,
        parentCode: null,
        summary: briefing.summary,
        doctrine: briefing.doctrine,
        briefingPoints: briefing.briefingPoints,
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

export async function getFactionBoardData(
  role: UserRole,
): Promise<FactionBoardData> {
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

    const text = `${page.title} ${page.category} ${page.tags.join(" ")} ${
      page.content
    }`;

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

  const boardNodes = buildBoardNodes(groupCounts, wikiCounts, signalCounts, {
    ...DEFAULT_FACTION_FAVORABILITY_BY_CODE,
    ...favorabilityOverrides,
  });
  const totals: FactionBoardTotals = {
    nodeCount: boardNodes.length,
    factionCount: EXTERNAL_FACTION_CODES.length + 1,
    internalCount: INTERNAL_NODE_CODES.length,
    subOrgCount: EXTERNAL_SUB_ORGS.length,
    memberCount: visibleTrackedMemberCount,
    contactCount: visibleTrackedMemberCount,
    wikiCount: Object.values(wikiCounts).reduce((sum, count) => sum + count, 0),
    signalCount: Object.values(signalCounts).reduce(
      (sum, count) => sum + count,
      0,
    ),
  };

  return {
    boardNodes,
    totals,
    generatedAt: new Date().toISOString(),
    canEditFavorability: isGM,
  };
}

export function findFactionBoardNode(
  data: FactionBoardData,
  code: string,
): FactionBoardNode | undefined {
  const normalizedCode = code.trim().toUpperCase();
  return data.boardNodes.find((node) => node.code === normalizedCode);
}
