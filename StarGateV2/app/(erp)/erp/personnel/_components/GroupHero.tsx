import type { AgentLevel } from "@/types/character";

import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";

import { LEVEL_ORDER } from "../_constants";

import OrgIcon, {
  SUBUNIT_ICON_MAP,
  type OrgIconCode,
} from "./OrgIcon";

import styles from "./GroupHero.module.css";

type GroupKind = "faction" | "institution" | "unassigned";

const KIND_EYEBROW_PREFIX: Record<GroupKind, string> = {
  faction: "FACTION",
  institution: "INSTITUTION",
  unassigned: "UNASSIGNED",
};

interface SubUnitItem {
  code: string;
  label: string;
}

interface Props {
  groupLabel: string;
  groupLabelEn: string;
  kind: GroupKind;
  subUnits?: SubUnitItem[];
  memberCount: number;
  /** 교리 / 원칙 한 줄 */
  doctrine?: string;
  /** V~U 등급 분포 */
  levelCounts?: Partial<Record<AgentLevel, number>>;
  /** 감독 영역 (institution 전용, subUnit 없을 때만 활용) */
  oversight?: string;
  /** OrgIcon 코드 — 헤더 좌측 작은 식별 아이콘용 (SVG line). */
  iconCode?: OrgIconCode;
  /** 우하단 webp 워터마크 로고 URL — faction/institution 일 때만 전달. */
  logoUrl?: string;
  /** 현재 펼쳐진 sub-unit code — 해당 chip 을 active 강조 */
  expandedSubUnit?: string | null;
  /** sub-unit chip 클릭 핸들러. 전달되면 chip 이 button 으로 렌더되고
      클릭 시 해당 sub-unit accordion 을 토글한다. */
  onSubUnitClick?: (code: string) => void;
  onBack: () => void;
}

export default function GroupHero({
  groupLabel,
  groupLabelEn,
  kind,
  subUnits,
  memberCount,
  doctrine,
  levelCounts,
  oversight,
  iconCode,
  logoUrl,
  expandedSubUnit,
  onSubUnitClick,
  onBack,
}: Props) {
  const eyebrowText = KIND_EYEBROW_PREFIX[kind];

  const subUnitCount = subUnits?.length ?? 0;
  const hasSubUnits = subUnitCount > 0;

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
          <h2 className={styles.title}>
            {iconCode ? (
              <OrgIcon
                code={iconCode}
                size={26}
                className={styles.titleIcon}
              />
            ) : null}
            {groupLabel}
          </h2>
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
            <div className={styles.subUnitChips}>
              {subUnits!.map((u) => {
                const subIcon = SUBUNIT_ICON_MAP[u.code];
                const isOn = expandedSubUnit === u.code;
                const chipClass = [
                  styles.subUnitChip,
                  onSubUnitClick ? styles["subUnitChip--clickable"] : "",
                  isOn ? styles["subUnitChip--on"] : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                const inner = (
                  <>
                    {subIcon ? <OrgIcon code={subIcon} size={14} /> : null}
                    <span>{u.label}</span>
                  </>
                );

                if (onSubUnitClick) {
                  return (
                    <button
                      key={u.code}
                      type="button"
                      className={chipClass}
                      onClick={() => onSubUnitClick(u.code)}
                      aria-pressed={isOn}
                    >
                      {inner}
                    </button>
                  );
                }

                return (
                  <span key={u.code} className={chipClass}>
                    {inner}
                  </span>
                );
              })}
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
