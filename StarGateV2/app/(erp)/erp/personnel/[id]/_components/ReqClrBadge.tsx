import type { AgentLevel } from "@/types/character";

import styles from "./ReqClrBadge.module.css";

interface Props {
  required: AgentLevel;
  locked: boolean;
}

export default function ReqClrBadge({ required, locked }: Props) {
  return (
    <span
      className={[styles.badge, locked ? styles.badgeLocked : ""]
        .filter(Boolean)
        .join(" ")}
      data-rank={required}
    >
      {required} 필요 · {locked ? "잠김" : "열람 가능"}
    </span>
  );
}
