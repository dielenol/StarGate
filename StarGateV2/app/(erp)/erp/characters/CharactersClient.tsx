"use client";

import Link from "next/link";
import { useState } from "react";

import type {
  AgentCharacter,
  Character,
  CharacterTier,
} from "@/types/character";

import { useAgentCharactersQuery } from "@/hooks/queries/useCharactersQuery";

import { getDepartmentLabel } from "@/lib/org-structure";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import OrgIcon from "../personnel/_components/OrgIcon";

import styles from "./page.module.css";

const VALID_TIERS: CharacterTier[] = ["MAIN", "MINI"];

const TIER_LABEL: Record<CharacterTier, string> = {
  MAIN: "MAIN",
  MINI: "MINI",
};

const FILTER_LABEL: Record<"ALL" | CharacterTier, string> = {
  ALL: "ALL",
  MAIN: "MAIN",
  MINI: "MINI",
};

const HP_MAX = 300;
const SAN_MAX = 100;

function getInitial(c: Character): string {
  const source = c.lore.name || c.codename;
  return source.charAt(0).toUpperCase() || "?";
}

function isAgent(c: Character): c is AgentCharacter {
  return c.type === "AGENT";
}

/** tier 미설정 데이터는 MAIN 으로 fallback (legacy 호환). */
function tierOf(c: Character): CharacterTier {
  return c.tier ?? "MAIN";
}

interface Props {
  initialCharacters: Character[];
  tierFilter: CharacterTier | null;
  isGMOrAbove: boolean;
}

export default function CharactersClient({
  initialCharacters,
  tierFilter,
  isGMOrAbove,
}: Props) {
  // 카운트(ALL/MAIN/MINI) 정확도를 위해 쿼리는 항상 전체("ALL") 를 fetch.
  // tier 필터는 displayedAgents 에서 클라이언트 측으로만 적용.
  const { data: characters = [] } = useAgentCharactersQuery("ALL", {
    initialData: initialCharacters,
  });

  // server 가 type=AGENT 로 강제하지만 type narrow 를 위해 client 가드도 유지.
  const agents = characters.filter(isAgent);
  const displayedAgents = tierFilter
    ? agents.filter((c) => tierOf(c) === tierFilter)
    : agents;

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "CHARACTERS" },
        ]}
        title="플레이어블 캐릭터"
        right={
          isGMOrAbove ? (
            <Button as="a" href="/erp/characters/new" variant="primary">
              + 신규
            </Button>
          ) : null
        }
      />

      <nav className={styles.filters} aria-label="캐릭터 분류 필터">
        <Link
          href="/erp/characters"
          className={[
            styles.filters__tab,
            !tierFilter ? styles["filters__tab--active"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-current={!tierFilter ? "page" : undefined}
        >
          <OrgIcon code="ALL" size={16} className={styles.filters__tab__icon} />
          {FILTER_LABEL.ALL}
          <span className={styles.filters__tab__count}>
            · <b>{agents.length}</b>
          </span>
        </Link>
        {VALID_TIERS.map((t) => {
          const count = agents.filter((c) => tierOf(c) === t).length;
          const active = tierFilter === t;
          return (
            <Link
              key={t}
              href={`/erp/characters?tier=${t}`}
              className={[
                styles.filters__tab,
                active ? styles["filters__tab--active"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={active ? "page" : undefined}
            >
              <OrgIcon
                code={t}
                size={16}
                className={styles.filters__tab__icon}
              />
              {FILTER_LABEL[t]}
              <span className={styles.filters__tab__count}>
                · <b>{count}</b>
              </span>
            </Link>
          );
        })}
      </nav>

      {displayedAgents.length === 0 ? (
        <div className={styles.empty}>등록된 캐릭터가 없습니다.</div>
      ) : (
        <div className={styles.grid}>
          {displayedAgents.map((c) => {
            const id = String(c._id);
            const departmentLabel = c.department
              ? getDepartmentLabel(c.department)
              : null;
            const subLine = [c.role, departmentLabel]
              .filter(Boolean)
              .join(" · ");
            const displayName = c.lore.name || c.codename;
            const tier = tierOf(c);

            return (
              <Link
                key={id}
                href={`/erp/characters/${id}`}
                className={styles.cardLink}
              >
                <div className={styles.card}>
                  <div className={styles.card__head}>
                    <CharacterCardThumb
                      src={c.previewImage}
                      alt={`${displayName} 미리보기`}
                      initial={getInitial(c)}
                    />
                    <div className={styles.card__headBody}>
                      <div className={styles.card__code}>{c.codename}</div>
                      <div className={styles.card__name}>{displayName}</div>
                      {subLine ? (
                        <div className={styles.card__sub}>{subLine}</div>
                      ) : null}
                    </div>
                    <span
                      className={`${styles.tag} ${
                        tier === "MAIN"
                          ? styles["tag--gold"]
                          : styles["tag--default"]
                      }`}
                    >
                      <OrgIcon
                        code={tier}
                        size={12}
                        className={styles.tag__icon}
                      />
                      {TIER_LABEL[tier]}
                    </span>
                  </div>

                  <div className={styles.card__stats}>
                    <StatRow
                      label="HP"
                      value={c.play.hp}
                      max={HP_MAX}
                      tone="gold"
                    />
                    <StatRow
                      label="SAN"
                      value={c.play.san}
                      max={SAN_MAX}
                      tone={c.play.san < 30 ? "danger" : "info"}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

/** AGENT 카드 vitals 한 줄 — 라벨 + tick 5단 progress bar + 숫자값 */
/** 캐릭터 카드 썸네일 — src 가 비어 있거나 로드 실패 시 자동으로 seal placeholder 로 fallback. */
function CharacterCardThumb({
  src,
  alt,
  initial,
}: {
  src: string | undefined | null;
  alt: string;
  initial: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  if (showImage) {
    return (
      <div className={styles.card__thumbWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={styles.card__thumb}
          onError={() => setErrored(true)}
        />
        <span
          className={`${styles.card__thumb__tick} ${styles["card__thumb__tick--tl"]}`}
          aria-hidden
        />
        <span
          className={`${styles.card__thumb__tick} ${styles["card__thumb__tick--br"]}`}
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div className={styles.card__seal} aria-hidden>
      {initial}
      <span
        className={`${styles.card__seal__tick} ${styles["card__seal__tick--tl"]}`}
        aria-hidden
      />
    </div>
  );
}

function StatRow({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "gold" | "info" | "danger";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const barClass = [
    styles.card__statBar,
    tone === "info"
      ? styles["card__statBar--info"]
      : tone === "danger"
        ? styles["card__statBar--danger"]
        : "",
  ]
    .filter(Boolean)
    .join(" ");
  const valueClass = [
    styles.card__statValue,
    tone === "danger" ? styles["card__statValue--danger"] : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.card__stat}>
      <span className={styles.card__statLabel}>{label}</span>
      <span className={barClass} aria-hidden>
        <span
          className={styles.card__statBar__fill}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}
