"use client";

import { FACTIONS, INSTITUTIONS } from "@/types/character";

import styles from "./OrgCanvas.module.css";

/* ── 상수 ── */

const FACTION_EMBLEM: Record<string, string> = {
  COUNCIL: "✦",
  MILITARY: "✶",
  CIVIL: "◈",
};

const UNASSIGNED_CODE = "UNASSIGNED";

interface UnassignedSample {
  codename: string;
}

interface Props {
  groupCounts: Record<string, number>;
  unassignedSamples?: UnassignedSample[];
  onSelect: (groupCode: string) => void;
}

export default function OrgCanvas({
  groupCounts,
  unassignedSamples = [],
  onSelect,
}: Props) {
  const unassignedCount = groupCounts[UNASSIGNED_CODE] ?? 0;
  const hasUnassigned = unassignedCount > 0;

  // FACTIONS 삼각 배치: COUNCIL 상단, MILITARY 좌하, CIVIL 우하
  const factionsOrdered = [...FACTIONS].sort((a, b) => {
    const order = (code: string) =>
      code === "COUNCIL" ? 0 : code === "MILITARY" ? 1 : 2;
    return order(a.code) - order(b.code);
  });

  return (
    <section className={styles.canvas}>
      <svg
        className={styles.lines}
        viewBox="0 0 1000 560"
        preserveAspectRatio="none"
        aria-hidden
      >
        <g
          fill="none"
          stroke="rgba(201,168,90,0.35)"
          strokeWidth={1}
          strokeDasharray="4 4"
        >
          <path d="M290 120 L160 320" />
          <path d="M290 120 L420 320" />
          <path d="M540 170 L760 170" />
          <path d="M540 170 L760 310" />
          <path d="M760 170 L820 310" />
        </g>
      </svg>

      <div className={styles.inner}>
        {/* FACTIONS */}
        <div>
          <div className={styles.sectionTitle}>3대 세력 · FACTIONS</div>
          <div className={styles.factions}>
            {factionsOrdered.map((faction, idx) => {
              const count = groupCounts[faction.code] ?? 0;
              const isTop = idx === 0;
              return (
                <button
                  key={faction.code}
                  type="button"
                  className={[
                    styles.node,
                    styles["node--lg"],
                    isTop ? styles.factions__top : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelect(faction.code)}
                  aria-label={`${faction.label} (${count}명)`}
                >
                  <span className={styles.tl} />
                  <span className={styles.br} />
                  <span className={styles.emblem} aria-hidden>
                    {FACTION_EMBLEM[faction.code] ?? "◆"}
                  </span>
                  <div className={styles.code}>{faction.code}</div>
                  <div className={styles.label}>{faction.label}</div>
                  <div className={styles.labelEn}>{faction.labelEn}</div>
                  <div className={styles.headcount}>
                    <span className={styles.headcount__n}>{count}</span>
                    <span className={styles.headcount__u}>MEMBERS</span>
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
              const subLabel = hasSub
                ? `${inst.labelEn} · ${inst.subUnits.length}개 하위 기구`
                : inst.labelEn;
              return (
                <button
                  key={inst.code}
                  type="button"
                  className={[
                    styles.node,
                    hasSub ? styles["node--hasSub"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelect(inst.code)}
                  aria-label={`${inst.label} (${count}명)`}
                >
                  <span className={styles.tl} />
                  <span className={styles.br} />
                  <div className={styles.code}>{inst.code}</div>
                  <div className={styles.label}>{inst.label}</div>
                  <div className={styles.labelEn}>{subLabel}</div>
                  <div className={styles.headcount}>
                    <span className={styles.headcount__n}>{count}</span>
                    <span className={styles.headcount__u}>MEMBERS</span>
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
