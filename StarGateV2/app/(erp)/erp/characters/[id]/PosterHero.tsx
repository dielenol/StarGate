"use client";

import Image from "next/image";
import { Fragment, useEffect, useState } from "react";

import {
  AGENT_LEVEL_LABELS,
  DEPARTMENTS,
  FACTIONS,
  INSTITUTIONS,
  type Ability,
  type AbilitySlot,
  type AgentLevel,
  type PlaySheet,
} from "@/types/character";

import Bar from "@/components/ui/Bar/Bar";
import Seal from "@/components/ui/Seal/Seal";
import { IconClose, IconZoom } from "@/components/icons";

import { getFactionLogo, FACTION_LOGO } from "@/app/(erp)/erp/personnel/_constants";
import { preferOptimizedPublicImagePath } from "@/lib/asset-path";
import {
  getCharacterDisplayName,
  getCharacterRoleLine,
} from "@/lib/format/character-display";

import styles from "./PosterHero.module.css";

interface Props {
  posterImage?: string;
  mainImage: string;
  codename: string;
  name: string;
  nickname?: string;
  role: string;
  agentLevel?: AgentLevel;
  /** 외부 기관 코드 (군부/이사회/시민사회). NPC 위주, 없으면 institutionCode 로 폴백. */
  factionCode?: string;
  /** 노부스 오르도 내부 기관 코드 (사무국/현장 등). AGENT 위주.
   *  재무는 사무국 산하 sub-unit 으로 강등됨 (department="FINANCE"). */
  institutionCode?: string;
  /** 기관 산하 subUnit 코드 또는 legacy 부서 코드. 소속과 함께 hierarchy 표현. */
  department?: string;
  /** 시트 신상 — portrait 하단 meta 라인 (gender · age · height) */
  gender?: string;
  age?: string;
  height?: string;
  /** 우측 rail 인용문 카드. 빈 값/undefined 면 미노출. */
  quote?: string;
  /** 우측 rail ABILITIES 패널 — AGENT 한정. CHARACTER PROFILE 자리 차지.
   *  외모/성격/배경(appearance/personality/background) 은 본 컴포넌트 외부 (AgentSections)
   *  로 이동했다. */
  abilities?: Ability[];
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

/** ABILITIES 슬롯 표시 순서 (CharacterDetailClient 와 동일). */
const ABILITY_SLOT_ORDER: AbilitySlot[] = [
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "P",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
];

/**
 * factionCode 미지정 시 기본 노부스 오르도 로고.
 * personnel/_constants 의 FACTION_LOGO.NOVUS_ORDO 와 일치 (SSOT).
 */
const NOVUS_ORDO_LOGO = FACTION_LOGO.NOVUS_ORDO;

/** factionCode → 한글 label (shared-db FACTIONS 매핑). */
function resolveFactionLabel(code?: string): string | null {
  if (!code) return null;
  const found = FACTIONS.find((f) => f.code === code);
  return found?.label ?? code;
}

/** institutionCode → 한글 label (shared-db INSTITUTIONS 매핑). */
function resolveInstitutionLabel(code?: string): string | null {
  if (!code) return null;
  const found = INSTITUTIONS.find((i) => i.code === code);
  return found?.label ?? code;
}

/**
 * department code → 한글 label. institution 산하 subUnit 우선, 없으면 legacy DEPARTMENTS,
 * 그래도 매칭 안 되면 raw 코드.
 */
function resolveDeptLabel(
  deptCode?: string,
  institutionCode?: string,
): string | null {
  if (!deptCode) return null;
  if (institutionCode) {
    const inst = INSTITUTIONS.find((i) => i.code === institutionCode);
    const sub = inst?.subUnits.find((s) => s.code === deptCode);
    if (sub) return sub.label;
  }
  const legacy = DEPARTMENTS.find((d) => d.code === deptCode);
  return legacy?.label ?? deptCode;
}

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
  nickname,
  role,
  agentLevel,
  factionCode,
  institutionCode,
  department,
  gender,
  age,
  height,
  quote,
  abilities,
  nameEn,
  roleDetail,
  notes,
  playSheet,
}: Props) {
  // HERO 이미지 뷰 토글 — main(기본) ↔ poster(옵션). 두 자산 모두 있을 때만 토글 노출.
  const optimizedMainImage = mainImage
    ? preferOptimizedPublicImagePath(mainImage)
    : "";
  const optimizedPosterImage = posterImage
    ? preferOptimizedPublicImagePath(posterImage)
    : undefined;
  const hasMain = Boolean(optimizedMainImage);
  const hasPoster = Boolean(optimizedPosterImage);
  const canToggleView = hasMain && hasPoster;
  // 정책: 캐릭터 탭/프로필 탭 모두 기본 MAIN.
  const [view, setView] = useState<"poster" | "main">(
    hasMain ? "main" : "poster",
  );
  const [zoomOpen, setZoomOpen] = useState(false);
  const heroSrc =
    view === "main"
      ? optimizedMainImage || optimizedPosterImage || null
      : optimizedPosterImage || optimizedMainImage || null;

  // lightbox 열림 동안 ESC 닫기 + body 스크롤 락.
  useEffect(() => {
    if (!zoomOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [zoomOpen]);
  // contain 처리: main 뷰는 다양한 비율 (정사각/세로) → 잘림 방지.
  const isPortraitFallback = view === "main" && hasMain;
  const displayName = getCharacterDisplayName({
    codename,
    role,
    department,
    lore: { name, nickname },
  });
  const roleLine = getCharacterRoleLine({ role, department });

  const logoSrc = factionCode
    ? getFactionLogo(factionCode) ?? NOVUS_ORDO_LOGO
    : NOVUS_ORDO_LOGO;

  // 소속 우선순위: faction(외부 기관) → institution(노부스 오르도 내부 기관) → 노부스 오르도 폴백.
  // 부서: institution 산하 subUnit 우선 → legacy DEPARTMENTS 폴백. 소속과 자연스럽게 위계 표현.
  const factionLabel = resolveFactionLabel(factionCode);
  const institutionLabel = resolveInstitutionLabel(institutionCode);
  const affiliationLabel = factionLabel ?? institutionLabel ?? "노부스 오르도";
  const deptLabel = resolveDeptLabel(department, institutionCode);

  // meta 라인 — gender / age / height. 빈 값은 제외. key/value 분리해 grid 컬럼 정렬.
  const metaItems: { key: string; value: string }[] = [
    gender ? { key: "GENDER", value: gender } : null,
    age ? { key: "AGE", value: age } : null,
    height ? { key: "HEIGHT", value: height } : null,
  ].filter((m): m is { key: string; value: string } => m !== null);

  return (
    <section className={styles.hero} aria-label="캐릭터 히어로">
      {/* ── 좌측 portrait ── */}
      <div className={styles.hero__poster}>
        {heroSrc ? (
          <Image
            key={view /* src 변경 시 캐시 분리 */}
            src={heroSrc}
            alt={`${displayName} ${view === "poster" ? "포스터" : "메인 이미지"}`}
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

        {/* 우상단 zoom 버튼 — 클릭 시 lightbox 모달로 이미지 확대. 이미지 자산이 있을 때만 노출. */}
        {heroSrc ? (
          <button
            type="button"
            className={styles.hero__zoom}
            onClick={() => setZoomOpen(true)}
            aria-label="이미지 확대 보기"
          >
            <IconZoom className={styles.hero__zoomIcon} />
          </button>
        ) : null}

        {/* 좌상단 view toggle — main ↔ poster (두 자산 모두 있을 때만) */}
        {canToggleView ? (
          <div
            className={styles.hero__viewToggle}
            role="tablist"
            aria-label="이미지 전환"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "main"}
              className={`${styles.hero__viewToggleBtn} ${
                view === "main" ? styles["hero__viewToggleBtn--on"] : ""
              }`}
              onClick={() => setView("main")}
            >
              MAIN
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "poster"}
              className={`${styles.hero__viewToggleBtn} ${
                view === "poster" ? styles["hero__viewToggleBtn--on"] : ""
              }`}
              onClick={() => setView("poster")}
            >
              POSTER
            </button>
          </div>
        ) : null}

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

        {/* caption — 좌측 codename/name/role/meta stack + 우측 quote 박스 (가로 2열).
            메타 라인이 wrap 돼도 좌측만 자라며 quote 박스는 우측 컬럼에 정렬 유지. */}
        <div className={styles.hero__caption}>
          <div className={styles.hero__captionMain}>
            <div className={styles.hero__captionCode}>{codename}</div>
            <h2 className={styles.hero__captionName}>{displayName}</h2>
            {roleLine ? (
              <div className={styles.hero__captionAlias}>{roleLine}</div>
            ) : null}
            {metaItems.length > 0 ? (
              <div className={styles.hero__captionMeta}>
                {metaItems.map((item) => (
                  <Fragment key={item.key}>
                    <span className={styles.hero__captionMetaKey}>
                      {item.key}
                    </span>
                    <span
                      className={styles.hero__captionMetaSep}
                      aria-hidden
                    >
                      ·
                    </span>
                    <span className={styles.hero__captionMetaValue}>
                      {item.value}
                    </span>
                  </Fragment>
                ))}
              </div>
            ) : null}
          </div>
          {quote ? (
            <blockquote className={styles.hero__captionQuote}>
              <span
                className={`${styles.hero__captionQuoteMark} ${styles["hero__captionQuoteMark--open"]}`}
                aria-hidden
              >
                &ldquo;
              </span>
              <p>{quote}</p>
              <span
                className={`${styles.hero__captionQuoteMark} ${styles["hero__captionQuoteMark--close"]}`}
                aria-hidden
              >
                &rdquo;
              </span>
            </blockquote>
          ) : null}
        </div>
      </div>

      {/* ── 우측 side rail ── */}
      <div className={styles.hero__side}>
        {/* LOGO + VITALS — 같은 row. quote 는 portrait caption 으로 흡수됨. */}
        <div className={styles.hero__topRow}>
          {/* LOGO card */}
          <div className={styles.hero__logoCard}>
            <div className={styles.hero__logoSlot}>
              <Image
                src={logoSrc}
                alt={`${affiliationLabel} 로고`}
                width={64}
                height={64}
                className={styles.hero__logoSlotImage}
              />
            </div>
            <div className={styles.hero__logoMeta}>
              <div className={styles.hero__logoK}>소속</div>
              <div className={styles.hero__logoV}>{affiliationLabel}</div>
              {deptLabel ? (
                <>
                  <div className={styles.hero__logoK}>부서</div>
                  <div
                    className={`${styles.hero__logoV} ${styles["hero__logoV--dim"]}`}
                  >
                    {deptLabel}
                  </div>
                </>
              ) : null}
              {agentLevel ? (
                <>
                  <div className={styles.hero__logoK}>등급</div>
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

          {/* VITALS — quote 자리로 이동. AGENT 한정. */}
          {playSheet ? (
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
          ) : null}
        </div>

        {/* AGENT DETAILS — AGENT 한정. CLASS/ABILITY TYPE/WEAPON/SKILL 모두 비면 패널 생략. */}
        {playSheet &&
        (playSheet.className ||
          playSheet.abilityType ||
          playSheet.weaponTraining.length > 0 ||
          playSheet.skillTraining.length > 0) ? (
          <div className={styles.hero__panel}>
            <div className={styles.hero__panelHead}>
              <span>AGENT DETAILS</span>
              <span className={styles.hero__panelHeadSub}>SHEET</span>
            </div>
            {playSheet.className || playSheet.abilityType ? (
              <div className={styles.hero__detailsGrid}>
                {playSheet.className ? (
                  <Cell k="CLASS" v={playSheet.className} />
                ) : null}
                {playSheet.abilityType ? (
                  <Cell k="ABILITY TYPE" v={playSheet.abilityType} />
                ) : null}
              </div>
            ) : null}
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
        ) : null}

        {/* ABILITIES — AGENT 한정. 채워진 슬롯 없어도 패널 헤더 + placeholder 노출 (휑함 회피).
            abilities prop 자체가 undefined 면 NPC 케이스라 패널 미노출. */}
        {abilities
          ? (() => {
              const bySlot = new Map(abilities.map((ab) => [ab.slot, ab]));
              const filled = ABILITY_SLOT_ORDER.flatMap((slot) => {
                const ab = bySlot.get(slot);
                return ab && ab.name.trim().length > 0 ? [{ slot, ab }] : [];
              });
              return (
                <div className={styles.hero__panel}>
                  <div className={styles.hero__panelHead}>
                    <span>ABILITIES</span>
                    <span className={styles.hero__panelHeadSub}>
                      {filled.length} / {ABILITY_SLOT_ORDER.length} SLOTS
                    </span>
                  </div>
                  {filled.length === 0 ? (
                    <div className={styles.hero__abilityEmpty}>
                      등록된 어빌리티가 없습니다.
                    </div>
                  ) : (
                    <ul className={styles.hero__abilityList}>
                      {filled.map(({ slot, ab }) => (
                        <li key={slot} className={styles.hero__abilityItem}>
                          <div className={styles.hero__abilityHead}>
                            <span className={styles.hero__abilitySlot}>
                              {slot}
                            </span>
                            <span className={styles.hero__abilityName}>
                              {ab.name}
                            </span>
                          </div>
                          {ab.description ? (
                            <div className={styles.hero__abilityDesc}>
                              {ab.description}
                            </div>
                          ) : null}
                          {ab.effect ? (
                            <div className={styles.hero__abilityEffect}>
                              <span
                                className={styles.hero__abilityEffectLabel}
                              >
                                EFFECT ·
                              </span>{" "}
                              {ab.effect}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()
          : null}

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

      {/* Lightbox — 클릭/ESC 시 닫힘. 배경 클릭은 닫기, 이미지 클릭은 propagation 차단. */}
      {zoomOpen && heroSrc ? (
        <div
          className={styles.hero__lightbox}
          role="dialog"
          aria-modal="true"
          aria-label="이미지 확대 보기"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            className={styles.hero__lightboxClose}
            onClick={(e) => {
              e.stopPropagation();
              setZoomOpen(false);
            }}
            aria-label="닫기"
          >
            <IconClose />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- lightbox 는 자유 폭/높이 (max-vw/vh) 라 next/image fill 보다 raw img 가 단순 */}
          <img
            src={heroSrc}
            alt={`${displayName} ${view === "poster" ? "포스터" : "메인 이미지"} 확대`}
            className={styles.hero__lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
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
