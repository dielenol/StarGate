import type { AgentLevel } from "@/types/character";

import styles from "./LockedSection.module.css";

type LockedVariant = "full" | "grid";

interface Props {
  variant: LockedVariant;
  required: AgentLevel;
  fields?: string[];
  title?: string;
  subtitle?: string;
}

export default function LockedSection({
  variant,
  required,
  fields,
  title,
  subtitle,
}: Props) {
  if (variant === "full") {
    return (
      <div className={styles.full}>
        <div className={styles.fullIcon} aria-hidden>
          ⚿
        </div>
        <div className={styles.fullTitle}>
          {title ?? `CLASSIFIED · ${required}`}
        </div>
        <div className={styles.fullSub}>
          {subtitle ?? `열람에는 ${required} 등급이 필요합니다.`}
        </div>
      </div>
    );
  }

  // variant === "grid"
  const labels = fields ?? [];
  return (
    <div className={styles.grid}>
      {labels.map((label) => (
        <div key={label} className={styles.gridCell}>
          <div className={styles.gridEyebrow}>{label}</div>
          <div className={styles.gridValue}>[CLASSIFIED · {required}]</div>
        </div>
      ))}
    </div>
  );
}
