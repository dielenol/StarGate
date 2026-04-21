"use client";

import type { AgentLevel } from "@/types/character";

import {
  canViewField,
  FIELD_GROUP_LABEL,
  FIELD_GROUP_ORDER,
  FIELD_REQUIRED_LEVEL,
} from "@/lib/personnel";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import styles from "./ClearanceMap.module.css";

interface Props {
  clearance: AgentLevel;
}

export default function ClearanceMap({ clearance }: Props) {
  const rows = FIELD_GROUP_ORDER.map((group) => {
    const label = FIELD_GROUP_LABEL[group];
    const locked = !canViewField(clearance, group);
    const required = FIELD_REQUIRED_LEVEL[group];
    return { group, label, locked, required };
  });

  const hiddenCount = rows.filter((r) => r.locked).length;

  return (
    <Box>
      <PanelTitle>CLEARANCE MAP</PanelTitle>

      <div className={styles.rows}>
        {rows.map((r) => (
          <div key={r.group} className={styles.row}>
            <span className={styles.label}>{r.label}</span>
            <span
              className={[
                styles.value,
                r.locked ? styles.valueLocked : styles.valueOpen,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {r.required} · {r.locked ? "잠김" : "열람"}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.summary}>상위 등급 필요 필드 · {hiddenCount}</div>

      <Button
        size="sm"
        className={styles.requestBtn}
        onClick={() => {
          /* Phase 3: 등급 상승 요청 모달 연결 예정 */
        }}
      >
        등급 상승 요청 →
      </Button>
    </Box>
  );
}
