import Image from "next/image";

import { AGENT_LEVEL_LABELS, type AgentLevel, type PlaySheet } from "@/types/character";

import Bar from "@/components/ui/Bar/Bar";
import Seal from "@/components/ui/Seal/Seal";

import styles from "./PosterHero.module.css";

interface Props {
  posterImage?: string;
  mainImage: string;
  codename: string;
  name: string;
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
  /** 우측 rail 인용문 카드. 빈 값/undefined 면 미노출. */
  quote?: string;
  /** 우측 rail PROFILE 패널 — 외모/성격/배경 (Sheet 공통 필드). */
  appearance?: string;
  personality?: string;
  background?: string;
  /** NPC 전용 — nameEn / roleDetail / notes. AGENT 면 undefined. */
  nameEn?: string;
  roleDetail?: string;
  notes?: string;
  /**
   * AGENT play sub-document (있을 때만 우측 rail 에 VITALS / AGENT DETAILS 패널 노출).
   * NPC 는 undefined 로 전달 → 패널 자체 미노출.
   */
  playSheet?: PlaySheet;
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
 * 캐릭터 상세 상단 히어로 (Tower 레이아웃 — Claude Design 슬롯 3, 2단계 본작업).
 *
 * 구성:
 *  - 좌측: 큰 portrait 3:4 + 코너 틱 + gradient overlay + caption (codename/name/role) + meta(gender·age·height)
 *  - 우측 rail:
 *    1. LOGO 카드 (faction logo + AFFILIATION + DEPT + CLEARANCE)
 *    2. QUOTE blockquote (있을 때)
 *    3. VITALS 패널 (AGENT 한정 — HP/SAN bar + DEF/ATK pair)
 *    4. AGENT DETAILS 패널 (AGENT 한정 — CLASS/WEIGHT/ABILITY/CREDIT 그리드 + WEAPON/SKILL extra)
 *
 * type 배지(AGENT/NPC), isPublic 배지는 PageHead 우측 액션 영역에 있어 중복 회피.
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
  role,
  agentLevel,
  factionCode,
  department,
  gender,
  age,
  height,
  quote,
  appearance,
  personality,
  background,
  nameEn,
  roleDetail,
  notes,
  playSheet,
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

        {/* caption + meta — 한 컨테이너로 묶어 메타 라인이 wrap 돼도 caption 과
            겹치지 않고 자연스럽게 위로 밀리도록 stacked. */}
        <div className={styles.hero__caption}>
          <div className={styles.hero__captionCode}>{codename}</div>
          <h2 className={styles.hero__captionName}>{displayName}</h2>
          {role ? (
            <div className={styles.hero__captionAlias}>{role}</div>
          ) : null}
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
      </div>

      {/* ── 우측 side rail ── */}
      <div className={styles.hero__side}>
        {/* LOGO + QUOTE — 같은 row */}
        <div className={styles.hero__topRow}>
          {/* LOGO card */}
          <div className={styles.hero__logoCard}>
            <div className={styles.hero__logoSlot}>
              <Image
                src={logoSrc}
                alt={`${factionLabel} 로고`}
                width={64}
                height={64}
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
              {agentLevel ? (
                <>
                  <div className={styles.hero__logoK}>CLEARANCE</div>
                  <div
                    className={`${styles.hero__logoV} ${styles["hero__logoV--rank"]}`}
                    data-rank={agentLevel}
                  >
                    {agentLevel} · {AGENT_LEVEL_LABELS[agentLevel]}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* QUOTE — 같은 row */}
          {quote ? (
            <blockquote className={styles.hero__quote}>
              <span className={styles.hero__quoteMark} aria-hidden>
                &ldquo;
              </span>
              <p>{quote}</p>
              <span
                className={`${styles.hero__quoteMark} ${styles["hero__quoteMark--close"]}`}
                aria-hidden
              >
                &rdquo;
              </span>
            </blockquote>
          ) : null}
        </div>

        {/* VITALS / AGENT DETAILS — AGENT 한정. delta 메모는 stat 라인에 부각 표기. */}
        {playSheet ? (
          <>
            <div className={styles.hero__panel}>
              <div className={styles.hero__panelHead}>
                <span>VITALS</span>
                <span className={styles.hero__statusDot}>STATUS · ACTIVE</span>
              </div>
              <VitalBarRow
                label="HP"
                value={playSheet.hp}
                delta={playSheet.hpDelta}
                max={300}
                tone="gold"
              />
              <VitalBarRow
                label="SAN"
                value={playSheet.san}
                delta={playSheet.sanDelta}
                max={100}
                tone={playSheet.san < 30 ? "danger" : "info"}
              />
              <div className={styles.hero__vitalsPair}>
                <SmallVital
                  label="DEF"
                  value={playSheet.def}
                  delta={playSheet.defDelta}
                  max={5}
                />
                <SmallVital
                  label="ATK"
                  value={playSheet.atk}
                  delta={playSheet.atkDelta}
                  max={20}
                />
              </div>
            </div>

            <div className={styles.hero__panel}>
              <div className={styles.hero__panelHead}>
                <span>AGENT DETAILS</span>
                <span className={styles.hero__panelHeadSub}>SHEET</span>
              </div>
              <div className={styles.hero__detailsGrid}>
                {playSheet.className ? (
                  <Cell k="CLASS" v={playSheet.className} />
                ) : null}
                {playSheet.abilityType ? (
                  <Cell k="ABILITY TYPE" v={playSheet.abilityType} />
                ) : null}
                {playSheet.credit !== "" && playSheet.credit !== undefined ? (
                  <Cell k="CREDIT" v={`¤ ${playSheet.credit}`} gold />
                ) : null}
              </div>
              {playSheet.weaponTraining.length > 0 ||
              playSheet.skillTraining.length > 0 ? (
                <div className={styles.hero__detailsExtra}>
                  {playSheet.weaponTraining.length > 0 ? (
                    <Cell
                      k="WEAPON"
                      v={playSheet.weaponTraining.join(", ")}
                    />
                  ) : null}
                  {playSheet.skillTraining.length > 0 ? (
                    <Cell
                      k="SKILL"
                      v={playSheet.skillTraining.join(", ")}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* CHARACTER PROFILE — 외모 / 성격 / 배경 */}
        {appearance || personality || background ? (
          <div className={styles.hero__panel}>
            <div className={styles.hero__panelHead}>
              <span>CHARACTER PROFILE</span>
              <span className={styles.hero__panelHeadSub}>DOSSIER</span>
            </div>
            <dl className={styles.hero__profileList}>
              <ProfileRow label="외모" value={appearance} />
              <ProfileRow label="성격" value={personality} />
              <ProfileRow label="배경" value={background} />
            </dl>
          </div>
        ) : null}

        {/* NPC EXTRAS — NPC 전용 추가 필드 */}
        {nameEn || roleDetail || notes ? (
          <div className={styles.hero__panel}>
            <div className={styles.hero__panelHead}>
              <span>NPC DETAILS</span>
              <span className={styles.hero__panelHeadSub}>EXTRAS</span>
            </div>
            <dl className={styles.hero__profileList}>
              {nameEn ? <ProfileRow label="NAME (EN)" value={nameEn} /> : null}
              {roleDetail ? (
                <ProfileRow label="ROLE DETAIL" value={roleDetail} />
              ) : null}
              {notes ? <ProfileRow label="NOTES" value={notes} /> : null}
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** 우측 rail PROFILE 패널 한 줄 — dt/dd 페어 */
function ProfileRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className={styles.hero__profileRow}>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

/**
 * delta 라벨 — "+5" / "-30" / "" (0 일 때는 비표시).
 * 시트 표기 "HP | 20 (-30)" 의 -30 메모를 시각화.
 */
function formatDelta(delta?: number): string {
  if (delta === undefined || delta === 0) return "";
  return delta > 0 ? ` (+${delta})` : ` (${delta})`;
}

/** 우측 rail 의 HP/SAN 진행 바 한 줄 — 라벨 + 값(b/max) + delta + Bar */
function VitalBarRow({
  label,
  value,
  delta,
  max,
  tone,
}: {
  label: string;
  value: number;
  delta?: number;
  max: number;
  tone: "gold" | "info" | "danger";
}) {
  return (
    <div className={styles.hero__vital}>
      <div className={styles.hero__vitalHead}>
        <span className={styles.hero__vitalLabel}>{label}</span>
        <span className={styles.hero__vitalValue}>
          <b>{value}</b>
          <span className={styles.hero__vitalMax}>
            /{max}
            {formatDelta(delta)}
          </span>
        </span>
      </div>
      <Bar value={value} tone={tone} />
    </div>
  );
}

/** DEF/ATK 작은 페어용 — 한 줄 라벨/값 + delta */
function SmallVital({
  label,
  value,
  delta,
  max,
}: {
  label: string;
  value: number;
  delta?: number;
  max: number;
}) {
  return (
    <div className={styles.hero__vitalSmall}>
      <span className={styles.hero__vitalLabel}>{label}</span>
      <span className={styles.hero__vitalValue}>
        <b>{value}</b>
        <span className={styles.hero__vitalMax}>
          /{max}
          {formatDelta(delta)}
        </span>
      </span>
    </div>
  );
}

/** AGENT DETAILS 그리드 셀 — 키/값 한 쌍 */
function Cell({
  k,
  v,
  gold = false,
}: {
  k: string;
  v: string;
  gold?: boolean;
}) {
  return (
    <div>
      <div className={styles.hero__cellK}>{k}</div>
      <div
        className={[styles.hero__cellV, gold ? styles["hero__cellV--gold"] : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {v}
      </div>
    </div>
  );
}
