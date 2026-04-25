"use client";

import Image from "next/image";
import Link from "next/link";

import type { Character } from "@/types/character";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import Seal from "@/components/ui/Seal/Seal";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

/** 프로필 카드 그리드용 캐릭터 요약. server page에서 ObjectId를 string으로 직렬화하여 전달. */
export interface ProfileCharacter {
  _id: string;
  codename: string;
  type: Character["type"];
  role: string;
  agentLevel?: Character["agentLevel"];
  /** shared-db 계약: required string (빈 문자열 가능, undefined 불가) */
  previewImage: string;
  sheet: {
    name: string;
    posterImage?: string;
    mainImage: string;
  };
}

interface Props {
  characters: ProfileCharacter[];
  userDisplayName: string;
}

function getInitial(c: ProfileCharacter): string {
  const source = c.sheet.name || c.codename || "?";
  return source.charAt(0).toUpperCase();
}

export default function ProfileClient({ characters, userDisplayName }: Props) {
  // 대표 캐릭터: 현재는 목록 첫 번째 (추후 user.primaryCharacterId 도입 시 우선 사용)
  const primary = characters[0] ?? null;
  const posterSrc = primary?.sheet.posterImage || primary?.sheet.mainImage || null;
  const others = primary
    ? characters.filter((c) => c._id !== primary._id)
    : characters;

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "PROFILE" },
        ]}
        title="내 프로필"
      />

      <div className={styles.layout}>
        {/* ── 히어로: 대표 캐릭터 포스터 ── */}
        <Box className={styles.hero}>
          {primary ? (
            <>
              <div className={styles.hero__poster}>
                {posterSrc ? (
                  <Image
                    src={posterSrc}
                    alt={`${primary.sheet.name || primary.codename} 포스터`}
                    fill
                    sizes="(max-width: 720px) 100vw, 320px"
                    className={styles.hero__posterImage}
                    priority
                  />
                ) : (
                  <div className={styles.hero__posterFallback} aria-hidden>
                    <Seal size="lg">{getInitial(primary)}</Seal>
                  </div>
                )}
                <div className={styles.hero__posterStamp}>
                  <b>DOSSIER</b> 대표 캐릭터
                </div>
              </div>
              <div className={styles.hero__meta}>
                <div className={styles.hero__codename}>{primary.codename}</div>
                <h2 className={styles.hero__name}>
                  {primary.sheet.name || primary.codename}
                </h2>
                <div className={styles.hero__sub}>{userDisplayName}</div>
                <div className={styles.hero__tags}>
                  <Tag tone="gold">{primary.type}</Tag>
                  {primary.agentLevel ? (
                    <Tag tone="default">CLR {primary.agentLevel}</Tag>
                  ) : null}
                </div>
                <Button
                  as="a"
                  href={`/erp/characters/${primary._id}`}
                  variant="primary"
                  className={styles.hero__cta}
                >
                  캐릭터 상세 보기 →
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.hero__empty}>
              <div className={styles.hero__emptyMark} aria-hidden>
                N/A
              </div>
              <div className={styles.hero__emptyBody}>
                <div className={styles.hero__emptyEyebrow}>
                  STATUS · NO ASSIGNMENT
                </div>
                <div className={styles.hero__emptyTitle}>
                  등록된 캐릭터가 없습니다
                </div>
                <div className={styles.hero__emptySub}>
                  캐릭터 페이지에서 신규 캐릭터를 등록하거나, 기존 캐릭터에
                  소유자를 등록할 수 있습니다.
                </div>
                <div className={styles.hero__emptyActions}>
                  <Button as="a" href="/erp/characters" variant="primary">
                    캐릭터 페이지로 이동 →
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Box>

        {/* ── 내 캐릭터 카드 그리드 (대표 캐릭터 제외) ── */}
        {others.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles.section__title}>
              {primary ? "다른 캐릭터" : "MY CHARACTERS"}
            </h3>
            <div className={styles.grid}>
              {others.map((c) => {
                const thumb = c.previewImage || c.sheet.mainImage || null;
                return (
                  <Link
                    key={c._id}
                    href={`/erp/characters/${c._id}`}
                    className={styles.cardLink}
                  >
                    <Box className={styles.card}>
                      <div className={styles.card__thumb}>
                        {thumb ? (
                          <Image
                            src={thumb}
                            alt={`${c.sheet.name || c.codename} 미리보기`}
                            fill
                            sizes="(max-width: 600px) 50vw, 200px"
                            className={styles.card__thumbImage}
                          />
                        ) : (
                          <Seal>{getInitial(c)}</Seal>
                        )}
                      </div>
                      <div className={styles.card__body}>
                        <div className={styles.card__codename}>{c.codename}</div>
                        <div className={styles.card__name}>
                          {c.sheet.name || c.codename}
                        </div>
                        {c.role.trim().length > 0 ? (
                          <div className={styles.card__role}>{c.role}</div>
                        ) : null}
                      </div>
                    </Box>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ── shortcut ── */}
        <section className={styles.section}>
          <h3 className={styles.section__title}>SHORTCUTS</h3>
          <div className={styles.shortcuts}>
            <Button as="a" href="/erp/characters">
              캐릭터 →
            </Button>
            <Button as="a" href="/erp/inventory">
              인벤토리 →
            </Button>
            <Button as="a" href="/erp/credits">
              크레딧 →
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
