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
}

function getInitial(source: string): string {
  return source.charAt(0).toUpperCase() || "?";
}

/**
 * 캐릭터 상세 상단 와이드 히어로 (16:9).
 *
 * 이미지 fallback chain:
 *  1. posterImage 가 있으면 와이드 포스터로 사용 (LCP 후보)
 *  2. mainImage 가 있으면 같은 슬롯에 풀블리드 (세로 초상화 → cover)
 *  3. 둘 다 없으면 Seal 이니셜 + 캐릭터명 placeholder
 *
 * 디자인은 Claude Design 후속 — 본 컴포넌트는 구조 슬롯만 명확히 정의.
 */
export default function PosterHero({
  posterImage,
  mainImage,
  codename,
  name,
  type,
  role,
  agentLevel,
}: Props) {
  const heroSrc = posterImage || mainImage || null;
  const isPortraitFallback = !posterImage && Boolean(mainImage);
  const displayName = name || codename;

  return (
    <section className={styles.hero} aria-label="캐릭터 히어로">
      <div className={styles.hero__slot}>
        {heroSrc ? (
          <Image
            src={heroSrc}
            alt={`${displayName} ${posterImage ? "포스터" : "메인 이미지"}`}
            fill
            sizes="(max-width: 900px) 100vw, 60vw"
            className={[
              styles.hero__slotImage,
              isPortraitFallback ? styles["hero__slotImage--portrait"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
            priority
          />
        ) : (
          <div className={styles.hero__slotEmpty} aria-hidden>
            <Seal size="lg">{getInitial(displayName)}</Seal>
            <div className={styles.hero__slotEmptyName}>{displayName}</div>
          </div>
        )}
      </div>

      <div className={styles.hero__meta}>
        <div className={styles.hero__codename}>{codename}</div>
        <h2 className={styles.hero__name}>{displayName}</h2>
        {role ? <div className={styles.hero__role}>{role}</div> : null}
        <div className={styles.hero__tags}>
          <Tag tone={type === "AGENT" ? "gold" : "default"}>{type}</Tag>
          {agentLevel ? (
            <Tag tone="default">CLR {agentLevel}</Tag>
          ) : null}
        </div>
      </div>
    </section>
  );
}
