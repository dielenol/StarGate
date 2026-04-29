import Link from "next/link";

import type { AgentLevel, Character } from "@/types/character";

import { getLevelDisplayRank } from "@/lib/personnel";

import Pips from "@/components/ui/Pips/Pips";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./PersonnelCard.module.css";

type MatchState = "matched" | "dimmed" | "default";

const REDACT_NAME = "████████";

interface Props {
  character: Character;
  showIdentity: boolean;
  isLead?: boolean;
  isRedacted?: boolean;
  matchState?: MatchState;
  classifiedFieldsCount?: number;
  requiredLevelForHidden?: AgentLevel;
}

export default function PersonnelCard({
  character,
  showIdentity,
  isLead = false,
  isRedacted = false,
  matchState = "default",
  classifiedFieldsCount = 0,
  requiredLevelForHidden,
}: Props) {
  const id = String(character._id);
  const level: AgentLevel = character.agentLevel ?? "J";
  const displayName =
    showIdentity && !isRedacted && character.lore.name
      ? character.lore.name
      : null;

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
              권한등급 · V+
            </span>
          </>
        ) : (
          <>
            <Tag tone={character.type === "AGENT" ? "gold" : "default"}>
              {character.type}
            </Tag>
            <span className={styles.clrPill} data-rank={level}>
              <span>권한등급 : {level}</span>
              <Pips total={7} filled={getLevelDisplayRank(level)} />
            </span>
          </>
        )}
      </div>

      {isRedacted ? (
        <div className={styles.foot}>
          <span>⚠ 전체 마스킹</span>
          <span>V 등급 필요</span>
        </div>
      ) : classifiedFieldsCount > 0 && requiredLevelForHidden ? (
        <div className={styles.foot}>
          <span>⚠ 상위 기밀 {classifiedFieldsCount}건</span>
          <span>{requiredLevelForHidden} 등급 필요</span>
        </div>
      ) : null}
    </Link>
  );
}

function renderAvatar(character: Character, isRedacted: boolean) {
  if (isRedacted) return <span aria-hidden>☩</span>;

  /* 신원조회 인덱스 카드는 lore.mainImage(메인 일러스트) 우선. 누락 시 previewImage(pixel-profile) 폴백. */
  const src = character.lore.mainImage || character.previewImage;
  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img className={styles.avatar__img} src={src} alt="" />
    );
  }

  if (character.type === "NPC") return <span aria-hidden>NPC</span>;
  return <span aria-hidden>IMG</span>;
}
