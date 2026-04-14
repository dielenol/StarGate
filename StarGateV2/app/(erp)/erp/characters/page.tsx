import Link from "next/link";
import { redirect } from "next/navigation";

import type { Character, CharacterType } from "@/types/character";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  listCharacters,
  listCharactersByType,
} from "@/lib/db/characters";

import styles from "./page.module.css";

const VALID_TYPES: CharacterType[] = ["AGENT", "NPC"];

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function CharactersPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  const isGMOrAbove = hasRole(role, "GM");

  const params = await searchParams;
  const typeFilter =
    params.type && VALID_TYPES.includes(params.type as CharacterType)
      ? (params.type as CharacterType)
      : null;

  let characters: Character[] = [];

  try {
    characters = typeFilter
      ? await listCharactersByType(typeFilter)
      : await listCharacters();
  } catch {
    // DB 연결 실패 시 빈 배열 유지
  }

  return (
    <section className={styles.page}>
      <div className={styles.page__classification}>CLASSIFIED</div>

      <div className={styles.page__header}>
        <h1 className={styles.page__title}>캐릭터 관리</h1>
        {isGMOrAbove && (
          <Link href="/erp/characters/new" className={styles.page__addBtn}>
            + 캐릭터 추가
          </Link>
        )}
      </div>

      {/* Filter tabs */}
      <div className={styles.filters}>
        <Link
          href="/erp/characters"
          className={`${styles.filters__tab} ${!typeFilter ? styles["filters__tab--active"] : ""}`}
        >
          전체
        </Link>
        {VALID_TYPES.map((t) => (
          <Link
            key={t}
            href={`/erp/characters?type=${t}`}
            className={`${styles.filters__tab} ${typeFilter === t ? styles["filters__tab--active"] : ""}`}
          >
            {t}
          </Link>
        ))}
      </div>

      {/* Card grid */}
      {characters.length === 0 ? (
        <p className={styles.empty}>등록된 캐릭터가 없습니다.</p>
      ) : (
        <div className={styles.grid}>
          {characters.map((c) => (
            <Link
              key={String(c._id)}
              href={`/erp/characters/${String(c._id)}`}
              className={styles.card}
            >
              {c.previewImage ? (
                <img
                  src={c.previewImage}
                  alt={c.codename}
                  className={styles.card__image}
                />
              ) : (
                <div className={styles.card__imagePlaceholder}>?</div>
              )}
              <div className={styles.card__info}>
                <div className={styles.card__codename}>{c.codename}</div>
                <div className={styles.card__role}>{c.role}</div>
                <div className={styles.card__meta}>
                  <span
                    className={`${styles.badge} ${c.type === "AGENT" ? styles["badge--agent"] : styles["badge--npc"]}`}
                  >
                    {c.type}
                  </span>
                  <span
                    className={`${styles.badge} ${c.isPublic ? styles["badge--public"] : styles["badge--private"]}`}
                  >
                    {c.isPublic ? "PUBLIC" : "PRIVATE"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
