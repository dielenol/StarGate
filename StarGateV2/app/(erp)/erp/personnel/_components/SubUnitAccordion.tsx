"use client";

import type { ReactNode } from "react";

import styles from "./SubUnitAccordion.module.css";

interface Props {
  code: string;
  label: string;
  agentCount: number;
  npcCount: number;
  leadCount?: number;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}

// 기밀 건수 표시는 stream-layer 연동 후 재도입
export default function SubUnitAccordion({
  code,
  label,
  agentCount,
  npcCount,
  leadCount,
  expanded,
  onToggle,
  children,
}: Props) {
  const memberCount = agentCount + npcCount;

  const metaParts: string[] = [`${memberCount}명`];
  if (leadCount && leadCount > 0) {
    metaParts.push(`부서장 ${leadCount}`);
  }

  return (
    <div
      className={[styles.subunit, expanded ? styles["subunit--open"] : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className={styles.head}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className={styles.arrow} aria-hidden>
          ▸
        </span>
        <span className={styles.code}>{code}</span>
        <span className={styles.label}>{label}</span>
        <span className={styles.subCount}>
          / {agentCount} AGENT · {npcCount} NPC
        </span>
        <span className={styles.meta}>{metaParts.join(" · ")}</span>
      </button>

      {expanded && <div className={styles.body}>{children}</div>}
    </div>
  );
}
