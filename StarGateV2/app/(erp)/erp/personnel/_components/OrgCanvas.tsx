"use client";

import type { AgentLevel } from "@/types/character";
import { FACTIONS, INSTITUTIONS } from "@/types/character";

import {
  FACTION_DOCTRINE,
  FACTION_LOGO,
  INSTITUTION_DOCTRINE,
  INSTITUTION_LOGO,
  INSTITUTION_OVERSIGHT,
  LEVEL_ORDER,
} from "../_constants";

import OrgIcon, {
  FACTION_ICON_MAP,
  INSTITUTION_ICON_MAP,
} from "./OrgIcon";

import styles from "./OrgCanvas.module.css";

const UNASSIGNED_CODE = "UNASSIGNED";

interface UnassignedSample {
  codename: string;
}

interface Props {
  groupCounts: Record<string, number>;
  groupLevelCounts?: Record<string, Partial<Record<AgentLevel, number>>>;
  unassignedSamples?: UnassignedSample[];
  onSelect: (groupCode: string) => void;
}

export default function OrgCanvas({
  groupCounts,
  groupLevelCounts = {},
  unassignedSamples = [],
  onSelect,
}: Props) {
  const unassignedCount = groupCounts[UNASSIGNED_CODE] ?? 0;
  const hasUnassigned = unassignedCount > 0;

  // FACTIONS 정삼각형 배치 (상호 견제): COUNCIL(상), MILITARY(좌하), CIVIL(우하)
  const factionsOrdered = [...FACTIONS].sort((a, b) => {
    const order = (code: string) =>
      code === "COUNCIL" ? 0 : code === "MILITARY" ? 1 : 2;
    return order(a.code) - order(b.code);
  });

  return (
    <section className={styles.canvas}>
      <div className={styles.inner}>
        {/* FACTIONS */}
        <div>
          <div className={styles.sectionTitle}>3대 세력 · FACTIONS</div>
          <div className={styles.factions}>
            {/* 상호 견제 — 3 꼭짓점을 잇는 양방향 화살표 + 중앙 '견제' 라벨.
                viewBox 100×100 기준: COUNCIL(50,18), MILITARY(20,82), CIVIL(80,82) */}
            <svg
              className={styles.crossfire}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <marker
                  id="crossfireArrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="3"
                  markerHeight="3"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--danger)" />
                </marker>
              </defs>
              {/* COUNCIL ↔ MILITARY */}
              <line
                x1="50"
                y1="18"
                x2="20"
                y2="82"
                markerStart="url(#crossfireArrow)"
                markerEnd="url(#crossfireArrow)"
              />
              {/* COUNCIL ↔ CIVIL */}
              <line
                x1="50"
                y1="18"
                x2="80"
                y2="82"
                markerStart="url(#crossfireArrow)"
                markerEnd="url(#crossfireArrow)"
              />
              {/* MILITARY ↔ CIVIL */}
              <line
                x1="20"
                y1="82"
                x2="80"
                y2="82"
                markerStart="url(#crossfireArrow)"
                markerEnd="url(#crossfireArrow)"
              />
            </svg>
            <span className={styles.crossfireLabel} aria-hidden>
              상호 감시 · MUTUAL OVERSIGHT
            </span>

            {factionsOrdered.map((faction) => {
              const count = groupCounts[faction.code] ?? 0;
              const levels = groupLevelCounts[faction.code] ?? {};
              const iconCode = FACTION_ICON_MAP[faction.code];
              const logo = FACTION_LOGO[faction.code];
              const doctrine = FACTION_DOCTRINE[faction.code] ?? "";
              return (
                <button
                  key={faction.code}
                  type="button"
                  className={[styles.node, styles["node--lg"]].join(" ")}
                  onClick={() => onSelect(faction.code)}
                  aria-label={`${faction.label} (${count}명)`}
                >
                  <span className={styles.tl} />
                  <span className={styles.br} />

                  {logo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={logo}
                      alt=""
                      className={styles.node__watermark}
                      aria-hidden
                    />
                  ) : null}

                  <div className={styles.node__header}>
                    <div className={styles.node__headerTop}>
                      {iconCode ? (
                        <OrgIcon
                          code={iconCode}
                          size={20}
                          className={styles.node__headerIcon}
                        />
                      ) : null}
                      <div className={styles.code}>{faction.code}</div>
                    </div>
                    <div className={styles.label}>{faction.label}</div>
                  </div>

                  <div className={styles.node__section}>
                    <div className={styles.node__sectionLabel}>DOCTRINE</div>
                    <div className={styles.node__doctrine}>{doctrine}</div>
                  </div>

                  <div className={styles.node__section}>
                    <div className={styles.node__sectionLabel}>
                      DISTRIBUTION
                    </div>
                    <div className={styles.node__distribution}>
                      {LEVEL_ORDER.map((lv) => {
                        const c = levels[lv] ?? 0;
                        return (
                          <span
                            key={lv}
                            className={[
                              styles.node__pip,
                              styles[`node__pip--${lv}`],
                              c > 0 ? styles["node__pip--on"] : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <span className={styles.node__pipLevel}>{lv}</span>
                            <span className={styles.node__pipCount}>·{c}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.node__section}>
                    <div className={styles.node__sectionLabel}>HEADCOUNT</div>
                    <div className={styles.headcount}>
                      <span className={styles.headcount__n}>{count}</span>
                      <span className={styles.headcount__u}>MEMBERS</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* INSTITUTIONS */}
        <div>
          <div className={styles.sectionTitle}>독립 기관 · INSTITUTIONS</div>
          <div className={styles.institutions}>
            {INSTITUTIONS.map((inst) => {
              const count = groupCounts[inst.code] ?? 0;
              const hasSub = inst.subUnits.length > 0;
              const iconCode = INSTITUTION_ICON_MAP[inst.code];
              const doctrine = INSTITUTION_DOCTRINE[inst.code] ?? "";
              const oversight = INSTITUTION_OVERSIGHT[inst.code];
              const subUnitsLabel = inst.subUnits
                .map((s) => s.label)
                .join(" · ");
              return (
                <button
                  key={inst.code}
                  type="button"
                  className={[
                    styles.node,
                    styles["node--lg"],
                    hasSub ? styles["node--hasSub"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelect(inst.code)}
                  aria-label={`${inst.label} (${count}명)`}
                >
                  <span className={styles.tl} />
                  <span className={styles.br} />

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={INSTITUTION_LOGO}
                    alt=""
                    className={styles.node__watermark}
                    aria-hidden
                  />

                  <div className={styles.node__header}>
                    <div className={styles.node__headerTop}>
                      {iconCode ? (
                        <OrgIcon
                          code={iconCode}
                          size={20}
                          className={styles.node__headerIcon}
                        />
                      ) : null}
                      <div className={styles.code}>{inst.code}</div>
                    </div>
                    <div className={styles.label}>{inst.label}</div>
                  </div>

                  <div className={styles.node__section}>
                    <div className={styles.node__sectionLabel}>DOCTRINE</div>
                    <div className={styles.node__doctrine}>{doctrine}</div>
                  </div>

                  {hasSub ? (
                    <div className={styles.node__section}>
                      <div className={styles.node__sectionLabel}>
                        SUB UNITS · {inst.subUnits.length}
                      </div>
                      <div className={styles.node__subUnits}>
                        {subUnitsLabel}
                      </div>
                    </div>
                  ) : oversight ? (
                    <div className={styles.node__section}>
                      <div className={styles.node__sectionLabel}>
                        OVERSIGHT
                      </div>
                      <div className={styles.node__doctrine}>{oversight}</div>
                    </div>
                  ) : null}

                  <div className={styles.node__section}>
                    <div className={styles.node__sectionLabel}>HEADCOUNT</div>
                    <div className={styles.headcount}>
                      <span className={styles.headcount__n}>{count}</span>
                      <span className={styles.headcount__u}>MEMBERS</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {hasUnassigned && (
              <div className={styles.unassigned}>
                <div className={styles.unassigned__title}>
                  UNASSIGNED · 미배정 · {unassignedCount}명
                </div>
                <button
                  type="button"
                  className={styles.unassigned__button}
                  onClick={() => onSelect(UNASSIGNED_CODE)}
                  aria-label={`미배정 (${unassignedCount}명)`}
                >
                  <div className={styles.unassigned__samples}>
                    {unassignedSamples.slice(0, 3).map((sample) => (
                      <span
                        key={sample.codename}
                        className={styles.code}
                        style={{ fontSize: 10 }}
                      >
                        {sample.codename}
                      </span>
                    ))}
                    {unassignedCount > 3 && (
                      <span
                        className={styles.code}
                        style={{ fontSize: 10, opacity: 0.6 }}
                      >
                        +{unassignedCount - 3}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
