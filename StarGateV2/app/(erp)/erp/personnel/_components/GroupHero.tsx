import type { AgentLevel } from "@/types/character";

import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";

import { LEVEL_ORDER } from "../_constants";

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
  subUnitLabels?: string[];
  memberCount: number;
  /** 교리 / 원칙 한 줄 */
  doctrine?: string;
  /** V~U 등급 분포 */
  levelCounts?: Partial<Record<AgentLevel, number>>;
  /** 감독 영역 (institution 전용, subUnit 없을 때만 활용) */
  oversight?: string;
  /** 배경 워터마크 로고 경로 */
  logoUrl?: string;
  onBack: () => void;
}

export default function GroupHero({
  groupCode,
  groupLabel,
  groupLabelEn,
  kind,
  subUnitCount,
  subUnitLabels,
  memberCount,
  doctrine,
  levelCounts,
  oversight,
  logoUrl,
  onBack,
}: Props) {
  const eyebrowText =
    kind === "unassigned"
      ? KIND_EYEBROW_PREFIX[kind]
      : `${KIND_EYEBROW_PREFIX[kind]} · ${groupCode}`;

  const hasSubUnits =
    subUnitCount !== undefined &&
    subUnitCount > 0 &&
    subUnitLabels !== undefined &&
    subUnitLabels.length > 0;

  return (
    <div className={styles.hero}>
      <span className={`${styles.corner} ${styles["corner--tl"]}`} />
      <span className={`${styles.corner} ${styles["corner--tr"]}`} />
      <span className={`${styles.corner} ${styles["corner--bl"]}`} />
      <span className={`${styles.corner} ${styles["corner--br"]}`} />

      {logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={logoUrl}
          alt=""
          className={styles.watermark}
          aria-hidden
        />
      ) : null}

      <div className={styles.head}>
        <div className={styles.headMain}>
          <Eyebrow>{eyebrowText}</Eyebrow>
          <h2 className={styles.title}>{groupLabel}</h2>
          {kind !== "unassigned" ? (
            <div className={styles.subtitle}>{groupLabelEn}</div>
          ) : null}
        </div>

        <div className={styles.actions}>
          <Button size="sm" onClick={onBack}>
            ← 조직도
          </Button>
        </div>
      </div>

      <div className={styles.sections}>
        {doctrine ? (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>DOCTRINE</div>
            <div className={styles.sectionValue}>{doctrine}</div>
          </section>
        ) : null}

        {levelCounts ? (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>DISTRIBUTION</div>
            <div className={styles.distribution}>
              {LEVEL_ORDER.map((lv) => {
                const c = levelCounts[lv] ?? 0;
                return (
                  <span
                    key={lv}
                    className={[
                      styles.pip,
                      c > 0 ? styles["pip--on"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-rank={lv}
                  >
                    <span className={styles.pipLevel}>{lv}</span>
                    <span className={styles.pipCount}>·{c}</span>
                  </span>
                );
              })}
            </div>
          </section>
        ) : null}

        {hasSubUnits ? (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>
              SUB UNITS · {subUnitCount}
            </div>
            <div className={styles.sectionValue}>
              {subUnitLabels!.join(" · ")}
            </div>
          </section>
        ) : oversight ? (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>OVERSIGHT</div>
            <div className={styles.sectionValue}>{oversight}</div>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionLabel}>HEADCOUNT</div>
          <div className={styles.headcount}>
            <span className={styles.headcountN}>{memberCount}</span>
            <span className={styles.headcountU}>MEMBERS</span>
          </div>
        </section>
      </div>
    </div>
  );
}
