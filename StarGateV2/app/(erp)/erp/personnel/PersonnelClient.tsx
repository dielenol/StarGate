"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { AgentLevel, Character } from "@/types/character";
import {
  AGENT_LEVEL_LABELS,
  FACTIONS,
  INSTITUTIONS,
} from "@/types/character";

import { usePersonnelQuery } from "@/hooks/queries/useCharactersQuery";

import {
  canViewField,
  compareLevels,
  FIELD_GROUP_ORDER,
  FIELD_REQUIRED_LEVEL,
  getLevelDisplayRank,
  getLevelRank,
} from "@/lib/personnel";
import {
  getDepartmentLabel,
  getGroupLabel,
  getSubUnits,
  getTopLevelGroup,
  isFaction,
  isInstitution,
} from "@/lib/org-structure";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/Input";
import PageHead from "@/components/ui/PageHead/PageHead";
import Pips from "@/components/ui/Pips/Pips";

import GroupHero from "./_components/GroupHero";
import OrgCanvas from "./_components/OrgCanvas";
import PersonnelCard from "./_components/PersonnelCard";
import SearchJumpBanner from "./_components/SearchJumpBanner";
import SubUnitAccordion from "./_components/SubUnitAccordion";

import {
  FACTION_DOCTRINE,
  FACTION_LOGO,
  INSTITUTION_DOCTRINE,
  INSTITUTION_LOGO,
  INSTITUTION_OVERSIGHT,
} from "./_constants";

import styles from "./page.module.css";

/* ── 상수 ── */

const UNASSIGNED_CODE = "UNASSIGNED";

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

/* ── 헬퍼 ── */

/**
 * 캐릭터가 속한 최상위 그룹 코드 (세력/기관/UNASSIGNED).
 *
 * Phase 1 후 factionCode / institutionCode 는 AGENT/NPC 공통 root 필드로 승격되었으므로
 * type 분기 없이 동일 로직 적용.
 */
function resolveGroup(c: Character): string {
  const dept = c.department;
  if (dept && dept !== UNASSIGNED_CODE) {
    const top = getTopLevelGroup(dept);
    if (top !== UNASSIGNED_CODE) return top;
  }

  if (c.institutionCode) {
    const top = getTopLevelGroup(c.institutionCode);
    return top !== UNASSIGNED_CODE ? top : c.institutionCode;
  }
  if (c.factionCode && isFaction(c.factionCode)) return c.factionCode;

  return UNASSIGNED_CODE;
}

/** 같은 그룹/서브유닛 내부 카드 정렬: 등급 내림차순 → codename 오름차순 */
function compareForCardOrder(a: Character, b: Character): number {
  const levelCmp = compareLevels(b.agentLevel ?? "J", a.agentLevel ?? "J");
  if (levelCmp !== 0) return levelCmp;
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
  if (isInstitution(code)) return "institution";
  return "unassigned";
}

/** 그룹의 labelEn 찾기 (subUnit 은 labelEn 이 없으므로 label 반환) */
function getGroupLabelEn(code: string): string {
  const f = FACTIONS.find((x) => x.code === code);
  if (f) return f.labelEn;
  const inst = INSTITUTIONS.find((x) => x.code === code);
  if (inst) return inst.labelEn;
  if (code === UNASSIGNED_CODE) return "Unassigned";
  return code;
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

  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [expandedSubUnit, setExpandedSubUnit] = useState<string | null>(null);

  const prevQueryRef = useRef("");

  const showIdentity = canViewField(clearance, "identity");
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
    for (const c of characters) {
      const dept = c.department;
      if (!dept) continue;
      const bucket = map.get(dept);
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

      if (
        showIdentity &&
        c.lore.name &&
        c.lore.name.toLowerCase().includes(q)
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

      if (c.department && c.department !== g) {
        subUnitCounts.set(
          c.department,
          (subUnitCounts.get(c.department) ?? 0) + 1,
        );
      }
    }

    return { ids, groupCounts, subUnitCounts };
  }, [characters, query, showIdentity]);

  /* 검색어 변화 → 자동 드릴다운 / 조감 복귀 */
  useEffect(() => {
    const prev = prevQueryRef.current;
    const curr = query.trim();
    prevQueryRef.current = curr;

    if (!curr) {
      // 검색 비움 → 조감 복귀
      if (prev) {
        setSelectedGroup(null);
        setExpandedSubUnit(null);
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

    setSelectedGroup((prevGroup) => {
      if (prevGroup && searchMatches.groupCounts.has(prevGroup)) return prevGroup;
      return topGroup;
    });

    // 하위 기구가 있는 그룹이면 매칭 최다 subUnit 자동 펼침
    const targetGroup =
      selectedGroup && searchMatches.groupCounts.has(selectedGroup)
        ? selectedGroup
        : topGroup;

    if (getSubUnits(targetGroup).length > 0) {
      const subEntries = [...searchMatches.subUnitCounts.entries()]
        .filter(([code]) => {
          const inst = INSTITUTIONS.find((i) => i.code === targetGroup);
          return inst?.subUnits.some((u) => u.code === code);
        })
        .sort((a, b) => b[1] - a[1]);
      if (subEntries.length > 0) {
        setExpandedSubUnit(subEntries[0][0]);
      }
    }
    // query/searchMatches 변화에만 트리거. selectedGroup 을 deps 에 넣지 않는 이유:
    // 사용자 수동 선택 직후 매칭 최다 그룹으로 되돌아가는 재귀 루프 방지.
    // prevGroup 이 매칭에 남아있으면 유지됨.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchMatches]);

  /* ── 이벤트 핸들러 ── */

  const handleSelectGroup = (groupCode: string) => {
    setSelectedGroup(groupCode);
    setExpandedSubUnit(null);
  };

  const handleBackToOverview = () => {
    setSelectedGroup(null);
    setExpandedSubUnit(null);
  };

  const handleToggleSubUnit = (code: string) => {
    setExpandedSubUnit((prev) => (prev === code ? null : code));
  };

  /* ── 파생 값 ── */

  // OrgCanvas 용 groupCounts (세력 3 + 기관 2 + UNASSIGNED)
  const canvasGroupCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const f of FACTIONS) counts[f.code] = groupIndex.get(f.code)?.length ?? 0;
    for (const i of INSTITUTIONS) counts[i.code] = groupIndex.get(i.code)?.length ?? 0;
    counts[UNASSIGNED_CODE] = groupIndex.get(UNASSIGNED_CODE)?.length ?? 0;
    return counts;
  }, [groupIndex]);

  // 그룹별 등급 분포 (AGENT + agentLevel 있는 캐릭터만 집계).
  // FACTIONS / INSTITUTIONS / UNASSIGNED 전 그룹 커버 — OrgCanvas 와 GroupHero 공용.
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
        if (c.type === "AGENT" && c.agentLevel) {
          dist[c.agentLevel] = (dist[c.agentLevel] ?? 0) + 1;
        }
      }
      counts[code] = dist;
    }
    return counts;
  }, [groupIndex]);

  const unassignedSamples = useMemo(() => {
    const list = groupIndex.get(UNASSIGNED_CODE) ?? [];
    return list.slice(0, 3).map((c) => ({ codename: c.codename }));
  }, [groupIndex]);

  // 현재 선택 그룹 멤버 (정렬 포함)
  const selectedGroupMembers = useMemo(() => {
    if (!selectedGroup) return [] as Character[];
    const list = groupIndex.get(selectedGroup) ?? [];
    return [...list].sort(compareForCardOrder);
  }, [groupIndex, selectedGroup]);

  // 현재 선택 그룹의 하위 기구 목록
  const selectedSubUnits = useMemo(() => {
    if (!selectedGroup) return [];
    return getSubUnits(selectedGroup);
  }, [selectedGroup]);

  const selectedGroupLabel = selectedGroup ? getGroupLabel(selectedGroup) : "";
  const selectedGroupLabelEn = selectedGroup ? getGroupLabelEn(selectedGroup) : "";
  const selectedGroupKind = selectedGroup
    ? getGroupKind(selectedGroup)
    : "faction";

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
  const crumbs = useMemo(() => {
    const items: {
      key: string;
      label: string;
      on: boolean;
      onClick?: () => void;
    }[] = [
      {
        key: "root",
        label: "◎ 조직도 L1",
        on: !selectedGroup,
        onClick: selectedGroup
          ? () => {
              setSelectedGroup(null);
              setExpandedSubUnit(null);
            }
          : undefined,
      },
    ];

    // 세력/기관이 선택된 경우에만 group crumb 추가 (미도달 placeholder 제거)
    if (selectedGroup) {
      const kind = getGroupKind(selectedGroup);
      const prefix =
        kind === "faction" ? "세력" : kind === "institution" ? "기관" : "미배정";
      const label =
        kind === "unassigned"
          ? "미배정"
          : `${prefix}: ${getGroupLabel(selectedGroup)}`;
      items.push({
        key: "group",
        label,
        on: !expandedSubUnit,
        onClick: expandedSubUnit ? () => setExpandedSubUnit(null) : undefined,
      });
    }

    // 하위 기구가 실제로 펼쳐졌을 때만 sub crumb 추가
    if (selectedGroup && expandedSubUnit && selectedSubUnits.length > 0) {
      const subLabel =
        selectedSubUnits.find((u) => u.code === expandedSubUnit)?.label ??
        expandedSubUnit;
      items.push({ key: "sub", label: `하위: ${subLabel}`, on: true });
    }

    return items;
  }, [selectedGroup, expandedSubUnit, selectedSubUnits]);

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
        {members.map((c) => (
          <PersonnelCard
            key={String(c._id)}
            character={c}
            showIdentity={showIdentity}
            isLead={compareLevels(c.agentLevel ?? "J", "A") >= 0}
            isRedacted={
              !canViewField(clearance, "identity") &&
              !canViewField(clearance, "profile")
            }
            matchState={matchState(c)}
            classifiedFieldsCount={hiddenFieldsCount}
            requiredLevelForHidden={hiddenMinLevel}
          />
        ))}
      </div>
    );
  };

  const renderSubUnitList = () => {
    return (
      <div className={styles.subunitGroup}>
        {selectedSubUnits.map((unit) => {
          const members = subUnitIndex.get(unit.code) ?? [];
          const agentCount = members.filter((m) => m.type === "AGENT").length;
          const npcCount = members.filter((m) => m.type === "NPC").length;
          const leadCount = members.filter(
            (m) => compareLevels(m.agentLevel ?? "J", "A") >= 0,
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
        right={
          <div className={styles.headRight}>
            <span className={styles.clrPill} data-rank={clearance}>
              <span>
                권한등급 · {clearance} · {AGENT_LEVEL_LABELS[clearance]}
              </span>
              <Pips total={7} filled={getLevelDisplayRank(clearance)} />
            </span>
            <Button
              size="sm"
              onClick={() => {
                /* Phase 3: 등급 안내 모달 연결 예정 */
              }}
            >
              등급 안내
            </Button>
          </div>
        }
      />

      {/* Clearance notice strip */}
      <div className={styles.clearanceStrip}>
        <span className={styles.clearanceStrip__label}>권한등급</span>
        <span className={styles.clearanceStrip__body}>
          내 열람 등급{" "}
          <span className={styles.clearanceStrip__level}>{clearance}</span>{" "}
          — 이 등급 이상의 필드만 노출됩니다. 상위 등급 필드는{" "}
          <span className={styles.classifiedTag}>CLASSIFIED</span> 로 표시됩니다.
        </span>
        <span className={styles.clearanceStrip__source}>
          SOURCE · 인사 등록부
        </span>
      </div>

      {/* Search + Filter bar */}
      <Box className={styles.searchBox}>
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

      </Box>

      {/* Org breadcrumbs */}
      <div className={styles.orgBreadcrumbs} aria-label="조직도 경로">
        {crumbs.map((c, idx) => {
          const className = [
            styles.crumb,
            c.onClick ? styles["crumb--clickable"] : "",
            c.on ? styles["crumb--on"] : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <span key={c.key} className={styles.orgBreadcrumbs__item}>
              {c.onClick ? (
                <button
                  type="button"
                  className={className}
                  onClick={c.onClick}
                  aria-current={c.on ? "location" : undefined}
                >
                  {c.label}
                </button>
              ) : (
                <span
                  className={className}
                  aria-current={c.on ? "location" : undefined}
                >
                  {c.label}
                </span>
              )}
              {idx < crumbs.length - 1 ? (
                <span className={styles.sep} aria-hidden>
                  ›
                </span>
              ) : null}
            </span>
          );
        })}
      </div>

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
            subUnitCount={selectedSubUnits.length}
            subUnitLabels={selectedSubUnits.map((u) => u.label)}
            memberCount={selectedGroupMembers.length}
            doctrine={
              selectedGroupKind === "faction"
                ? FACTION_DOCTRINE[selectedGroup]
                : selectedGroupKind === "institution"
                  ? INSTITUTION_DOCTRINE[selectedGroup]
                  : undefined
            }
            levelCounts={canvasGroupLevelCounts[selectedGroup]}
            oversight={
              selectedGroupKind === "institution"
                ? INSTITUTION_OVERSIGHT[selectedGroup]
                : undefined
            }
            logoUrl={
              selectedGroupKind === "faction"
                ? FACTION_LOGO[selectedGroup]
                : selectedGroupKind === "institution"
                  ? INSTITUTION_LOGO
                  : undefined
            }
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
      <Box className={styles.legend}>
        <div className={styles.legend__row}>
          {LEGEND_ITEMS.map((item) => (
            <div key={item.level} className={styles.legend__item}>
              <span
                className={styles.lvScale}
                data-level={item.level}
                aria-hidden
              >
                {Array.from({ length: 7 }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < getLevelDisplayRank(item.level)
                        ? styles["lvScale--on"]
                        : ""
                    }
                  />
                ))}
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
    </>
  );
}
