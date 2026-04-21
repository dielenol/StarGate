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
}

export default function DossierTabs({
  active,
  onChange,
  counts,
  auditLevel = "V",
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
  );
}
