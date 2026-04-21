import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";

import styles from "./GroupHero.module.css";

type GroupKind = "faction" | "institution" | "unassigned";

const KIND_EYEBROW_PREFIX: Record<GroupKind, string> = {
  faction: "FACTION",
  institution: "INSTITUTION",
  unassigned: "UNASSIGNED",
};

interface Props {
  groupCode: string;
  groupLabel: string;
  groupLabelEn: string;
  kind: GroupKind;
  subUnitCount?: number;
  memberCount: number;
  onBack: () => void;
}

export default function GroupHero({
  groupCode,
  groupLabel,
  groupLabelEn,
  kind,
  subUnitCount,
  memberCount,
  onBack,
}: Props) {
  const eyebrowText =
    kind === "unassigned"
      ? KIND_EYEBROW_PREFIX[kind]
      : `${KIND_EYEBROW_PREFIX[kind]} · ${groupCode}`;

  const metaParts = [groupLabelEn];
  if (subUnitCount && subUnitCount > 0) {
    metaParts.push(`${subUnitCount} sub-units`);
  }
  metaParts.push(`${memberCount} members`);

  return (
    <div className={styles.hero}>
      <span className={`${styles.corner} ${styles["corner--tl"]}`} />
      <span className={`${styles.corner} ${styles["corner--tr"]}`} />
      <span className={`${styles.corner} ${styles["corner--bl"]}`} />
      <span className={`${styles.corner} ${styles["corner--br"]}`} />

      <div className={styles.row}>
        <div>
          <Eyebrow>{eyebrowText}</Eyebrow>
          <h2 className={styles.title}>{groupLabel}</h2>
          <div className={styles.meta}>{metaParts.join(" · ")}</div>
        </div>

        <div className={styles.actions}>
          <Button size="sm" onClick={onBack}>
            ← 조직도
          </Button>
        </div>
      </div>
    </div>
  );
}
