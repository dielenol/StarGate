"use client";

import Link from "next/link";

import type { Character, CharacterType } from "@/types/character";

import { useCharacters } from "@/hooks/queries/useCharactersQuery";

import { getDepartmentLabel } from "@/lib/org-structure";

import Bar from "@/components/ui/Bar/Bar";
import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import Seal from "@/components/ui/Seal/Seal";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

const VALID_TYPES: CharacterType[] = ["AGENT", "NPC"];

const TYPE_LABEL: Record<CharacterType, string> = {
  AGENT: "AGENT",
  NPC: "NPC",
};

const FILTER_LABEL: Record<"ALL" | CharacterType, string> = {
  ALL: "전체",
  AGENT: "AGENT",
  NPC: "NPC",
};

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
          {FILTER_LABEL.ALL} · {characters.length}
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
              {FILTER_LABEL[t]} · {count}
            </Link>
          );
        })}
      </nav>

      {characters.length === 0 ? (
        <Box>
          <div className={styles.empty}>등록된 캐릭터가 없습니다.</div>
        </Box>
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

            return (
              <Link key={id} href={`/erp/characters/${id}`} className={styles.cardLink}>
                <Box className={styles.card}>
                  <div className={styles.card__head}>
                    <Seal>{getInitial(c)}</Seal>
                    <div className={styles.card__headBody}>
                      <div className={styles.card__code}>{c.codename}</div>
                      <div className={styles.card__name}>
                        {c.sheet.name || c.codename}
                      </div>
                      {subLine ? (
                        <div className={styles.card__sub}>{subLine}</div>
                      ) : null}
                    </div>
                    <Tag tone={c.type === "AGENT" ? "gold" : "default"}>
                      {TYPE_LABEL[c.type]}
                    </Tag>
                  </div>

                  {isAgent(c) ? (
                    <div className={styles.card__stats}>
                      <div className={styles.card__stat}>
                        <span className={styles.card__statLabel}>HP</span>
                        <Bar value={c.sheet.hp} className={styles.card__statBar} />
                        <span className={styles.card__statValue}>
                          {c.sheet.hp}
                        </span>
                      </div>
                      <div className={styles.card__stat}>
                        <span className={styles.card__statLabel}>SAN</span>
                        <Bar
                          value={c.sheet.san}
                          tone={c.sheet.san < 30 ? "danger" : "info"}
                          className={styles.card__statBar}
                        />
                        <span
                          className={[
                            styles.card__statValue,
                            c.sheet.san < 30 ? styles["card__statValue--danger"] : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {c.sheet.san}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.card__footer}>
                      <Tag tone={c.isPublic ? "success" : "danger"}>
                        {c.isPublic ? "PUBLIC" : "PRIVATE"}
                      </Tag>
                    </div>
                  )}
                </Box>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
