"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import type { AgentLevel, Character, CharacterType } from "@/types/character";
import { AGENT_LEVEL_LABELS } from "@/types/character";

import { useCharacters } from "@/hooks/queries/useCharactersQuery";

import { canViewField } from "@/lib/personnel";
import {
  getDepartmentLabel,
  getGroupLabel,
  getTopLevelGroup,
} from "@/lib/org-structure";

import Box from "@/components/ui/Box/Box";
import Input from "@/components/ui/Input/Input";
import PageHead from "@/components/ui/PageHead/PageHead";
import Seal from "@/components/ui/Seal/Seal";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

type FilterKey = "ALL" | CharacterType;

const FILTER_ORDER: FilterKey[] = ["ALL", "AGENT", "NPC"];

const FILTER_LABEL: Record<FilterKey, string> = {
  ALL: "전체",
  AGENT: "AGENT",
  NPC: "NPC",
};

const LEVEL_TAG_TONE: Record<AgentLevel, "gold" | "info" | "success" | "default" | "danger"> = {
  V: "gold",
  A: "gold",
  M: "info",
  H: "info",
  G: "success",
  J: "default",
  U: "danger",
};

function getInitial(c: Character): string {
  const source = c.sheet.name && c.sheet.name !== "[CLASSIFIED]" ? c.sheet.name : c.codename;
  return source.charAt(0).toUpperCase() || "?";
}

interface Props {
  initialCharacters: Character[];
  clearance: AgentLevel;
}

export default function PersonnelClient({
  initialCharacters,
  clearance,
}: Props) {
  const { data: characters = [] } = useCharacters(null, {
    initialData: initialCharacters,
  });

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const showIdentity = canViewField(clearance, "identity");

  const counts = useMemo(() => {
    const counts: Record<FilterKey, number> = { ALL: 0, AGENT: 0, NPC: 0 };
    for (const c of characters) {
      counts.ALL += 1;
      counts[c.type] = (counts[c.type] ?? 0) + 1;
    }
    return counts;
  }, [characters]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return characters.filter((c) => {
      if (filter !== "ALL" && c.type !== filter) return false;
      if (!normalized) return true;
      const hay = [
        c.codename,
        c.role,
        showIdentity ? c.sheet.name : "",
        c.department ? getDepartmentLabel(c.department) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(normalized);
    });
  }, [characters, filter, query, showIdentity]);

  return (
    <>
      <PageHead
        breadcrumb="ERP / IDENTITY SEARCH"
        title="신원 조회"
        right={
          <Tag tone="gold">
            YOUR CLEARANCE · {clearance} · {AGENT_LEVEL_LABELS[clearance]}
          </Tag>
        }
      />

      <Box className={styles.searchBox}>
        <div className={styles.searchRow}>
          <Input
            type="search"
            placeholder="코드네임 · 이름 · 부서 · 역할"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.searchInput}
            aria-label="신원 검색"
          />
        </div>
        <div className={styles.filters} role="group" aria-label="타입 필터">
          {FILTER_ORDER.map((key) => {
            const active = filter === key;
            const count = counts[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                className={[
                  styles.filters__tab,
                  active ? styles["filters__tab--active"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setFilter(key)}
                aria-pressed={active}
              >
                {FILTER_LABEL[key]} · {count}
              </button>
            );
          })}
        </div>
        <div className={styles.searchHint}>
          마스킹 규칙: GUEST · JUNIOR 등급은 실명/식별번호가 [CLASSIFIED] 처리됩니다.
        </div>
      </Box>

      {filtered.length === 0 ? (
        <Box>
          <div className={styles.empty}>
            {characters.length === 0
              ? "등록된 인원이 없습니다."
              : "검색 결과가 없습니다."}
          </div>
        </Box>
      ) : (
        <div className={styles.grid}>
          {filtered.map((c) => (
            <PersonnelCard
              key={String(c._id)}
              character={c}
              showIdentity={showIdentity}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PersonnelCard({
  character,
  showIdentity,
}: {
  character: Character;
  showIdentity: boolean;
}) {
  const level: AgentLevel = character.agentLevel ?? "J";
  const id = String(character._id);
  const departmentLabel = character.department
    ? getDepartmentLabel(character.department)
    : null;
  const groupCode = getTopLevelGroup(character.department ?? undefined);
  const groupLabel = groupCode === "UNASSIGNED" ? null : getGroupLabel(groupCode);

  const subLine = [character.role, departmentLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/erp/personnel/${id}`} className={styles.cardLink}>
      <Box className={styles.card}>
        <div className={styles.card__head}>
          <Seal>{getInitial(character)}</Seal>
          <div className={styles.card__headBody}>
            <div className={styles.card__code}>{character.codename}</div>
            <div className={styles.card__name}>
              {showIdentity ? (
                character.sheet.name || character.codename
              ) : (
                <span className={styles.redacted}>████████</span>
              )}
            </div>
            {subLine ? (
              <div className={styles.card__sub}>{subLine}</div>
            ) : null}
          </div>
        </div>

        <div className={styles.card__footer}>
          <Tag tone={LEVEL_TAG_TONE[level]}>
            CLR · {level}
          </Tag>
          <Tag tone={character.type === "AGENT" ? "gold" : "default"}>
            {character.type}
          </Tag>
          {groupLabel ? (
            <span className={styles.card__group}>{groupLabel}</span>
          ) : null}
        </div>
      </Box>
    </Link>
  );
}
