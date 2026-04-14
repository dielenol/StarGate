import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import type { AgentCharacter, NpcCharacter } from "@/types/character";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";

import CharacterDetailClient from "./CharacterDetailClient";

import styles from "./page.module.css";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CharacterDetailPage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  if (!isValidObjectId(id)) notFound();
  const character = await findCharacterById(id);

  if (!character) {
    notFound();
  }

  const { role } = session.user;
  const isGMOrAbove = hasRole(role, "GM");
  const isAdmin = hasRole(role, "ADMIN");

  // MongoDB ObjectId -> string 직렬화
  const serialized = JSON.parse(JSON.stringify(character)) as typeof character;

  return (
    <section className={styles.page}>
      <Link href="/erp/characters" className={styles.page__back}>
        &larr; 캐릭터 목록
      </Link>

      <div className={styles.page__header}>
        <div className={styles.page__titleGroup}>
          <h1 className={styles.page__title}>{character.codename}</h1>
          <span
            className={`${styles.badge} ${character.type === "AGENT" ? styles["badge--agent"] : styles["badge--npc"]}`}
          >
            {character.type}
          </span>
          <span
            className={`${styles.badge} ${character.isPublic ? styles["badge--public"] : styles["badge--private"]}`}
          >
            {character.isPublic ? "PUBLIC" : "PRIVATE"}
          </span>
        </div>
      </div>

      {/* Quote */}
      {character.sheet.quote && (
        <div className={styles.quote}>&ldquo;{character.sheet.quote}&rdquo;</div>
      )}

      {/* Profile */}
      <div className={styles.profile}>
        {character.sheet.mainImage ? (
          <img
            src={character.sheet.mainImage}
            alt={character.codename}
            className={styles.profile__image}
          />
        ) : (
          <div className={styles.profile__imagePlaceholder}>?</div>
        )}
        <div className={styles.profile__fields}>
          <div className={styles.field}>
            <span className={styles.field__label}>CODENAME</span>
            <span className={styles.field__value}>{character.codename}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>NAME</span>
            <span className={styles.field__value}>{character.sheet.name}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>ROLE</span>
            <span className={styles.field__value}>{character.role}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>GENDER</span>
            <span className={styles.field__value}>{character.sheet.gender}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>AGE</span>
            <span className={styles.field__value}>{character.sheet.age}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>HEIGHT</span>
            <span className={styles.field__value}>{character.sheet.height}</span>
          </div>
          {character.ownerId && (
            <div className={styles.field}>
              <span className={styles.field__label}>OWNER</span>
              <span className={styles.field__value}>{character.ownerId}</span>
            </div>
          )}
        </div>
      </div>

      {/* Appearance / Personality / Background */}
      <div className={styles.section}>
        <div className={styles.section__header}>CHARACTER PROFILE</div>
        <div className={styles.section__card}>
          <div className={styles.field}>
            <span className={styles.field__label}>외모</span>
            <span className={styles.field__value}>
              {character.sheet.appearance || "—"}
            </span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>성격</span>
            <span className={styles.field__value}>
              {character.sheet.personality || "—"}
            </span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>배경</span>
            <span className={styles.field__value}>
              {character.sheet.background || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Agent-specific sections */}
      {character.type === "AGENT" && (
        <AgentSections character={character} />
      )}

      {/* NPC-specific sections */}
      {character.type === "NPC" && (
        <NpcSections character={character} />
      )}

      {/* Client component for edit/delete actions */}
      <CharacterDetailClient
        character={serialized}
        canEdit={isGMOrAbove}
        canDelete={isAdmin}
      />
    </section>
  );
}

function AgentSections({ character }: { character: AgentCharacter }) {
  const { sheet } = character;

  return (
    <>
      {/* Combat stats */}
      <div className={styles.section}>
        <div className={styles.section__header}>COMBAT STATS</div>
        <div className={styles.statGrid}>
          <div className={styles.stat}>
            <div className={styles.stat__value}>{sheet.hp}</div>
            <div className={styles.stat__label}>HP</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.stat__value}>{sheet.san}</div>
            <div className={styles.stat__label}>SAN</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.stat__value}>{sheet.def}</div>
            <div className={styles.stat__label}>DEF</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.stat__value}>{sheet.atk}</div>
            <div className={styles.stat__label}>ATK</div>
          </div>
        </div>
      </div>

      {/* Agent details */}
      <div className={styles.section}>
        <div className={styles.section__header}>AGENT DETAILS</div>
        <div className={styles.section__card}>
          <div className={styles.field}>
            <span className={styles.field__label}>CLASS</span>
            <span className={styles.field__value}>{sheet.className || "—"}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>WEIGHT</span>
            <span className={styles.field__value}>{sheet.weight || "—"}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>ABILITY TYPE</span>
            <span className={styles.field__value}>{sheet.abilityType || "—"}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>CREDIT</span>
            <span className={styles.field__value}>{sheet.credit ?? "—"}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>WEAPON</span>
            <span className={styles.field__value}>{sheet.weaponTraining || "—"}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.field__label}>SKILL</span>
            <span className={styles.field__value}>{sheet.skillTraining || "—"}</span>
          </div>
        </div>
      </div>

      {/* Equipment */}
      <div className={styles.section}>
        <div className={styles.section__header}>EQUIPMENT</div>
        {sheet.equipment.length === 0 ? (
          <p style={{ color: "#5a6a6e", fontSize: 14 }}>장비 없음</p>
        ) : (
          <div className={styles.itemList}>
            {sheet.equipment.map((eq, i) => (
              <div key={i} className={styles.item}>
                <div className={styles.item__name}>{eq.name}</div>
                <div className={styles.item__detail}>
                  {eq.damage && <>DMG: {eq.damage} &middot; </>}
                  Price: {eq.price}
                  {eq.description && <> &mdash; {eq.description}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Abilities */}
      <div className={styles.section}>
        <div className={styles.section__header}>ABILITIES</div>
        {sheet.abilities.length === 0 ? (
          <p style={{ color: "#5a6a6e", fontSize: 14 }}>어빌리티 없음</p>
        ) : (
          <div className={styles.itemList}>
            {sheet.abilities.map((ab, i) => (
              <div key={i} className={styles.item}>
                <div className={styles.item__name}>
                  [{ab.code}] {ab.name}
                </div>
                <div className={styles.item__detail}>
                  {ab.description}
                  {ab.effect && (
                    <>
                      <br />
                      Effect: {ab.effect}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function NpcSections({ character }: { character: NpcCharacter }) {
  const { sheet } = character;

  return (
    <div className={styles.section}>
      <div className={styles.section__header}>NPC DETAILS</div>
      <div className={styles.section__card}>
        <div className={styles.field}>
          <span className={styles.field__label}>NAME (EN)</span>
          <span className={styles.field__value}>{sheet.nameEn || "—"}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.field__label}>ROLE DETAIL</span>
          <span className={styles.field__value}>{sheet.roleDetail || "—"}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.field__label}>NOTES</span>
          <span className={styles.field__value}>{sheet.notes || "—"}</span>
        </div>
      </div>
    </div>
  );
}
