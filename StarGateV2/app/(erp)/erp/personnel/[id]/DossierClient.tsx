"use client";

import Link from "next/link";

import type { Character, AgentLevel } from "@/types/character";
import { AGENT_LEVEL_LABELS, DEPARTMENTS } from "@/types/character";

import { canViewField, type FieldGroup } from "@/lib/personnel";

import { IconArrowLeft } from "@/components/icons";

import styles from "./page.module.css";

/* ── 헬퍼 컴포넌트 ── */

function ClassifiedField({
  value,
  fieldGroup,
  clearance,
  requiredLabel,
}: {
  value: string | number | undefined;
  fieldGroup: FieldGroup;
  clearance: AgentLevel;
  requiredLabel: string;
}) {
  if (!canViewField(clearance, fieldGroup)) {
    return (
      <span className={styles.dossier__classified}>
        [CLASSIFIED — {requiredLabel}등급 필요]
      </span>
    );
  }
  return <span>{value ?? "—"}</span>;
}

function RedactedBlock({
  content,
  fieldGroup,
  clearance,
  requiredLabel,
}: {
  content: string | undefined;
  fieldGroup: FieldGroup;
  clearance: AgentLevel;
  requiredLabel: string;
}) {
  if (!canViewField(clearance, fieldGroup)) {
    return (
      <div className={styles.dossier__redacted}>████████████████████</div>
    );
  }
  return <p className={styles.dossier__text}>{content ?? "—"}</p>;
}

/* ── 유틸 ── */

function getDepartmentLabel(code: string): string {
  const dept = DEPARTMENTS.find((d) => d.code === code);
  return dept?.label ?? "미배정";
}

function formatDate(value: string | Date | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/* ── Props ── */

interface Props {
  character: Character;
  clearance: AgentLevel;
}

/* ── 메인 컴포넌트 ── */

export default function DossierClient({ character, clearance }: Props) {
  const level = character.agentLevel ?? "J";
  const department = character.department ?? "UNASSIGNED";
  const levelLabel = AGENT_LEVEL_LABELS[level];
  const isAgent = character.type === "AGENT";

  return (
    <div className={styles.dossier}>
      {/* 뒤로가기 */}
      <Link href="/erp/personnel" className={styles.dossier__back}>
        <IconArrowLeft aria-hidden />
        인원 목록
      </Link>

      {/* Classification banner */}
      <div className={styles.dossier__classification}>
        PERSONNEL DOSSIER — CLASSIFIED
      </div>

      {/* 헤더 */}
      <div className={styles.dossier__header}>
        <h1 className={styles.dossier__codename}>{character.codename}</h1>
        <div className={styles.dossier__meta}>
          <span className={styles.dossier__levelBadge}>
            [{level}] {getDepartmentLabel(department)} {isAgent ? "요원" : "NPC"}
          </span>
          <span className={styles.dossier__department}>
            {getDepartmentLabel(department)}
          </span>
        </div>
      </div>

      {/* BASIC IDENTITY — 최소 G등급 */}
      <section className={styles.dossier__section}>
        <h2 className={styles.dossier__sectionHeader}>BASIC IDENTITY</h2>
        <div className={styles.dossier__card}>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>실명</span>
            <span className={styles.dossier__value}>
              <ClassifiedField
                value={character.sheet.name}
                fieldGroup="identity"
                clearance={clearance}
                requiredLabel="G"
              />
            </span>
          </div>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>성별</span>
            <span className={styles.dossier__value}>
              <ClassifiedField
                value={character.sheet.gender}
                fieldGroup="identity"
                clearance={clearance}
                requiredLabel="G"
              />
            </span>
          </div>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>나이</span>
            <span className={styles.dossier__value}>
              <ClassifiedField
                value={character.sheet.age}
                fieldGroup="identity"
                clearance={clearance}
                requiredLabel="G"
              />
            </span>
          </div>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>신장</span>
            <span className={styles.dossier__value}>
              <ClassifiedField
                value={character.sheet.height}
                fieldGroup="identity"
                clearance={clearance}
                requiredLabel="G"
              />
            </span>
          </div>
        </div>
      </section>

      {/* CHARACTER PROFILE — 최소 H등급 */}
      <section className={styles.dossier__section}>
        <h2 className={styles.dossier__sectionHeader}>CHARACTER PROFILE</h2>
        <div className={styles.dossier__card}>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>외형</span>
            <span className={styles.dossier__value}>
              <RedactedBlock
                content={character.sheet.appearance}
                fieldGroup="profile"
                clearance={clearance}
                requiredLabel="H"
              />
            </span>
          </div>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>성격</span>
            <span className={styles.dossier__value}>
              <RedactedBlock
                content={character.sheet.personality}
                fieldGroup="profile"
                clearance={clearance}
                requiredLabel="H"
              />
            </span>
          </div>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>배경</span>
            <span className={styles.dossier__value}>
              <RedactedBlock
                content={character.sheet.background}
                fieldGroup="profile"
                clearance={clearance}
                requiredLabel="H"
              />
            </span>
          </div>
        </div>
      </section>

      {/* COMBAT STATS — Agent 전용, 최소 H등급 */}
      {isAgent && (
        <section className={styles.dossier__section}>
          <h2 className={styles.dossier__sectionHeader}>COMBAT STATS</h2>
          <div className={styles.dossier__statsGrid}>
            <div className={styles.dossier__statCard}>
              <div className={styles.dossier__statValue}>
                <ClassifiedField
                  value={character.sheet.hp}
                  fieldGroup="combatStats"
                  clearance={clearance}
                  requiredLabel="H"
                />
              </div>
              <div className={styles.dossier__statLabel}>HP</div>
            </div>
            <div className={styles.dossier__statCard}>
              <div className={styles.dossier__statValue}>
                <ClassifiedField
                  value={character.sheet.san}
                  fieldGroup="combatStats"
                  clearance={clearance}
                  requiredLabel="H"
                />
              </div>
              <div className={styles.dossier__statLabel}>SAN</div>
            </div>
            <div className={styles.dossier__statCard}>
              <div className={styles.dossier__statValue}>
                <ClassifiedField
                  value={character.sheet.def}
                  fieldGroup="combatStats"
                  clearance={clearance}
                  requiredLabel="H"
                />
              </div>
              <div className={styles.dossier__statLabel}>DEF</div>
            </div>
            <div className={styles.dossier__statCard}>
              <div className={styles.dossier__statValue}>
                <ClassifiedField
                  value={character.sheet.atk}
                  fieldGroup="combatStats"
                  clearance={clearance}
                  requiredLabel="H"
                />
              </div>
              <div className={styles.dossier__statLabel}>ATK</div>
            </div>
          </div>
        </section>
      )}

      {/* AGENT DETAILS — Agent 전용, 최소 M등급 */}
      {isAgent && (
        <section className={styles.dossier__section}>
          <h2 className={styles.dossier__sectionHeader}>AGENT DETAILS</h2>
          <div className={styles.dossier__card}>
            <div className={styles.dossier__row}>
              <span className={styles.dossier__label}>클래스</span>
              <span className={styles.dossier__value}>
                <ClassifiedField
                  value={character.sheet.className}
                  fieldGroup="abilities"
                  clearance={clearance}
                  requiredLabel="M"
                />
              </span>
            </div>
            <div className={styles.dossier__row}>
              <span className={styles.dossier__label}>체급</span>
              <span className={styles.dossier__value}>
                <ClassifiedField
                  value={character.sheet.weight}
                  fieldGroup="abilities"
                  clearance={clearance}
                  requiredLabel="M"
                />
              </span>
            </div>
            <div className={styles.dossier__row}>
              <span className={styles.dossier__label}>능력 유형</span>
              <span className={styles.dossier__value}>
                <ClassifiedField
                  value={character.sheet.abilityType}
                  fieldGroup="abilities"
                  clearance={clearance}
                  requiredLabel="M"
                />
              </span>
            </div>
            <div className={styles.dossier__row}>
              <span className={styles.dossier__label}>크레딧</span>
              <span className={styles.dossier__value}>
                <ClassifiedField
                  value={character.sheet.credit}
                  fieldGroup="abilities"
                  clearance={clearance}
                  requiredLabel="M"
                />
              </span>
            </div>
            <div className={styles.dossier__row}>
              <span className={styles.dossier__label}>무기 훈련</span>
              <span className={styles.dossier__value}>
                <ClassifiedField
                  value={character.sheet.weaponTraining}
                  fieldGroup="abilities"
                  clearance={clearance}
                  requiredLabel="M"
                />
              </span>
            </div>
            <div className={styles.dossier__row}>
              <span className={styles.dossier__label}>스킬 훈련</span>
              <span className={styles.dossier__value}>
                <ClassifiedField
                  value={character.sheet.skillTraining}
                  fieldGroup="abilities"
                  clearance={clearance}
                  requiredLabel="M"
                />
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ABILITIES — Agent 전용, 최소 M등급 */}
      {isAgent && (
        <section className={styles.dossier__section}>
          <h2 className={styles.dossier__sectionHeader}>ABILITIES</h2>
          {canViewField(clearance, "abilities") ? (
            <div className={styles.dossier__itemList}>
              {character.sheet.abilities.length > 0 ? (
                character.sheet.abilities.map((ability) => (
                  <div key={ability.code} className={styles.dossier__item}>
                    <div className={styles.dossier__itemName}>
                      <span className={styles.dossier__itemCode}>
                        {ability.code}
                      </span>
                      {ability.name}
                    </div>
                    <div className={styles.dossier__itemDetail}>
                      {ability.description}
                    </div>
                    {ability.effect && (
                      <div className={styles.dossier__itemDetail}>
                        효과: {ability.effect}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className={styles.dossier__text}>등록된 능력 없음</p>
              )}
            </div>
          ) : (
            <div className={styles.dossier__card}>
              <span className={styles.dossier__classified}>
                [CLASSIFIED — M등급 필요]
              </span>
            </div>
          )}
        </section>
      )}

      {/* EQUIPMENT — Agent 전용, 최소 M등급 */}
      {isAgent && (
        <section className={styles.dossier__section}>
          <h2 className={styles.dossier__sectionHeader}>EQUIPMENT</h2>
          {canViewField(clearance, "abilities") ? (
            <div className={styles.dossier__itemList}>
              {character.sheet.equipment.length > 0 ? (
                character.sheet.equipment.map((equip, idx) => (
                  <div key={idx} className={styles.dossier__item}>
                    <div className={styles.dossier__itemName}>{equip.name}</div>
                    <div className={styles.dossier__itemDetail}>
                      {equip.description}
                    </div>
                    {equip.damage && (
                      <div className={styles.dossier__itemDetail}>
                        피해: {equip.damage}
                      </div>
                    )}
                    {equip.price !== undefined && equip.price !== "" && (
                      <div className={styles.dossier__itemDetail}>
                        가격: {equip.price}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className={styles.dossier__text}>등록된 장비 없음</p>
              )}
            </div>
          ) : (
            <div className={styles.dossier__card}>
              <span className={styles.dossier__classified}>
                [CLASSIFIED — M등급 필요]
              </span>
            </div>
          )}
        </section>
      )}

      {/* NPC DETAILS — NPC 전용, fieldGroup: profile */}
      {!isAgent && (
        <section className={styles.dossier__section}>
          <h2 className={styles.dossier__sectionHeader}>NPC DETAILS</h2>
          <div className={styles.dossier__card}>
            <div className={styles.dossier__row}>
              <span className={styles.dossier__label}>영문명</span>
              <span className={styles.dossier__value}>
                <ClassifiedField
                  value={character.sheet.nameEn}
                  fieldGroup="profile"
                  clearance={clearance}
                  requiredLabel="H"
                />
              </span>
            </div>
            <div className={styles.dossier__row}>
              <span className={styles.dossier__label}>역할 상세</span>
              <span className={styles.dossier__value}>
                <RedactedBlock
                  content={character.sheet.roleDetail}
                  fieldGroup="profile"
                  clearance={clearance}
                  requiredLabel="H"
                />
              </span>
            </div>
            <div className={styles.dossier__row}>
              <span className={styles.dossier__label}>비고</span>
              <span className={styles.dossier__value}>
                <RedactedBlock
                  content={character.sheet.notes}
                  fieldGroup="profile"
                  clearance={clearance}
                  requiredLabel="H"
                />
              </span>
            </div>
          </div>
        </section>
      )}

      {/* META — 최소 V등급 */}
      <section className={styles.dossier__section}>
        <h2 className={styles.dossier__sectionHeader}>META</h2>
        <div className={styles.dossier__card}>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>소유자 ID</span>
            <span className={styles.dossier__value}>
              <ClassifiedField
                value={character.ownerId ?? undefined}
                fieldGroup="meta"
                clearance={clearance}
                requiredLabel="V"
              />
            </span>
          </div>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>생성일</span>
            <span className={styles.dossier__value}>
              <ClassifiedField
                value={formatDate(character.createdAt)}
                fieldGroup="meta"
                clearance={clearance}
                requiredLabel="V"
              />
            </span>
          </div>
          <div className={styles.dossier__row}>
            <span className={styles.dossier__label}>수정일</span>
            <span className={styles.dossier__value}>
              <ClassifiedField
                value={formatDate(character.updatedAt)}
                fieldGroup="meta"
                clearance={clearance}
                requiredLabel="V"
              />
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
