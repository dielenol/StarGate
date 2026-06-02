"use client";

import Link from "next/link";
import { useState } from "react";

import type { AgentLevel, Character, CharacterType } from "@/types/character";

import { getLevelDisplayRank, getLevelDisplayTotal } from "@/lib/personnel";
import { isInternalOrgCode } from "@/lib/org-structure";
import { preferOptimizedPublicImagePath } from "@/lib/asset-path";

import Pips from "@/components/ui/Pips/Pips";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./PersonnelCard.module.css";

type MatchState = "matched" | "dimmed" | "default";

const REDACT_NAME = "████████";
const CLASSIFIED_VALUE = "[CLASSIFIED]";

interface Props {
  character: Character;
  showIdentity: boolean;
  isLead?: boolean;
  isRedacted?: boolean;
  matchState?: MatchState;
  classifiedFieldsCount?: number;
  requiredLevelForHidden?: AgentLevel;
  showAgentLevel?: boolean;
}

export default function PersonnelCard({
  character,
  showIdentity,
  isLead = false,
  isRedacted = false,
  matchState = "default",
  classifiedFieldsCount = 0,
  requiredLevelForHidden,
  showAgentLevel = true,
}: Props) {
  const id = String(character._id);
  const level: AgentLevel = character.agentLevel ?? "J";
  const canShowAgentLevel =
    showAgentLevel &&
    (isInternalOrgCode(character.department) ||
      isInternalOrgCode(character.institutionCode) ||
      isInternalOrgCode(character.factionCode));
  const displayName =
    showIdentity && !isRedacted ? getDisplayName(character) : null;

  const avatarNode = renderAvatar(character, isRedacted);

  const cardClasses = [
    styles.card,
    isLead ? styles["card--lead"] : "",
    matchState === "matched" ? styles["card--matched"] : "",
    matchState === "dimmed" ? styles["card--dimmed"] : "",
    isRedacted ? styles["card--redacted"] : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link href={`/erp/personnel/${id}`} className={cardClasses}>
      {isLead ? (
        <span className={styles.commanderBadge} aria-label="COMMANDER">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            aria-hidden
          >
            {/* 5-point star — 지휘관 계급 표식. */}
            <path d="M12 2 L14.5 8.6 L21.5 9 L16 13.4 L18 20.5 L12 16.6 L6 20.5 L8 13.4 L2.5 9 L9.5 8.6 Z" />
          </svg>
          <span>COMMANDER</span>
        </span>
      ) : null}
      <div className={styles.head}>
        <div
          className={[
            styles.avatar,
            isRedacted ? styles["avatar--sealed"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {avatarNode}
        </div>
        <div className={styles.body}>
          <div className={styles.code}>{character.codename}</div>
          <div
            className={[styles.name, !displayName ? styles["name--redact"] : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {displayName ?? REDACT_NAME}
          </div>
          {character.role ? (
            <div className={styles.role}>{character.role}</div>
          ) : null}
        </div>
      </div>

      <div className={styles.meta}>
        {isRedacted ? (
          <>
            <Tag tone="danger">REDACTED</Tag>
            <span className={`${styles.clrPill} ${styles["clrPill--danger"]}`}>
              {canShowAgentLevel ? "권한등급 · V+" : "열람 제한"}
            </span>
          </>
        ) : (
          <>
            <Tag tone={character.type === "AGENT" ? "gold" : "default"}>
              {character.type}
            </Tag>
            {canShowAgentLevel ? (
              <span className={styles.clrPill} data-rank={level}>
                <span>권한등급 : {level}</span>
                <Pips
                  total={getLevelDisplayTotal(level)}
                  filled={getLevelDisplayRank(level)}
                />
              </span>
            ) : null}
          </>
        )}
      </div>

      {isRedacted ? (
        <div className={styles.foot}>
          <span>⚠ 전체 마스킹</span>
          <span>{canShowAgentLevel ? "V 등급 필요" : "상위 열람 권한 필요"}</span>
        </div>
      ) : classifiedFieldsCount > 0 && requiredLevelForHidden ? (
        <div className={styles.foot}>
          <span>⚠ 상위 기밀 {classifiedFieldsCount}건</span>
          <span>
            {canShowAgentLevel
              ? `${requiredLevelForHidden} 등급 필요`
              : "상위 열람 권한 필요"}
          </span>
        </div>
      ) : null}
    </Link>
  );
}

function getDisplayName(character: Character): string | null {
  const nickname = character.lore.nickname;
  if (isDisplayableName(nickname)) return nickname;

  const realName = character.lore.name;
  if (isDisplayableName(realName)) return realName;

  return null;
}

function isDisplayableName(value: string | undefined | null): value is string {
  return Boolean(value && value !== CLASSIFIED_VALUE);
}

function renderAvatar(character: Character, isRedacted: boolean) {
  if (isRedacted) return <span aria-hidden>☩</span>;

  /* 신원조회 인덱스 카드는 lore.mainImage(메인 일러스트) 우선. 누락 시 previewImage(pixel-profile) 폴백. */
  const src = character.lore.mainImage || character.previewImage;
  return <PersonnelAvatarImage src={src} type={character.type} />;
}

/** src 가 비어 있거나 로드 실패 시 type 별 텍스트 placeholder 로 fallback. */
function PersonnelAvatarImage({
  src,
  type,
}: {
  src: string | undefined | null;
  type: CharacterType;
}) {
  const [errored, setErrored] = useState(false);
  if (src && !errored) {
    const optimizedSrc = preferOptimizedPublicImagePath(src);
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        className={styles.avatar__img}
        src={optimizedSrc}
        alt=""
        onError={() => setErrored(true)}
      />
    );
  }
  if (type === "NPC") return <span aria-hidden>NPC</span>;
  return <span aria-hidden>IMG</span>;
}
