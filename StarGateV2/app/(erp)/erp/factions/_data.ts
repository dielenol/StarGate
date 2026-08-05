import type { Character, FactionCode, InstitutionCode } from "@/types/character";
import { FACTIONS, INSTITUTIONS } from "@/types/character";
import type { UserRole } from "@/types/user";
import type { FactionDoc, InstitutionDoc } from "@stargate/shared-db/schemas";

import { hasRole } from "@/lib/auth/rbac";
import { listCharacterRefs } from "@/lib/db/characters";
import { listFactionFavorabilityOverrides } from "@/lib/db/faction-favorability";
import {
  countLoreSignals,
  listLoreOrganizations,
} from "@/lib/db/lore-organizations";
import { getTopLevelGroup } from "@/lib/org-structure";

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
} from "@/types/erp-realtime";

const EXTERNAL_FACTION_CODES = ["COUNCIL", "MILITARY", "CIVIL"] as const;
const HOSTILE_FACTION_CODE = "HOSTILE" as const;
const INTERNAL_NODE_CODES = ["NOVUS_ORDO", "SECRETARIAT", "MANUS"] as const;

const TRACKED_NODE_CODES = [
  ...EXTERNAL_FACTION_CODES,
  HOSTILE_FACTION_CODE,
  ...EXTERNAL_SUB_ORGS.map((org) => org.code),
  ...INTERNAL_NODE_CODES,
] as const;

export const DEFAULT_FACTION_FAVORABILITY_BY_CODE: Record<string, number> = {
  COUNCIL: 3,
  MILITARY: 4,
  CIVIL: 5,
  HOSTILE: 0,
  WHITE_ROSE: 10,
  SPACE_ZERO: 3,
  USA: 4,
  NOGA: 0,
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

/**
 * 소속 버킷 판정이 소비하는 최소 필드 — `listCharacterRefs()` projection 과
 * full `Character` 모두 만족한다.
 */
type FactionMemberRef = Pick<
  Character,
  "department" | "factionCode" | "institutionCode"
>;

function resolveExternalSubOrg(c: FactionMemberRef) {
  return (
    getExternalSubOrg(c.department ?? "") ??
    getExternalSubOrg(c.factionCode ?? "") ??
    getExternalSubOrg(c.institutionCode ?? "")
  );
}

function resolvePrimaryGroup(c: FactionMemberRef): string | null {
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

  if (c.factionCode) return c.factionCode;

  return null;
}

function getContactBucketCodes(
  c: FactionMemberRef,
  trackedCodes: ReadonlySet<string>,
): string[] {
  const primary = resolvePrimaryGroup(c);
  if (!primary || !trackedCodes.has(primary)) return [];

  const codes = new Set<string>([primary]);
  const externalSubOrg = resolveExternalSubOrg(c);
  if (externalSubOrg) codes.add(externalSubOrg.code);

  if (primary === "SECRETARIAT" || primary === "MANUS") {
    codes.add("NOVUS_ORDO");
  }

  return [...codes];
}

function keywordSetFor(
  code: string,
  factionByCode: ReadonlyMap<string, FactionDoc>,
  institutionByCode: ReadonlyMap<string, InstitutionDoc>,
): string[] {
  const faction = FACTIONS.find((f) => f.code === code);
  const institution = INSTITUTIONS.find((inst) => inst.code === code);
  const loreFaction = factionByCode.get(code);
  const loreInstitution = institutionByCode.get(code);
  const subOrg = getExternalSubOrg(code);
  const subUnitLabels =
    (loreInstitution?.subUnits ?? institution?.subUnits)?.flatMap((unit) => [
      unit.code,
      unit.label,
      "labelEn" in unit ? unit.labelEn : undefined,
    ]) ?? [];
  const keywords = [
    code,
    faction?.label,
    faction?.labelEn,
    institution?.label,
    institution?.labelEn,
    loreFaction?.label,
    loreFaction?.labelEn,
    ...(loreFaction?.tags ?? []),
    loreInstitution?.label,
    loreInstitution?.labelEn,
    ...(loreInstitution?.tags ?? []),
    subOrg?.label,
    subOrg?.labelEn,
    ...subUnitLabels,
  ].filter((value): value is string => Boolean(value));

  if (
    EXTERNAL_FACTION_CODES.includes(
      code as (typeof EXTERNAL_FACTION_CODES)[number],
    )
  ) {
    for (const org of EXTERNAL_SUB_ORGS.filter(
      (entry) => entry.parentCode === code,
    )) {
      keywords.push(org.code, org.label, org.labelEn);
    }
  }

  if (code === HOSTILE_FACTION_CODE) {
    for (const org of EXTERNAL_SUB_ORGS.filter(
      (entry) => entry.parentCode === HOSTILE_FACTION_CODE,
    )) {
      keywords.push(org.code, org.label, org.labelEn);
    }
  }

  if (code === "NOVUS_ORDO") {
    keywords.push("노부스 오르도", "Novus Ordo", "사무국", "MANUS", "현장요원");
  }

  return [...new Set(keywords.map((value) => value.toLowerCase()))];
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
  factionDocs: FactionDoc[],
  institutionDocs: InstitutionDoc[],
): FactionBoardNode[] {
  const factionByCode = new Map(factionDocs.map((doc) => [doc.code, doc]));
  const institutionByCode = new Map(
    institutionDocs.map((doc) => [doc.code, doc]),
  );

  const externalNodes = EXTERNAL_FACTION_CODES.map((code) => {
    const faction = FACTIONS.find((f) => f.code === code);
    const lore = factionByCode.get(code);
    const briefing = EXTERNAL_FACTION_BRIEFING[code];
    return addStats(
      {
        code,
        label: lore?.label ?? faction?.label ?? code,
        labelEn: lore?.labelEn ?? faction?.labelEn ?? code,
        kind: "external",
        scopeLabel: briefing.scopeLabel,
        parentCode: null,
        summary: lore?.summary ?? briefing.summary,
        doctrine: lore?.ideology ?? briefing.doctrine,
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
    (org) => org.parentCode !== HOSTILE_FACTION_CODE,
  ).map((org) => {
    const loreFaction = factionByCode.get(org.code);
    const loreInstitution = institutionByCode.get(org.code);
    return addStats(
      {
        code: org.code,
        label: loreFaction?.label ?? loreInstitution?.label ?? org.label,
        labelEn:
          loreFaction?.labelEn ?? loreInstitution?.labelEn ?? org.labelEn,
        kind: "branch",
        scopeLabel: `${org.parentLabel} 하위 세력`,
        parentCode: org.parentCode,
        parentLabel: org.parentLabel,
        summary: loreFaction?.summary ?? loreInstitution?.summary ?? org.summary,
        doctrine:
          loreFaction?.ideology ?? loreInstitution?.mission ?? org.doctrine,
        logoUrl: BOARD_LOGO_BY_CODE[org.code] ?? org.logoUrl,
      },
      groupCounts,
      wikiCounts,
      signalCounts,
      favorabilityByCode,
    );
  });

  const hostileFaction = FACTIONS.find((f) => f.code === HOSTILE_FACTION_CODE);
  const hostileLore = factionByCode.get(HOSTILE_FACTION_CODE);
  const hostileNode = addStats(
    {
      code: HOSTILE_FACTION_CODE,
      label: hostileLore?.label ?? hostileFaction?.label ?? "적대세력",
      labelEn:
        hostileLore?.labelEn ?? hostileFaction?.labelEn ?? "Hostile Forces",
      kind: "hostile",
      scopeLabel: "적대세력 분류",
      parentCode: null,
      summary:
        hostileLore?.summary ?? "작전상 적대 또는 충돌 대상으로 분류되는 세력",
      doctrine:
        hostileLore?.ideology ?? FACTION_DOCTRINE[HOSTILE_FACTION_CODE],
      logoUrl: FACTION_LOGO[HOSTILE_FACTION_CODE],
    },
    groupCounts,
    wikiCounts,
    signalCounts,
    favorabilityByCode,
  );

  const hostileBranchNodes = EXTERNAL_SUB_ORGS.filter(
    (org) => org.parentCode === HOSTILE_FACTION_CODE,
  ).map((org) => {
    const loreFaction = factionByCode.get(org.code);
    const loreInstitution = institutionByCode.get(org.code);
    return addStats(
      {
        code: org.code,
        label: loreFaction?.label ?? loreInstitution?.label ?? org.label,
        labelEn:
          loreFaction?.labelEn ?? loreInstitution?.labelEn ?? org.labelEn,
        kind: "hostile",
        scopeLabel: "적대 하위 세력",
        parentCode: org.parentCode,
        parentLabel: org.parentLabel,
        summary: loreFaction?.summary ?? loreInstitution?.summary ?? org.summary,
        doctrine:
          loreFaction?.ideology ?? loreInstitution?.mission ?? org.doctrine,
        logoUrl: BOARD_LOGO_BY_CODE[org.code] ?? org.logoUrl,
      },
      groupCounts,
      wikiCounts,
      signalCounts,
      favorabilityByCode,
    );
  });

  const novusOrdo = FACTIONS.find((f) => f.code === "NOVUS_ORDO");
  const novusLore = factionByCode.get("NOVUS_ORDO");
  const internalInstitutionCodes = [
    ...new Set([
      ...INSTITUTIONS.map((institution) => institution.code as string),
      ...institutionDocs
        .filter((institution) => institution.parentFactionCode === "NOVUS_ORDO")
        .map((institution) => institution.code),
    ]),
  ];
  const internalNodes = [
    addStats(
      {
        code: "NOVUS_ORDO",
        label: novusLore?.label ?? novusOrdo?.label ?? "노부스 오르도",
        labelEn:
          novusLore?.labelEn ?? novusOrdo?.labelEn ?? "Novus Ordo",
        kind: "internal",
        scopeLabel: "내부 본부",
        parentCode: null,
        summary: novusLore?.summary ?? "본부 통할",
        doctrine: novusLore?.ideology ?? FACTION_DOCTRINE.NOVUS_ORDO,
        logoUrl: FACTION_LOGO.NOVUS_ORDO,
      },
      groupCounts,
      wikiCounts,
      signalCounts,
      favorabilityByCode,
    ),
    ...internalInstitutionCodes.map((code) => {
      const institution = INSTITUTIONS.find((entry) => entry.code === code);
      const lore = institutionByCode.get(code);
      const subUnitCount =
        lore?.subUnits?.length ?? institution?.subUnits.length ?? 0;
      return addStats(
        {
          code,
          label: lore?.label ?? institution?.label ?? code,
          labelEn: lore?.labelEn ?? institution?.labelEn ?? code,
          kind: "internal",
          scopeLabel: "내부 기관",
          parentCode: "NOVUS_ORDO",
          parentLabel: "노부스 오르도",
          summary: lore?.summary ?? `${subUnitCount}개 하위 기구`,
          doctrine:
            lore?.mission ??
            INSTITUTION_DOCTRINE[code as InstitutionCode] ??
            "기관 임무 정보 없음",
          logoUrl: INSTITUTION_LOGO,
          subUnitCount,
        },
        groupCounts,
        wikiCounts,
        signalCounts,
        favorabilityByCode,
      );
    }),
  ];

  const knownNodes = [
    ...externalNodes,
    ...branchNodes,
    hostileNode,
    ...hostileBranchNodes,
    ...internalNodes,
  ];
  const representedCodes = new Set(knownNodes.map((node) => node.code));
  const supplementalFactionNodes = factionDocs
    .filter((faction) => !representedCodes.has(faction.code))
    .map((faction) => {
      representedCodes.add(faction.code);
      return addStats(
        {
          code: faction.code,
          label: faction.label,
          labelEn: faction.labelEn ?? faction.code,
          kind: faction.scope === "internal" ? "internal" : "external",
          scopeLabel:
            faction.scope === "internal" ? "내부 본부" : "외부 권력 블록",
          parentCode: null,
          summary: faction.summary,
          doctrine: faction.ideology ?? "교리 정보 없음",
          logoUrl: FACTION_LOGO[faction.code as FactionCode],
        },
        groupCounts,
        wikiCounts,
        signalCounts,
        favorabilityByCode,
      );
    });
  const supplementalInstitutionNodes = institutionDocs
    .filter((institution) => !representedCodes.has(institution.code))
    .map((institution) => {
      const parentCode = institution.parentFactionCode ?? null;
      const parent = parentCode ? factionByCode.get(parentCode) : undefined;
      return addStats(
        {
          code: institution.code,
          label: institution.label,
          labelEn: institution.labelEn ?? institution.code,
          kind: parentCode === "NOVUS_ORDO" ? "internal" : "branch",
          scopeLabel:
            parentCode === "NOVUS_ORDO" ? "내부 기관" : "외부 하위 세력",
          parentCode,
          parentLabel: parent?.label,
          summary: institution.summary,
          doctrine: institution.mission ?? "기관 임무 정보 없음",
          logoUrl: INSTITUTION_LOGO,
          subUnitCount: institution.subUnits?.length ?? 0,
        },
        groupCounts,
        wikiCounts,
        signalCounts,
        favorabilityByCode,
      );
    });

  return [
    ...knownNodes,
    ...supplementalFactionNodes,
    ...supplementalInstitutionNodes,
  ];
}

export async function getFactionBoardData(
  role: UserRole,
): Promise<FactionBoardData> {
  const isGM = hasRole(role, "GM");
  const canSeePrivateLore = hasRole(role, "V");
  const [rawCharacters, organizationSnapshot, favorabilityOverrides] =
    await Promise.all([
      listCharacterRefs().catch(() => []),
      listLoreOrganizations(canSeePrivateLore).catch(() => ({
        factions: [],
        institutions: [],
      })),
      listFactionFavorabilityOverrides().catch(() => ({})),
    ]);
  const factionByCode = new Map(
    organizationSnapshot.factions.map((doc) => [doc.code, doc]),
  );
  const institutionByCode = new Map(
    organizationSnapshot.institutions.map((doc) => [doc.code, doc]),
  );
  const trackedCodes = new Set<string>([
    ...TRACKED_NODE_CODES,
    ...factionByCode.keys(),
    ...institutionByCode.keys(),
  ]);
  const keywordsByCode = Object.fromEntries(
    [...trackedCodes].map((code) => [
      code,
      keywordSetFor(code, factionByCode, institutionByCode),
    ]),
  );
  const signalCounts = await countLoreSignals({
    role,
    includePrivateWiki: canSeePrivateLore,
    keywordsByCode,
  }).catch(() => ({
    wiki: Object.fromEntries([...trackedCodes].map((code) => [code, 0])),
    reports: Object.fromEntries([...trackedCodes].map((code) => [code, 0])),
    source: "domain-fallback" as const,
  }));

  const visibleCharacters = isGM
    ? rawCharacters
    : rawCharacters.filter((c) => c.isPublic !== false);

  const groupCounts: Record<string, number> = {};
  let visibleTrackedMemberCount = 0;

  for (const raw of visibleCharacters) {
    const primaryGroup = resolvePrimaryGroup(raw);
    const bucketCodes = getContactBucketCodes(raw, trackedCodes);
    if (bucketCodes.length === 0 || !primaryGroup) continue;

    visibleTrackedMemberCount += 1;

    for (const code of bucketCodes) {
      groupCounts[code] = (groupCounts[code] ?? 0) + 1;
    }
  }

  const wikiCounts = signalCounts.wiki;
  const reportCounts = signalCounts.reports;
  const boardNodes = buildBoardNodes(
    groupCounts,
    wikiCounts,
    reportCounts,
    {
      ...DEFAULT_FACTION_FAVORABILITY_BY_CODE,
      ...favorabilityOverrides,
    },
    organizationSnapshot.factions,
    organizationSnapshot.institutions,
  );
  const totals: FactionBoardTotals = {
    nodeCount: boardNodes.length,
    factionCount: boardNodes.filter(
      (node) => node.parentCode === null && node.code !== "NOVUS_ORDO",
    ).length,
    internalCount: boardNodes.filter((node) => node.kind === "internal").length,
    subOrgCount: boardNodes.filter(
      (node) => node.parentCode !== null && node.kind !== "internal",
    ).length,
    memberCount: visibleTrackedMemberCount,
    contactCount: visibleTrackedMemberCount,
    wikiCount: Object.values(wikiCounts).reduce((sum, count) => sum + count, 0),
    signalCount: Object.values(reportCounts).reduce(
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
