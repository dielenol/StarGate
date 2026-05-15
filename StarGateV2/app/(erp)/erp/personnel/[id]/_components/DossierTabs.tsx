"use client";

import type { AgentLevel } from "@/types/character";

import Tag from "@/components/ui/Tag/Tag";

import styles from "./DossierTabs.module.css";

export type DossierTabKey = "dossier" | "relations" | "sessions" | "audit";

interface TabConfig {
  key: DossierTabKey;
  label: string;
}

const TABS: TabConfig[] = [
  { key: "dossier", label: "DOSSIER" },
  { key: "relations", label: "관계" },
  { key: "sessions", label: "세션 출현" },
  { key: "audit", label: "감사 로그" },
];

interface Props {
  active: DossierTabKey;
  onChange: (key: DossierTabKey) => void;
  counts?: { relations?: number; sessions?: number };
  auditLevel?: AgentLevel;
  /** 좌측 끝 슬롯 (예: 등급 안내 트리거). 탭 row 와 같은 border-bottom 라인에 정렬된다. */
  leftSlot?: React.ReactNode;
  /** 우측 끝 슬롯 (예: 편집/저장/취소). 탭 row 와 같은 border-bottom 라인에 정렬된다. */
  rightSlot?: React.ReactNode;
}

export default function DossierTabs({
  active,
  onChange,
  counts,
  auditLevel = "V",
  leftSlot,
  rightSlot,
}: Props) {
  const getLabel = (cfg: TabConfig): string => {
    if (cfg.key === "relations") {
      return `${cfg.label} · ${counts?.relations ?? 0}`;
    }
    if (cfg.key === "sessions") {
      return `${cfg.label} · ${counts?.sessions ?? 0}`;
    }
    return cfg.label;
  };

  return (
    <div className={styles.bar}>
      {leftSlot ? <div className={styles.slot}>{leftSlot}</div> : null}
      <div className={styles.tabs} role="tablist">
        {TABS.map((cfg) => {
          const isActive = active === cfg.key;
          return (
            <button
              key={cfg.key}
              type="button"
              role="tab"
              id={`dossier-tab-${cfg.key}`}
              aria-selected={isActive}
              aria-controls={`dossier-tabpanel-${cfg.key}`}
              className={[styles.tab, isActive ? styles.tabActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onChange(cfg.key)}
            >
              <span>{getLabel(cfg)}</span>
              {cfg.key === "audit" ? (
                <Tag tone="default" className={styles.tabLevel}>
                  {auditLevel}
                </Tag>
              ) : null}
            </button>
          );
        })}
      </div>
      {rightSlot ? <div className={styles.slot}>{rightSlot}</div> : null}
    </div>
  );
}
