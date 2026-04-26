import Image from "next/image";

import type { AgentLevel, CharacterType } from "@/types/character";

import Seal from "@/components/ui/Seal/Seal";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./PosterHero.module.css";

interface Props {
  posterImage?: string;
  mainImage: string;
  codename: string;
  name: string;
  type: CharacterType;
  role: string;
  agentLevel?: AgentLevel;
  /** 소속 코드 (faction 또는 NPC factionCode). LOGO/AFFILIATION 라벨용. */
  factionCode?: string;
  /** 부서 코드 (department 또는 NPC institutionCode). DEPT 라벨용. */
  department?: string;
  /** 시트 신상 — portrait 하단 meta 라인 (gender · age · height) */
  gender?: string;
  age?: string;
  height?: string;
}

/**
 * Faction code → 로고 정적 매핑.
 * 신규 faction 추가 시 본 매핑 + public/assets/faction/ 에 로고 webp 추가.
 */
const FACTION_LOGOS: Record<string, string> = {
  MILITARY: "/assets/faction/military_logo.webp",
  COUNCIL: "/assets/faction/world_council_logo.webp",
  CIVIL: "/assets/faction/civil_society_logo.webp",
};

const FACTION_LABELS: Record<string, string> = {
  MILITARY: "MILITARY",
  COUNCIL: "WORLD COUNCIL",
  CIVIL: "CIVIL SOCIETY",
};

/** Department / Institution / Sub-unit 코드 → 영문 라벨 (군사/도시어 톤). */
const DEPT_LABELS: Record<string, string> = {
  HQ: "HQ · 사무총장실",
  FIELD: "FIELD OPS",
  RESEARCH: "RESEARCH",
  SECURITY: "SECURITY",
  LOGISTICS: "LOGISTICS",
  EXTERNAL: "EXTERNAL AFFAIRS",
  UNASSIGNED: "UNASSIGNED",
  SECRETARIAT: "SECRETARIAT",
  FINANCE: "FINANCIAL BUREAU",
  ADMIN_BUREAU: "ADMIN BUREAU",
  INTL: "INTERNATIONAL",
  CONTROL: "CONTROL",
};

/** factionCode 미지정 시 기본 노부스 오르도 로고. */
const NOVUS_ORDO_LOGO = "/assets/StarGate_logo.png";

function getInitial(source: string): string {
  return source.charAt(0).toUpperCase() || "?";
}

/**
 * 캐릭터 상세 상단 히어로 (Tower 레이아웃 — Claude Design 슬롯 3, 1단계).
 *
 * 구성:
 *  - 좌측: 큰 portrait 3:4 + 코너 틱 + gradient overlay + caption (codename/name/role) + meta(gender·age·height)
 *  - 우측 rail: LOGO 카드 (faction logo + AFFILIATION + DEPT) + tags (type/agentLevel)
 *
 * 1단계 범위 외 (CharacterDetailClient 시트 영역 유지):
 *   - vitals (HP/SAN/DEF/ATK)
 *   - agent details (class/weight/credit/skills)
 *   - quote
 *
 * 이미지 fallback chain:
 *  1. posterImage (LCP 후보)
 *  2. mainImage 풀블리드 cover
 *  3. Seal 이니셜 + 캐릭터명 빗금 placeholder
 */
export default function PosterHero({
  posterImage,
  mainImage,
  codename,
  name,
  type,
  role,
  agentLevel,
  factionCode,
  department,
  gender,
  age,
  height,
}: Props) {
  const heroSrc = posterImage || mainImage || null;
  const isPortraitFallback = !posterImage && Boolean(mainImage);
  const displayName = name || codename;

  const logoSrc = factionCode
    ? FACTION_LOGOS[factionCode] ?? NOVUS_ORDO_LOGO
    : NOVUS_ORDO_LOGO;
  const factionLabel = factionCode
    ? FACTION_LABELS[factionCode] ?? factionCode
    : "NOVUS ORDO";
  const deptLabel = department
    ? DEPT_LABELS[department] ?? department
    : null;

  // meta 라인 — gender / age / height. 빈 값은 제외.
  const metaItems = [
    gender ? `GENDER · ${gender}` : null,
    age ? `AGE · ${age}` : null,
    height ? `HEIGHT · ${height}` : null,
  ].filter((s): s is string => Boolean(s));

  return (
    <section className={styles.hero} aria-label="캐릭터 히어로">
      {/* ── 좌측 portrait ── */}
      <div className={styles.hero__poster}>
        {heroSrc ? (
          <Image
            src={heroSrc}
            alt={`${displayName} ${posterImage ? "포스터" : "메인 이미지"}`}
            fill
            sizes="(max-width: 760px) 100vw, 540px"
            className={[
              styles.hero__posterImage,
              isPortraitFallback ? styles["hero__posterImage--portrait"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
            priority
          />
        ) : (
          <div className={styles.hero__posterEmpty} aria-hidden>
            <Seal size="lg">{getInitial(displayName)}</Seal>
            <div className={styles.hero__posterEmptyName}>{displayName}</div>
          </div>
        )}

        {/* corner ticks */}
        <span
          className={`${styles.hero__corner} ${styles["hero__corner--tl"]}`}
          aria-hidden
        />
        <span
          className={`${styles.hero__corner} ${styles["hero__corner--tr"]}`}
          aria-hidden
        />
        <span
          className={`${styles.hero__corner} ${styles["hero__corner--bl"]}`}
          aria-hidden
        />
        <span
          className={`${styles.hero__corner} ${styles["hero__corner--br"]}`}
          aria-hidden
        />

        {/* gradient overlay */}
        <div className={styles.hero__gradient} aria-hidden />

        {/* caption */}
        <div className={styles.hero__caption}>
          <div className={styles.hero__captionCode}>{codename}</div>
          <h2 className={styles.hero__captionName}>{displayName}</h2>
          {role ? (
            <div className={styles.hero__captionAlias}>{role}</div>
          ) : null}
        </div>

        {/* meta line */}
        {metaItems.length > 0 ? (
          <div className={styles.hero__captionMeta}>
            {metaItems.map((item, i) => (
              <span key={item} className={styles.hero__captionMetaItem}>
                {i > 0 ? (
                  <span className={styles.hero__captionMetaSep}>│</span>
                ) : null}
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── 우측 side rail ── */}
      <div className={styles.hero__side}>
        {/* LOGO card */}
        <div className={styles.hero__logoCard}>
          <div className={styles.hero__logoSlot}>
            <Image
              src={logoSrc}
              alt={`${factionLabel} 로고`}
              width={86}
              height={86}
              className={styles.hero__logoSlotImage}
            />
          </div>
          <div className={styles.hero__logoMeta}>
            <div className={styles.hero__logoK}>AFFILIATION</div>
            <div className={styles.hero__logoV}>{factionLabel}</div>
            {deptLabel ? (
              <>
                <div className={styles.hero__logoK}>DEPT.</div>
                <div
                  className={`${styles.hero__logoV} ${styles["hero__logoV--dim"]}`}
                >
                  {deptLabel}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* tags */}
        <div className={styles.hero__tags}>
          <Tag tone={type === "AGENT" ? "gold" : "default"}>{type}</Tag>
          {agentLevel ? <Tag tone="default">CLR {agentLevel}</Tag> : null}
        </div>
      </div>
    </section>
  );
}
