"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { AgentLevel, Character } from "@/types/character";
import { FACTIONS, INSTITUTIONS, INTERNAL_FACTION_CODE } from "@/types/character";

import { usePersonnelQuery } from "@/hooks/queries/useCharactersQuery";

import {
  canViewField,
  canViewRealName,
  compareLevels,
  FIELD_GROUP_ORDER,
  FIELD_REQUIRED_LEVEL,
  getLevelDisplayRank,
  getLevelDisplayTotal,
  getLevelRank,
} from "@/lib/personnel";
import {
  getDepartmentLabel,
  getFactionScope,
  getGroupLabel,
  getSubUnits,
  getTopLevelGroup,
  isInternalOrgCode,
  isFaction,
  isInstitution,
} from "@/lib/org-structure";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PageHead from "@/components/ui/PageHead/PageHead";

import ClearanceStrip from "./_components/ClearanceStrip";
import GroupHero from "./_components/GroupHero";
import OrgCanvas from "./_components/OrgCanvas";
import OrgDrillCrumbs from "./_components/OrgDrillCrumbs";
import type { DrillCrumbItem } from "./_components/OrgDrillCrumbs";
import {
  getFactionIcon,
  getInstitutionIcon,
  getSubUnitIcon,
} from "./_components/OrgIcon";
import PersonnelCard from "./_components/PersonnelCard";
import SearchJumpBanner from "./_components/SearchJumpBanner";
import SubUnitAccordion from "./_components/SubUnitAccordion";

import {
  EXTERNAL_SUB_ORGS,
  getExternalSubOrg,
  getFactionDoctrine,
  getFactionLogo,
  getInstitutionDoctrine,
  INSTITUTION_LOGO,
  INSTITUTION_OVERSIGHT,
  isExternalSubOrg,
} from "./_constants";

import styles from "./page.module.css";

/* ── 상수 ── */

const UNASSIGNED_CODE = "UNASSIGNED";
const CLASSIFIED_VALUE = "[CLASSIFIED]";

/* 등급 legend — globals.css 의 `--rank-*` 팔레트와 라벨 체계가 1:1.
 * GM은 세계관 외부 메타 권한이라 범례에서 제외 (V~U 7단만 노출). */
const LEGEND_ITEMS: { level: AgentLevel; label: string }[] = [
  { level: "V", label: "VIP" },
  { level: "A", label: "최종 관리자" },
  { level: "M", label: "부서 관리자" },
  { level: "H", label: "부서 특수요원" },
  { level: "G", label: "부서 요원" },
  { level: "J", label: "부서 평사원" },
  { level: "U", label: "소모품" },
];

type SubUnitItem = { code: string; label: string };

/* ── 헬퍼 ── */

/**
 * 캐릭터가 속한 최상위 그룹 코드 (외부 기관/내부 기관/UNASSIGNED).
 *
 * Phase 1 후 factionCode / institutionCode 는 AGENT/NPC 공통 root 필드로 승격되었으므로
 * type 분기 없이 동일 로직 적용.
 */
function resolveGroup(c: Character): string {
  const externalSubOrg = resolveExternalSubOrg(c);
  if (externalSubOrg) return externalSubOrg.parentCode;

  const dept = c.department;
  if (dept && dept !== UNASSIGNED_CODE) {
    const top = getTopLevelGroup(dept);
    if (top !== UNASSIGNED_CODE) return top;
  }

  if (c.institutionCode) {
    const top = getTopLevelGroup(c.institutionCode);
    return top !== UNASSIGNED_CODE ? top : c.institutionCode;
  }
  if (c.factionCode && isFaction(c.factionCode)) {
    return c.factionCode;
  }

  return UNASSIGNED_CODE;
}

function resolveExternalSubOrg(c: Character) {
  return (
    getExternalSubOrg(c.department ?? "") ??
    getExternalSubOrg(c.factionCode ?? "") ??
    getExternalSubOrg(c.institutionCode ?? "")
  );
}

function resolveSubUnitCode(c: Character): string | null {
  return resolveExternalSubOrg(c)?.code ?? c.department ?? null;
}

function characterUsesAgentLevels(c: Character): boolean {
  return isInternalOrgCode(resolveGroup(c));
}

function getDisplaySubUnits(groupCode: string): readonly SubUnitItem[] {
  if (groupCode === "CIVIL") {
    return EXTERNAL_SUB_ORGS.filter((org) => org.parentCode === groupCode).map(
      (org) => ({ code: org.code, label: org.label }),
    );
  }
  return getSubUnits(groupCode);
}

/** 같은 그룹/서브유닛 내부 카드 정렬: 등급 내림차순 → codename 오름차순 */
function compareForCardOrder(a: Character, b: Character): number {
  if (characterUsesAgentLevels(a) && characterUsesAgentLevels(b)) {
    const levelCmp = compareLevels(b.agentLevel ?? "J", a.agentLevel ?? "J");
    if (levelCmp !== 0) return levelCmp;
  }
  return a.codename.localeCompare(b.codename, "en");
}

/** clearance 가 못 보는 필드 그룹 개수 */
function countHiddenFields(clearance: AgentLevel): number {
  return FIELD_GROUP_ORDER.filter((g) => !canViewField(clearance, g)).length;
}

/** 숨겨진 필드 그룹 중 가장 낮은 요구 등급 (예: H 필요 / M 필요 이면 "H") */
function lowestRequiredForHidden(clearance: AgentLevel): AgentLevel | undefined {
  const required = FIELD_GROUP_ORDER.filter((g) => !canViewField(clearance, g)).map(
    (g) => FIELD_REQUIRED_LEVEL[g],
  );
  if (required.length === 0) return undefined;
  const [first, ...rest] = required;
  return rest.reduce<AgentLevel>(
    (min, cur) => (getLevelRank(cur) < getLevelRank(min) ? cur : min),
    first,
  );
}

/** 그룹 종류 판정 */
function getGroupKind(code: string): "faction" | "institution" | "unassigned" {
  if (code === UNASSIGNED_CODE) return "unassigned";
  if (isFaction(code)) return "faction";
  if (isExternalSubOrg(code)) return "faction";
  if (isInstitution(code)) return "institution";
  return "unassigned";
}

function getDisplayGroupLabel(code: string): string {
  return getExternalSubOrg(code)?.label ?? getGroupLabel(code);
}

/** 그룹의 labelEn 찾기 (subUnit 은 labelEn 이 없으므로 label 반환) */
function getGroupLabelEn(code: string): string {
  const externalSubOrg = getExternalSubOrg(code);
  if (externalSubOrg) return externalSubOrg.labelEn;

  const f = FACTIONS.find((x) => x.code === code);
  if (f) return f.labelEn;
  const inst = INSTITUTIONS.find((x) => x.code === code);
  if (inst) return inst.labelEn;
  if (code === UNASSIGNED_CODE) return "Unassigned";
  return code;
}

function textMatchesQuery(
  value: string | undefined | null,
  query: string,
): boolean {
  return Boolean(
    value &&
      value !== CLASSIFIED_VALUE &&
      value.toLowerCase().includes(query),
  );
}

/* ── Props ── */

interface Props {
  initialCharacters: Character[];
  clearance: AgentLevel;
}

/* ── Component ── */

export default function PersonnelClient({
  initialCharacters,
  clearance,
}: Props) {
  const { data: characters = [] } = usePersonnelQuery({
    initialData: initialCharacters,
  });

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState("");
  /* state 는 URL search params(?group=&sub=) 의 mirror.
     - 명시 인터랙션(카드/sub-unit 클릭) → router.push 로 history 에 entry 적재
     - 검색 자동 drill-down → router.replace 로 history 폭주 방지
     - useEffect 가 searchParams 변경(뒤로가기/앞으로가기 포함) 시 state 자동 sync
     state setter 는 optimistic update 용도로만 직접 호출. */
  const [selectedGroup, setSelectedGroup] = useState<string | null>(
    () => searchParams.get("group"),
  );
  const [expandedSubUnit, setExpandedSubUnit] = useState<string | null>(
    () => searchParams.get("sub"),
  );

  /* searchParams ↔ state 단방향 sync. 뒤로가기/앞으로가기 시 URL 이 바뀌면 state 자동 추종.
     내부 router.push 직후에도 호출되지만 같은 값이라 React 가 re-render skip. */
  useEffect(() => {
    setSelectedGroup(searchParams.get("group"));
    setExpandedSubUnit(searchParams.get("sub"));
  }, [searchParams]);

  /** ?group=&sub= 으로 URL build. 빈 값은 omit. */
  const buildUrl = useCallback(
    (group: string | null, sub: string | null) => {
      const params = new URLSearchParams();
      if (group) params.set("group", group);
      if (sub) params.set("sub", sub);
      const q = params.toString();
      return q ? `${pathname}?${q}` : pathname;
    },
    [pathname],
  );

  /** drill state navigation 단일 진입점.
   *  - replace=false (default): 명시 인터랙션 — history entry 적재 → 뒤로가기 가능
   *  - replace=true: 검색 자동 drill-down 등 외부 트리거 — history 적재 안 함 */
  const navigateDrill = useCallback(
    (group: string | null, sub: string | null, replace = false) => {
      // optimistic update — searchParams 갱신 전에도 즉시 UI 반응
      setSelectedGroup(group);
      setExpandedSubUnit(sub);
      const url = buildUrl(group, sub);
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [buildUrl, router],
  );

  useEffect(() => {
    if (!selectedGroup) return;
    const externalSubOrg = getExternalSubOrg(selectedGroup);
    if (!externalSubOrg) return;
    navigateDrill(externalSubOrg.parentCode, externalSubOrg.code, true);
  }, [navigateDrill, selectedGroup]);

  const prevQueryRef = useRef("");

  const showIdentity = canViewField(clearance, "identity");
  const showRealName = canViewRealName(clearance);
  const hiddenFieldsCount = countHiddenFields(clearance);
  const hiddenMinLevel = lowestRequiredForHidden(clearance);

  /* 그룹별 인덱스 (AGENT / NPC 구분 없이 세계관 내 모든 인물) */
  const groupIndex = useMemo(() => {
    const map = new Map<string, Character[]>();
    for (const c of characters) {
      const g = resolveGroup(c);
      const bucket = map.get(g);
      if (bucket) bucket.push(c);
      else map.set(g, [c]);
    }
    return map;
  }, [characters]);

  /* 하위 기구별 인덱스 (institution 산하) */
  const subUnitIndex = useMemo(() => {
    const map = new Map<string, Character[]>();
    for (const inst of INSTITUTIONS) {
      for (const sub of inst.subUnits) {
        map.set(sub.code, []);
      }
    }
    for (const org of EXTERNAL_SUB_ORGS) {
      map.set(org.code, []);
    }
    for (const c of characters) {
      const subUnitCode = resolveSubUnitCode(c);
      if (!subUnitCode) continue;
      const bucket = map.get(subUnitCode);
      if (bucket) bucket.push(c);
    }
    return map;
  }, [characters]);

  /* 검색 매칭 */
  const searchMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        ids: new Set<string>(),
        groupCounts: new Map<string, number>(),
        subUnitCounts: new Map<string, number>(),
      };
    }

    const matched = characters.filter((c) => {
      if (c.codename.toLowerCase().includes(q)) return true;
      if (c.role && c.role.toLowerCase().includes(q)) return true;

      const deptLabel = c.department
        ? getDepartmentLabel(c.department).toLowerCase()
        : "";
      if (deptLabel.includes(q)) return true;

      if (showIdentity && textMatchesQuery(c.lore.nickname, q)) return true;
      if (showRealName && textMatchesQuery(c.lore.name, q)) return true;
      if (showRealName && textMatchesQuery(c.lore.nameNative, q)) return true;
      if (showRealName && textMatchesQuery(c.lore.nameEn, q)) return true;
      if (
        showIdentity &&
        (c.lore.loreTags ?? []).some((tag) => textMatchesQuery(tag, q))
      ) {
        return true;
      }

      return false;
    });

    const ids = new Set(matched.map((c) => String(c._id)));
    const groupCounts = new Map<string, number>();
    const subUnitCounts = new Map<string, number>();
    for (const c of matched) {
      const g = resolveGroup(c);
      groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);

      const subUnitCode = resolveSubUnitCode(c);
      if (subUnitCode && subUnitCode !== g) {
        subUnitCounts.set(
          subUnitCode,
          (subUnitCounts.get(subUnitCode) ?? 0) + 1,
        );
      }
    }

    return { ids, groupCounts, subUnitCounts };
  }, [characters, query, showIdentity, showRealName]);

  /* 검색어 변화 → 자동 드릴다운 / 조감 복귀 */
  useEffect(() => {
    const prev = prevQueryRef.current;
    const curr = query.trim();
    prevQueryRef.current = curr;

    if (!curr) {
      // 검색 비움 → 조감 복귀 (replace 로 history 적재 X)
      if (prev) {
        navigateDrill(null, null, true);
      }
      return;
    }

    if (prev === curr) return;

    // 매칭 최다 그룹 자동 선택 (현재 selectedGroup 에 매칭이 있으면 유지)
    if (searchMatches.groupCounts.size === 0) return;

    const entries = [...searchMatches.groupCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    );
    const [topGroup] = entries[0];

    const nextGroup =
      selectedGroup && searchMatches.groupCounts.has(selectedGroup)
        ? selectedGroup
        : topGroup;

    // 하위 기구가 있는 그룹이면 매칭 최다 subUnit 자동 펼침
    let nextSub: string | null = null;
    const nextSubUnits = getDisplaySubUnits(nextGroup);
    if (nextSubUnits.length > 0) {
      const subEntries = [...searchMatches.subUnitCounts.entries()]
        .filter(([code]) => nextSubUnits.some((u) => u.code === code))
        .sort((a, b) => b[1] - a[1]);
      if (subEntries.length > 0) {
        nextSub = subEntries[0][0];
      }
    }

    navigateDrill(nextGroup, nextSub, true);
    // query/searchMatches 변화에만 트리거. selectedGroup 을 deps 에 넣지 않는 이유:
    // 사용자 수동 선택 직후 매칭 최다 그룹으로 되돌아가는 재귀 루프 방지.
    // prevGroup 이 매칭에 남아있으면 유지됨.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchMatches]);

  /* ── 이벤트 핸들러 — 모두 navigateDrill 경유로 URL 동기화 + history 적재.
        crumbs useMemo deps 안정성을 위해 useCallback 으로 reference 고정. ── */

  const handleSelectGroup = useCallback(
    (groupCode: string, subUnitCode: string | null = null) => {
      navigateDrill(groupCode, subUnitCode);
    },
    [navigateDrill],
  );

  const handleBackToOverview = useCallback(() => {
    navigateDrill(null, null);
  }, [navigateDrill]);

  const handleToggleSubUnit = useCallback(
    (code: string) => {
      const next = expandedSubUnit === code ? null : code;
      navigateDrill(selectedGroup, next);
      // accordion 펼치는 케이스에서만 스크롤 (이미 펼쳐진 chip 재클릭은 close 동작이라 스크롤 불필요).
      // DOM 갱신 후 동작하도록 다음 frame 에 schedule.
      if (next) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`subunit-${code}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }
    },
    [expandedSubUnit, navigateDrill, selectedGroup],
  );

  /* ── 파생 값 ── */

  // OrgCanvas 용 groupCounts (외부 기관 3 + 내부 기관 2 + UNASSIGNED).
  // NOVUS_ORDO 본부 박스는 직속 캐릭터가 거의 없으므로 산하 SECRETARIAT+MANUS 합산을 노출.
  const canvasGroupCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const f of FACTIONS) counts[f.code] = groupIndex.get(f.code)?.length ?? 0;
    for (const i of INSTITUTIONS) counts[i.code] = groupIndex.get(i.code)?.length ?? 0;
    for (const org of EXTERNAL_SUB_ORGS) {
      counts[org.code] = subUnitIndex.get(org.code)?.length ?? 0;
    }
    counts[UNASSIGNED_CODE] = groupIndex.get(UNASSIGNED_CODE)?.length ?? 0;

    // 본부 박스: 본부 직속 + 산하 SECRETARIAT + 산하 MANUS 의 합산.
    const novusDirect = groupIndex.get(INTERNAL_FACTION_CODE)?.length ?? 0;
    const institutionsSum = INSTITUTIONS.reduce(
      (acc, inst) => acc + (groupIndex.get(inst.code)?.length ?? 0),
      0,
    );
    counts[INTERNAL_FACTION_CODE] = novusDirect + institutionsSum;

    return counts;
  }, [groupIndex, subUnitIndex]);

  // 그룹별 등급 분포 (agentLevel 있는 AGENT/NPC 모두 집계).
  // FACTIONS / INSTITUTIONS / UNASSIGNED 전 그룹 커버 — OrgCanvas 와 GroupHero 공용.
  // NOVUS_ORDO 키는 본부 직속 + 산하 INSTITUTIONS 의 키별 합산으로 덮어쓴다.
  const canvasGroupLevelCounts = useMemo<
    Record<string, Partial<Record<AgentLevel, number>>>
  >(() => {
    const counts: Record<string, Partial<Record<AgentLevel, number>>> = {};
    const codes = [
      ...FACTIONS.map((f) => f.code as string),
      ...INSTITUTIONS.map((i) => i.code as string),
      UNASSIGNED_CODE,
    ];
    for (const code of codes) {
      const bucket = groupIndex.get(code) ?? [];
      const dist: Partial<Record<AgentLevel, number>> = {};
      for (const c of bucket) {
        if (c.agentLevel) {
          dist[c.agentLevel] = (dist[c.agentLevel] ?? 0) + 1;
        }
      }
      counts[code] = dist;
    }

    // 본부 박스: 본부 직속 + 산하 INSTITUTIONS 의 키별 sum.
    const novusLevels: Partial<Record<AgentLevel, number>> = {
      ...(counts[INTERNAL_FACTION_CODE] ?? {}),
    };
    for (const inst of INSTITUTIONS) {
      const dist = counts[inst.code] ?? {};
      for (const [lv, n] of Object.entries(dist) as [AgentLevel, number][]) {
        novusLevels[lv] = (novusLevels[lv] ?? 0) + n;
      }
    }
    counts[INTERNAL_FACTION_CODE] = novusLevels;

    return counts;
  }, [groupIndex]);

  const unassignedSamples = useMemo(() => {
    const list = groupIndex.get(UNASSIGNED_CODE) ?? [];
    return list.slice(0, 3).map((c) => ({ codename: c.codename }));
  }, [groupIndex]);

  // 현재 선택 그룹 멤버 (정렬 포함).
  // NOVUS_ORDO 본부 박스: 본부 직속 + 산하 SECRETARIAT/MANUS 캐릭터 union.
  const selectedGroupMembers = useMemo(() => {
    if (!selectedGroup) return [] as Character[];

    if (selectedGroup === INTERNAL_FACTION_CODE) {
      const merged: Character[] = [
        ...(groupIndex.get(INTERNAL_FACTION_CODE) ?? []),
        ...INSTITUTIONS.flatMap((inst) => groupIndex.get(inst.code) ?? []),
      ];
      return merged.sort(compareForCardOrder);
    }

    const list = groupIndex.get(selectedGroup) ?? [];
    return [...list].sort(compareForCardOrder);
  }, [groupIndex, selectedGroup]);

  // 현재 선택 그룹의 하위 기구 목록.
  // NOVUS_ORDO 본부 박스: 산하 INSTITUTIONS 전체의 subUnits 를 평탄화.
  const selectedSubUnits = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup === INTERNAL_FACTION_CODE) {
      return INSTITUTIONS.flatMap((inst) =>
        inst.subUnits.map((u) => ({ code: u.code, label: u.label })),
      );
    }
    return getDisplaySubUnits(selectedGroup);
  }, [selectedGroup]);

  const selectedSubUnitCodes = useMemo(
    () => new Set(selectedSubUnits.map((u) => u.code)),
    [selectedSubUnits],
  );

  const selectedDirectMembers = useMemo(() => {
    if (!selectedGroup || selectedSubUnitCodes.size === 0) return [];
    return selectedGroupMembers.filter((member) => {
      const subUnitCode = resolveSubUnitCode(member);
      return !subUnitCode || !selectedSubUnitCodes.has(subUnitCode);
    });
  }, [selectedGroup, selectedGroupMembers, selectedSubUnitCodes]);

  const selectedGroupLabel = selectedGroup
    ? getDisplayGroupLabel(selectedGroup)
    : "";
  const selectedGroupLabelEn = selectedGroup ? getGroupLabelEn(selectedGroup) : "";
  const selectedGroupKind = selectedGroup
    ? getGroupKind(selectedGroup)
    : "faction";
  const selectedGroupUsesAgentLevels =
    !selectedGroup || isInternalOrgCode(selectedGroup);

  // 검색 배너 표시 조건 (L2 에서 다른 그룹에도 매칭이 있을 때)
  const searchBannerInfo = useMemo(() => {
    if (!selectedGroup || !query.trim() || searchMatches.ids.size === 0) {
      return null;
    }
    const total = searchMatches.ids.size;
    const currentGroupMatches = searchMatches.groupCounts.get(selectedGroup) ?? 0;

    const others = [...searchMatches.groupCounts.entries()]
      .filter(([code]) => code !== selectedGroup)
      .sort((a, b) => b[1] - a[1]);

    if (others.length === 0) {
      return { total, currentGroupMatches };
    }

    const [otherCode, otherCount] = others[0];
    return {
      total,
      currentGroupMatches,
      otherGroupCode: otherCode,
      otherGroupCount: otherCount,
    };
  }, [selectedGroup, query, searchMatches]);

  // 현재 drill 상태 breadcrumb
  const crumbs = useMemo<DrillCrumbItem[]>(() => {
    const items: DrillCrumbItem[] = [
      {
        key: "root",
        label: "조직도 · 전체",
        iconCode: "ROOT",
        on: !selectedGroup,
        onClick: selectedGroup ? handleBackToOverview : undefined,
      },
    ];

    // 외부 기관/본부/내부 기관이 선택된 경우에만 group crumb 추가 (미도달 placeholder 제거)
    if (selectedGroup) {
      const kind = getGroupKind(selectedGroup);

      // 내부 기관(SECRETARIAT/MANUS) 진입 시 그 위의 노부스 오르도 본부 단계도 함께 노출.
      // ROOT → 본부 → 내부 기관 → (하위 기구) 흐름으로 organization tree 의 위계를 crumb 로 표현.
      if (kind === "institution") {
        items.push({
          key: "headquarters",
          label: `본부: ${getGroupLabel(INTERNAL_FACTION_CODE)}`,
          iconCode: getFactionIcon(INTERNAL_FACTION_CODE),
          on: false,
          onClick: () => navigateDrill(INTERNAL_FACTION_CODE, null),
        });
      }

      // NOVUS_ORDO 는 FACTION 이지만 scope=internal → crumb prefix 는 "본부".
      const prefix =
        kind === "faction"
          ? isExternalSubOrg(selectedGroup)
            ? "시민사회 하위 조직"
            : getFactionScope(selectedGroup) === "internal"
              ? "본부"
              : "외부 기관"
          : kind === "institution"
            ? "내부 기관"
            : "미배정";
      const label =
        kind === "unassigned"
          ? "미배정"
          : `${prefix}: ${getDisplayGroupLabel(selectedGroup)}`;
      items.push({
        key: "group",
        label,
        iconCode:
          kind === "faction"
            ? isExternalSubOrg(selectedGroup)
              ? getFactionIcon("CIVIL")
              : getFactionIcon(selectedGroup)
            : kind === "institution"
              ? getInstitutionIcon(selectedGroup)
              : kind === "unassigned"
                ? "UNASSIGNED"
                : undefined,
        on: !expandedSubUnit,
        onClick: expandedSubUnit
          ? () => navigateDrill(selectedGroup, null)
          : undefined,
      });
    }

    // 하위 기구가 실제로 펼쳐졌을 때만 sub crumb 추가
    if (selectedGroup && expandedSubUnit && selectedSubUnits.length > 0) {
      const externalSubOrg = getExternalSubOrg(expandedSubUnit);
      const subLabel =
        selectedSubUnits.find((u) => u.code === expandedSubUnit)?.label ??
        expandedSubUnit;
      items.push({
        key: "sub",
        label: `하위: ${subLabel}`,
        iconCode: externalSubOrg ? undefined : getSubUnitIcon(expandedSubUnit),
        logoUrl: externalSubOrg?.logoUrl,
        logoVariant: externalSubOrg?.logoVariant,
        on: true,
      });
    }

    return items;
  }, [
    selectedGroup,
    expandedSubUnit,
    selectedSubUnits,
    handleBackToOverview,
    navigateDrill,
  ]);

  /* ── 렌더 ── */

  const matchState = (c: Character): "default" | "matched" | "dimmed" => {
    if (!query.trim()) return "default";
    return searchMatches.ids.has(String(c._id)) ? "matched" : "dimmed";
  };

  const renderCardGrid = (members: Character[]) => {
    if (members.length === 0) {
      return <div className={styles.empty}>소속 인원 없음</div>;
    }

    return (
      <div className={styles.cardGrid}>
        {members.map((c) => {
          const usesAgentLevels = characterUsesAgentLevels(c);
          return (
            <PersonnelCard
              key={String(c._id)}
              character={c}
              showIdentity={showIdentity}
              showAgentLevel={usesAgentLevels}
              isLead={
                usesAgentLevels && compareLevels(c.agentLevel ?? "J", "A") >= 0
              }
              isRedacted={
                !canViewField(clearance, "identity") &&
                !canViewField(clearance, "profile")
              }
              matchState={matchState(c)}
              classifiedFieldsCount={hiddenFieldsCount}
              requiredLevelForHidden={hiddenMinLevel}
            />
          );
        })}
      </div>
    );
  };

  const renderSubUnitList = () => {
    const directAgentCount = selectedDirectMembers.filter(
      (m) => m.type === "AGENT",
    ).length;
    const directNpcCount = selectedDirectMembers.filter(
      (m) => m.type === "NPC",
    ).length;
    const directLabel = `${selectedGroupLabel} 직속`;

    return (
      <div className={styles.subunitGroup}>
        {selectedDirectMembers.length > 0 ? (
          <section className={styles.directMembers} aria-label={directLabel}>
            <div className={styles.directMembers__head}>
              <span className={styles.directMembers__label}>
                {directLabel}
              </span>
              <span className={styles.directMembers__meta}>
                {directAgentCount} AGENT · {directNpcCount} NPC
              </span>
            </div>
            <div className={styles.directMembers__body}>
              {renderCardGrid(selectedDirectMembers)}
            </div>
          </section>
        ) : null}
        {selectedSubUnits.map((unit) => {
          const members = subUnitIndex.get(unit.code) ?? [];
          const agentCount = members.filter((m) => m.type === "AGENT").length;
          const npcCount = members.filter((m) => m.type === "NPC").length;
          const leadCount = members.filter(
            (m) =>
              characterUsesAgentLevels(m) &&
              compareLevels(m.agentLevel ?? "J", "A") >= 0,
          ).length;
          const sorted = [...members].sort(compareForCardOrder);

          return (
            <SubUnitAccordion
              key={unit.code}
              code={unit.code}
              label={unit.label}
              agentCount={agentCount}
              npcCount={npcCount}
              leadCount={leadCount}
              expanded={expandedSubUnit === unit.code}
              onToggle={() => handleToggleSubUnit(unit.code)}
            >
              {renderCardGrid(sorted)}
            </SubUnitAccordion>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "PERSONNEL" },
        ]}
        title="신원 조회"
      />

      <ClearanceStrip clearance={clearance} />

      {/* Search + Filter bar — Box wrapper 제거 (border/corner tick 시각 노이즈 회피). */}
      <div className={styles.searchBox}>
        <div className={styles.searchRow}>
          <Input
            type="search"
            placeholder="codename · 역할 · 부서 · 실명(G+ 필요) 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.searchInput}
            aria-label="신원 검색"
          />
          <Button
            size="sm"
            aria-label="검색"
            onClick={() => {
              /* 입력 값은 이미 실시간으로 반영됨 — 제출 버튼은 시각적 표식 */
            }}
          >
            ⌕ 검색
          </Button>
        </div>

      </div>

      {/* Org breadcrumbs */}
      <OrgDrillCrumbs items={crumbs} className={styles.orgBreadcrumbs} />

      {/* L1 조감 or L2 드릴다운 */}
      {!selectedGroup ? (
        <OrgCanvas
          groupCounts={canvasGroupCounts}
          groupLevelCounts={canvasGroupLevelCounts}
          unassignedSamples={unassignedSamples}
          onSelect={handleSelectGroup}
        />
      ) : (
        <div className={styles.drilldown}>
          <GroupHero
            groupCode={selectedGroup}
            groupLabel={selectedGroupLabel}
            groupLabelEn={selectedGroupLabelEn}
            kind={selectedGroupKind}
            subUnits={selectedSubUnits.map((u) => ({
              code: u.code,
              label: u.label,
            }))}
            memberCount={selectedGroupMembers.length}
            doctrine={
              selectedGroupKind === "faction"
                ? getFactionDoctrine(selectedGroup)
                : selectedGroupKind === "institution"
                  ? getInstitutionDoctrine(selectedGroup)
                  : undefined
            }
            levelCounts={
              selectedGroupUsesAgentLevels
                ? canvasGroupLevelCounts[selectedGroup]
                : undefined
            }
            oversight={
              selectedGroupKind === "institution"
                ? INSTITUTION_OVERSIGHT[selectedGroup]
                : undefined
            }
            iconCode={
              selectedGroupKind === "faction"
                ? isExternalSubOrg(selectedGroup)
                  ? getFactionIcon("CIVIL")
                  : getFactionIcon(selectedGroup)
                : selectedGroupKind === "institution"
                  ? getInstitutionIcon(selectedGroup)
                  : selectedGroupKind === "unassigned"
                  ? "UNASSIGNED"
                  : undefined
            }
            titleLogoUrl={
              selectedGroupKind === "faction"
                ? getFactionLogo(selectedGroup)
                : undefined
            }
            logoUrl={
              selectedGroupKind === "faction"
                ? getFactionLogo(selectedGroup)
                : selectedGroupKind === "institution"
                  ? INSTITUTION_LOGO
                  : undefined
            }
            expandedSubUnit={expandedSubUnit}
            onSubUnitClick={handleToggleSubUnit}
            onBack={handleBackToOverview}
          />

          {searchBannerInfo ? (
            <SearchJumpBanner
              query={query.trim()}
              totalMatches={searchBannerInfo.total}
              currentGroupMatches={searchBannerInfo.currentGroupMatches}
              otherGroupCode={searchBannerInfo.otherGroupCode}
              otherGroupCount={searchBannerInfo.otherGroupCount}
              onJump={
                searchBannerInfo.otherGroupCode
                  ? () => handleSelectGroup(searchBannerInfo.otherGroupCode!)
                  : undefined
              }
            />
          ) : null}

          {selectedSubUnits.length > 0
            ? renderSubUnitList()
            : renderCardGrid(selectedGroupMembers)}
        </div>
      )}

      {/* Legend */}
      {selectedGroupUsesAgentLevels ? (
        <Box className={styles.legend}>
          <div className={styles.legend__row}>
            {LEGEND_ITEMS.map((item) => (
              <div key={item.level} className={styles.legend__item}>
                <span
                  className={styles.lvScale}
                  data-level={item.level}
                  aria-hidden
                >
                  {Array.from(
                    { length: getLevelDisplayTotal(item.level) },
                    (_, i) => (
                      <span
                        key={i}
                        className={
                          i < getLevelDisplayRank(item.level)
                            ? styles["lvScale--on"]
                            : ""
                        }
                      />
                    ),
                  )}
                </span>
                <span
                  className={styles.legend__label}
                  data-level={item.level}
                >
                  {item.level} · {item.label}
                </span>
              </div>
            ))}
            <div className={styles.legend__item}>
              <span className={styles.classifiedTag}>CLASSIFIED</span>
              <span className={styles.legend__label}>등급 미달 · 값 가림</span>
            </div>
            <div className={styles.legend__item}>
              <span className={styles.redactBlock} aria-hidden />
              <span className={styles.legend__label}>
                REDACTED · 필드 전체 차단
              </span>
            </div>
          </div>
        </Box>
      ) : null}

    </>
  );
}
