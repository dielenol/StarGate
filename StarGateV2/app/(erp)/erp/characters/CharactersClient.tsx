"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type { AgentCharacterCardDto } from "@/hooks/queries/useCharactersQuery";
import { useAgentCharactersQuery } from "@/hooks/queries/useCharactersQuery";
import type { CharacterTier } from "@/types/character";

import { preferOptimizedPublicImagePath } from "@/lib/asset-path";
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

interface Props {
  initialCharacters: AgentCharacterCardDto[];
  tierFilter: CharacterTier | null;
  isGMOrAbove: boolean;
  viewerUserId: string;
}

function getInitial(c: AgentCharacterCardDto): string {
  const source = c.lore.name || c.codename;
  return source.charAt(0).toUpperCase() || "?";
}

function tierOf(c: AgentCharacterCardDto): CharacterTier {
  return c.tier ?? "MAIN";
}

function hrefForFilter(filter: "ALL" | CharacterTier) {
  return filter === "ALL" ? "/erp/characters" : `/erp/characters?tier=${filter}`;
}

function filterFromLocation(): CharacterTier | null {
  const params = new URLSearchParams(window.location.search);
  const tier = params.get("tier");
  return VALID_TIERS.includes(tier as CharacterTier)
    ? (tier as CharacterTier)
    : null;
}

function shouldUseClientNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export default function CharactersClient({
  initialCharacters,
  tierFilter,
  isGMOrAbove,
  viewerUserId,
}: Props) {
  const [activeTierFilter, setActiveTierFilter] =
    useState<CharacterTier | null>(tierFilter);

  const { data: characters = [] } = useAgentCharactersQuery("ALL", {
    initialData: initialCharacters,
  });

  const displayedAgents = useMemo(
    () =>
      activeTierFilter
        ? characters.filter((c) => tierOf(c) === activeTierFilter)
        : characters,
    [characters, activeTierFilter],
  );

  useEffect(() => {
    function handlePopState() {
      setActiveTierFilter(filterFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function handleFilterClick(
    filter: "ALL" | CharacterTier,
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    if (!shouldUseClientNavigation(event)) return;
    event.preventDefault();
    const nextFilter = filter === "ALL" ? null : filter;
    setActiveTierFilter(nextFilter);
    window.history.pushState(null, "", hrefForFilter(filter));
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "CHARACTERS" },
        ]}
        title="플레이어블 캐릭터"
      />

      <div className={styles.filterRow}>
        <nav className={styles.filters} aria-label="캐릭터 분류 필터">
          <Link
            href={hrefForFilter("ALL")}
            className={[
              styles.filters__tab,
              !activeTierFilter ? styles["filters__tab--active"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={!activeTierFilter ? "page" : undefined}
            onClick={(event) => handleFilterClick("ALL", event)}
          >
            <OrgIcon
              code="ALL"
              size={16}
              className={styles.filters__tab__icon}
            />
            {FILTER_LABEL.ALL}
            <span className={styles.filters__tab__count}>
              · <b>{characters.length}</b>
            </span>
          </Link>
          {VALID_TIERS.map((tier) => {
            const count = characters.filter((c) => tierOf(c) === tier).length;
            const active = activeTierFilter === tier;
            return (
              <Link
                key={tier}
                href={hrefForFilter(tier)}
                className={[
                  styles.filters__tab,
                  active ? styles["filters__tab--active"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={active ? "page" : undefined}
                onClick={(event) => handleFilterClick(tier, event)}
              >
                <OrgIcon
                  code={tier}
                  size={16}
                  className={styles.filters__tab__icon}
                />
                {FILTER_LABEL[tier]}
                <span className={styles.filters__tab__count}>
                  · <b>{count}</b>
                </span>
              </Link>
            );
          })}
        </nav>
        {isGMOrAbove ? (
          <Button
            as="a"
            href="/erp/characters/new"
            variant="primary"
            className={styles.filterRow__cta}
          >
            + 신규
          </Button>
        ) : null}
      </div>

      {displayedAgents.length === 0 ? (
        <div className={styles.empty}>등록된 캐릭터가 없습니다.</div>
      ) : (
        <div className={styles.grid}>
          {displayedAgents.map((c) => {
            const id = String(c._id);
            const departmentLabel = c.department
              ? getDepartmentLabel(c.department)
              : null;
            const subLine = [c.role, departmentLabel].filter(Boolean).join(" / ");
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
                      <div className={styles.card__code}>
                        {c.codename}
                        {c.ownerId === viewerUserId ? (
                          <span className={styles.card__mine}>MINE</span>
                        ) : null}
                      </div>
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
    const optimizedSrc = preferOptimizedPublicImagePath(src);
    return (
      <div className={styles.card__thumbWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={optimizedSrc}
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
