import type { AgentLevel } from "@/types/character";

import styles from "./ReqClrBadge.module.css";

interface Props {
  required: AgentLevel;
  locked: boolean;
}

export default function ReqClrBadge({ required, locked }: Props) {
  const statusLabel = locked ? "잠김" : "열람";
  const fullLabel = `${required} 등급 필요 · ${locked ? "잠김" : "열람 가능"}`;

  return (
    <span
      className={[styles.badge, locked ? styles.badgeLocked : ""]
        .filter(Boolean)
        .join(" ")}
      data-rank={required}
      title={fullLabel}
      aria-label={fullLabel}
    >
      {required} · {statusLabel}
    </span>
  );
}
