"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

import type { Character, AgentLevel } from "@/types/character";
import { AGENT_LEVEL_LABELS, FACTIONS, INSTITUTIONS } from "@/types/character";

import { useCharacters } from "@/hooks/queries/useCharactersQuery";
import { canViewField } from "@/lib/personnel";
import { getTopLevelGroup, getSubUnits } from "@/lib/org-structure";

import styles from "./page.module.css";

interface Props {
  initialCharacters: Character[];
  clearance: AgentLevel;
}

export default function PersonnelClient({
  initialCharacters,
  clearance,
}: Props) {
  const { data: characters = [] } = useCharacters(null, {
    initialData: initialCharacters,
  });

  /* 2-level 드릴다운 상태 */
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [expandedSubUnit, setExpandedSubUnit] = useState<string | null>(null);

  const showIdentity = canViewField(clearance, "identity");

  const grouped = useMemo(() => {
    const map = new Map<string, Character[]>();
    for (const c of characters) {
      const group = getTopLevelGroup(c.department);
      const list = map.get(group) ?? [];
      list.push(c);
      map.set(group, list);
    }
    return map;
  }, [characters]);

  /* 드릴다운 핸들러 */
  const handleSelectGroup = (code: string) => {
    setSelectedGroup(code);
    setExpandedSubUnit(null);
  };

  const handleBack = () => {
    setSelectedGroup(null);
    setExpandedSubUnit(null);
  };

  const toggleSubUnit = (code: string) => {
    setExpandedSubUnit((prev) => (prev === code ? null : code));
  };

  /* ── 드릴다운 뷰: 선택된 그룹의 내부 구조 ── */
  if (selectedGroup) {
    const faction = FACTIONS.find((f) => f.code === selectedGroup);
    const institution = INSTITUTIONS.find((i) => i.code === selectedGroup);
    const groupLabel = faction?.label ?? institution?.label ?? selectedGroup;
    const groupLabelEn =
      faction?.labelEn ?? institution?.labelEn ?? "";

    return (
      <section className={styles.org}>
        <button
          type="button"
          className={styles.org__back}
          onClick={handleBack}
        >
          ← 조직도
        </button>

        <div className={styles.org__classification}>
          PERSONNEL DATABASE — {groupLabelEn.toUpperCase()}
        </div>
        <h1 className={styles.org__title}>{groupLabel}</h1>

        <div className={styles.org__clearanceBadge}>
          현재 열람 등급:
          <span className={styles.org__clearanceLevel}>{clearance}</span>
          {AGENT_LEVEL_LABELS[clearance]} CLEARANCE
        </div>

        {/* 사무국 같은 하위 기구가 있는 경우 → 트리 표시 */}
        {institution && institution.subUnits.length > 0 ? (
          <InstitutionTree
            institution={institution}
            characters={characters}
            expandedSubUnit={expandedSubUnit}
            toggleSubUnit={toggleSubUnit}
            showIdentity={showIdentity}
          />
        ) : (
          /* 세력/재무국 등 하위 기구 없음 → 인원 직접 표시 */
          <DirectMemberList
            members={grouped.get(selectedGroup) ?? []}
            showIdentity={showIdentity}
          />
        )}
      </section>
    );
  }

  /* ── 초기 뷰: 조직도 개요 ── */
  return (
    <section className={styles.org}>
      <div className={styles.org__classification}>
        NOVUS ORDO — ORGANIZATIONAL STRUCTURE
      </div>
      <h1 className={styles.org__title}>신원 조회</h1>

      <div className={styles.org__clearanceBadge}>
        현재 열람 등급:
        <span className={styles.org__clearanceLevel}>{clearance}</span>
        {AGENT_LEVEL_LABELS[clearance]} CLEARANCE
      </div>

      {/* 메인 레이아웃: 좌측 삼권분립 + 우측 독립기관 */}
      <div className={styles.org__main}>
        {/* 좌측: 3대 세력 삼각형 */}
        <div className={styles.org__factions}>
          <div className={styles.org__factionLabel}>3대 세력</div>
          <TriangleLayout grouped={grouped} onSelect={handleSelectGroup} />
        </div>

        {/* 우측: 독립 기관 수직 나열 */}
        <div className={styles.org__institutions}>
          <div className={styles.org__institutionLabel}>독립 기관</div>
          <div className={styles.org__institutionStack}>
            {INSTITUTIONS.map((inst) => {
              const subUnits = getSubUnits(inst.code);
              const directMembers = grouped.get(inst.code) ?? [];
              const subCount = subUnits.reduce(
                (sum, u) => sum + (grouped.get(u.code)?.length ?? 0),
                0,
              );
              const totalCount =
                inst.subUnits.length > 0
                  ? subCount + directMembers.length
                  : directMembers.length;

              const subLabel =
                inst.subUnits.length > 0
                  ? inst.subUnits.map((u) => u.label).join(" · ")
                  : undefined;

              return (
                <button
                  key={inst.code}
                  type="button"
                  className={styles.org__block}
                  onClick={() => handleSelectGroup(inst.code)}
                >
                  <span className={styles.org__blockLabel}>{inst.label}</span>
                  <span className={styles.org__blockLabelEn}>
                    {inst.labelEn}
                  </span>
                  {subLabel && (
                    <span className={styles.org__blockSub}>{subLabel}</span>
                  )}
                  <span className={styles.org__blockCount}>
                    {totalCount}명
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 미배정 */}
      {(grouped.get("UNASSIGNED")?.length ?? 0) > 0 && (
        <>
          <div className={styles.org__sectionHeader}>미배정</div>
          <div className={styles.org__cardGrid}>
            {grouped.get("UNASSIGNED")!.map((c) => (
              <PersonnelCard
                key={String(c._id)}
                character={c}
                showIdentity={showIdentity}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ── 삼각형 배치 (3대 세력) ── */

const TRIANGLE_TOP = FACTIONS.find((f) => f.code === "COUNCIL")!;
const TRIANGLE_LEFT = FACTIONS.find((f) => f.code === "MILITARY")!;
const TRIANGLE_RIGHT = FACTIONS.find((f) => f.code === "CIVIL")!;

function TriangleLayout({
  grouped,
  onSelect,
}: {
  grouped: Map<string, Character[]>;
  onSelect: (code: string) => void;
}) {
  return (
    <div className={styles.org__triangle}>
      <div className={styles.org__triangleTop}>
        <button
          type="button"
          className={`${styles.org__block} ${styles["org__block--top"]}`}
          onClick={() => onSelect(TRIANGLE_TOP.code)}
        >
          <span className={styles.org__blockLabel}>{TRIANGLE_TOP.label}</span>
          <span className={styles.org__blockLabelEn}>
            {TRIANGLE_TOP.labelEn}
          </span>
          <span className={styles.org__blockCount}>
            {(grouped.get(TRIANGLE_TOP.code) ?? []).length}명
          </span>
        </button>
      </div>

      <div className={styles.org__triangleConnector}>╱ ╲</div>

      <div className={styles.org__triangleBottom}>
        <button
          type="button"
          className={`${styles.org__block} ${styles["org__block--bottom"]}`}
          onClick={() => onSelect(TRIANGLE_LEFT.code)}
        >
          <span className={styles.org__blockLabel}>
            {TRIANGLE_LEFT.label}
          </span>
          <span className={styles.org__blockLabelEn}>
            {TRIANGLE_LEFT.labelEn}
          </span>
          <span className={styles.org__blockCount}>
            {(grouped.get(TRIANGLE_LEFT.code) ?? []).length}명
          </span>
        </button>

        <button
          type="button"
          className={`${styles.org__block} ${styles["org__block--bottom"]}`}
          onClick={() => onSelect(TRIANGLE_RIGHT.code)}
        >
          <span className={styles.org__blockLabel}>
            {TRIANGLE_RIGHT.label}
          </span>
          <span className={styles.org__blockLabelEn}>
            {TRIANGLE_RIGHT.labelEn}
          </span>
          <span className={styles.org__blockCount}>
            {(grouped.get(TRIANGLE_RIGHT.code) ?? []).length}명
          </span>
        </button>
      </div>
    </div>
  );
}

/* ── 기관 내부 트리 (사무국 등) ── */

function InstitutionTree({
  institution,
  characters,
  expandedSubUnit,
  toggleSubUnit,
  showIdentity,
}: {
  institution: (typeof INSTITUTIONS)[number];
  characters: Character[];
  expandedSubUnit: string | null;
  toggleSubUnit: (code: string) => void;
  showIdentity: boolean;
}) {
  const subUnits = useMemo(
    () =>
      institution.subUnits.map((u) => ({
        ...u,
        members: characters.filter((c) => c.department === u.code),
      })),
    [institution, characters],
  );

  return (
    <div className={styles.org__tree}>
      <div className={styles.org__treeBlocks}>
        {subUnits.map((unit) => {
          const isExpanded = expandedSubUnit === unit.code;
          return (
            <button
              key={unit.code}
              type="button"
              className={`${styles.org__treeBlock} ${isExpanded ? styles["org__treeBlock--active"] : ""}`}
              onClick={() => toggleSubUnit(unit.code)}
              aria-expanded={isExpanded}
            >
              <span className={styles.org__treeBlockLabel}>{unit.label}</span>
              <span className={styles.org__treeBlockCount}>
                {unit.members.length}명
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택된 하위 기구의 인원 카드 */}
      {expandedSubUnit && (
        <div className={styles.org__accordion}>
          {(() => {
            const unit = subUnits.find((u) => u.code === expandedSubUnit);
            if (!unit || unit.members.length === 0) {
              return <p className={styles.org__empty}>소속 인원 없음</p>;
            }
            return (
              <div className={styles.org__cardGrid}>
                {unit.members.map((c) => (
                  <PersonnelCard
                    key={String(c._id)}
                    character={c}
                    showIdentity={showIdentity}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ── 직접 인원 목록 (하위 기구 없는 그룹) ── */

function DirectMemberList({
  members,
  showIdentity,
}: {
  members: Character[];
  showIdentity: boolean;
}) {
  if (members.length === 0) {
    return <p className={styles.org__empty}>소속 인원 없음</p>;
  }

  return (
    <div className={styles.org__cardGrid}>
      {members.map((c) => (
        <PersonnelCard
          key={String(c._id)}
          character={c}
          showIdentity={showIdentity}
        />
      ))}
    </div>
  );
}

/* ── 인원 카드 ── */

function PersonnelCard({
  character,
  showIdentity,
}: {
  character: Character;
  showIdentity: boolean;
}) {
  const level = character.agentLevel ?? "J";

  return (
    <Link
      href={`/erp/personnel/${String(character._id)}`}
      className={styles.org__card}
    >
      {character.previewImage ? (
        <img
          src={character.previewImage}
          alt={character.codename}
          className={styles.org__cardImage}
        />
      ) : (
        <div className={styles.org__cardPlaceholder}>?</div>
      )}
      <div className={styles.org__cardInfo}>
        <div className={styles.org__cardCodename}>{character.codename}</div>
        <div className={styles.org__cardRole}>
          {character.role}
          <span
            className={`${styles.org__levelBadge} ${styles[`org__levelBadge--${level}`]}`}
          >
            {level}
          </span>
        </div>
        <div className={styles.org__cardIdentity}>
          {showIdentity ? (
            character.sheet.name
          ) : (
            <span className={styles.org__classified}>[CLASSIFIED]</span>
          )}
        </div>
      </div>
    </Link>
  );
}
