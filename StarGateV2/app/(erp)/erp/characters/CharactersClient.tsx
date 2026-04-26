"use client";

import Link from "next/link";

import type { Character, CharacterType } from "@/types/character";

import { useCharacters } from "@/hooks/queries/useCharactersQuery";

import { getDepartmentLabel } from "@/lib/org-structure";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import styles from "./page.module.css";

const VALID_TYPES: CharacterType[] = ["AGENT", "NPC"];

const TYPE_LABEL: Record<CharacterType, string> = {
  AGENT: "AGENT",
  NPC: "NPC",
};

const FILTER_LABEL: Record<"ALL" | CharacterType, string> = {
  ALL: "ALL",
  AGENT: "AGENT",
  NPC: "NPC",
};

const HP_MAX = 100;
const SAN_MAX = 99;

function getInitial(c: Character): string {
  const source = c.sheet.name || c.codename;
  return source.charAt(0).toUpperCase() || "?";
}

function isAgent(c: Character): c is Character & { type: "AGENT" } {
  return c.type === "AGENT";
}

interface Props {
  initialCharacters: Character[];
  typeFilter: CharacterType | null;
  isGMOrAbove: boolean;
}

export default function CharactersClient({
  initialCharacters,
  typeFilter,
  isGMOrAbove,
}: Props) {
  const { data: characters = [] } = useCharacters(typeFilter, {
    initialData: initialCharacters,
  });

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "CHARACTERS" },
        ]}
        title="캐릭터"
        right={
          isGMOrAbove ? (
            <Button as="a" href="/erp/characters/new" variant="primary">
              + 신규
            </Button>
          ) : null
        }
      />

      <nav className={styles.filters} aria-label="캐릭터 타입 필터">
        <Link
          href="/erp/characters"
          className={[
            styles.filters__tab,
            !typeFilter ? styles["filters__tab--active"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-current={!typeFilter ? "page" : undefined}
        >
          {FILTER_LABEL.ALL}
          <span className={styles.filters__tab__count}>
            · <b>{characters.length}</b>
          </span>
        </Link>
        {VALID_TYPES.map((t) => {
          const count = characters.filter((c) => c.type === t).length;
          const active = typeFilter === t;
          return (
            <Link
              key={t}
              href={`/erp/characters?type=${t}`}
              className={[
                styles.filters__tab,
                active ? styles["filters__tab--active"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={active ? "page" : undefined}
            >
              {FILTER_LABEL[t]}
              <span className={styles.filters__tab__count}>
                · <b>{count}</b>
              </span>
            </Link>
          );
        })}
      </nav>

      {characters.length === 0 ? (
        <div className={styles.empty}>등록된 캐릭터가 없습니다.</div>
      ) : (
        <div className={styles.grid}>
          {characters.map((c) => {
            const id = String(c._id);
            const departmentLabel = c.department
              ? getDepartmentLabel(c.department)
              : null;
            const subLine = [c.role, departmentLabel]
              .filter(Boolean)
              .join(" · ");
            const displayName = c.sheet.name || c.codename;

            return (
              <Link
                key={id}
                href={`/erp/characters/${id}`}
                className={styles.cardLink}
              >
                <div className={styles.card}>
                  <div className={styles.card__head}>
                    {c.previewImage ? (
                      <div className={styles.card__thumbWrap}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.previewImage}
                          alt={`${displayName} 미리보기`}
                          className={styles.card__thumb}
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
                    ) : (
                      <div className={styles.card__seal} aria-hidden>
                        {getInitial(c)}
                        <span
                          className={`${styles.card__seal__tick} ${styles["card__seal__tick--tl"]}`}
                          aria-hidden
                        />
                      </div>
                    )}
                    <div className={styles.card__headBody}>
                      <div className={styles.card__code}>{c.codename}</div>
                      <div className={styles.card__name}>{displayName}</div>
                      {subLine ? (
                        <div className={styles.card__sub}>{subLine}</div>
                      ) : null}
                    </div>
                    <span
                      className={`${styles.tag} ${
                        c.type === "AGENT"
                          ? styles["tag--gold"]
                          : styles["tag--default"]
                      }`}
                    >
                      {TYPE_LABEL[c.type]}
                    </span>
                  </div>

                  {isAgent(c) ? (
                    <div className={styles.card__stats}>
                      <StatRow
                        label="HP"
                        value={c.sheet.hp}
                        max={HP_MAX}
                        tone="gold"
                      />
                      <StatRow
                        label="SAN"
                        value={c.sheet.san}
                        max={SAN_MAX}
                        tone={c.sheet.san < 30 ? "danger" : "info"}
                      />
                    </div>
                  ) : (
                    <div className={styles.card__footer}>
                      <span className={styles.card__footer__label}>
                        VISIBILITY
                      </span>
                      <span
                        className={`${styles.tag} ${
                          c.isPublic
                            ? styles["tag--success"]
                            : styles["tag--danger"]
                        }`}
                      >
                        {c.isPublic ? "PUBLIC" : "PRIVATE"}
                      </span>
                    </div>
                  )}
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
