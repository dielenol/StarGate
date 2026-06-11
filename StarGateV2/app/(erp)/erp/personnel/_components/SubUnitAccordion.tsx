"use client";

import type { ReactNode } from "react";

import { preferOptimizedPublicImagePath } from "@/lib/asset-path";

import { getExternalSubOrg } from "../_constants";

import OrgIcon, { getInstitutionIcon, getSubUnitIcon } from "./OrgIcon";

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
  const externalSubOrg = getExternalSubOrg(code);

  const metaParts: string[] = [`${memberCount}명`];
  if (leadCount && leadCount > 0) {
    metaParts.push(`부서장 ${leadCount}`);
  }

  const subIcon = getSubUnitIcon(code) ?? getInstitutionIcon(code);
  const subLogo = externalSubOrg?.logoUrl;
  const optimizedSubLogo = subLogo
    ? preferOptimizedPublicImagePath(subLogo)
    : undefined;
  const displayLabel = externalSubOrg?.label ?? label;
  const tone =
    externalSubOrg?.parentCode === "HOSTILE" ? ("hostile" as const) : undefined;

  return (
    <div
      id={`subunit-${code}`}
      data-subunit={code}
      data-tone={tone}
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
        {optimizedSubLogo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={optimizedSubLogo}
            alt=""
            className={styles.logo}
            aria-hidden
          />
        ) : subIcon ? (
          <OrgIcon code={subIcon} size={18} className={styles.icon} />
        ) : null}
        {externalSubOrg ? (
          <>
            <span className={styles.label}>{displayLabel}</span>
            <span className={styles.subCount}>
              / {agentCount} AGENT / {npcCount} NPC
            </span>
            <span className={styles.summary}>{externalSubOrg.summary}</span>
          </>
        ) : (
          <>
            <span className={styles.code}>{code}</span>
            <span className={styles.label}>{displayLabel}</span>
            <span className={styles.subCount}>
              / {agentCount} AGENT · {npcCount} NPC
            </span>
            <span className={styles.meta}>{metaParts.join(" · ")}</span>
          </>
        )}
        {optimizedSubLogo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={optimizedSubLogo}
            alt=""
            className={styles.watermark}
            aria-hidden
          />
        ) : null}
      </button>

      {expanded && <div className={styles.body}>{children}</div>}
    </div>
  );
}
