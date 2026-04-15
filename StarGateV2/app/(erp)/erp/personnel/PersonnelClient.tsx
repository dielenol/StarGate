"use client";

import { useState } from "react";
import Link from "next/link";

import type { Character, AgentLevel } from "@/types/character";
import { AGENT_LEVEL_LABELS, DEPARTMENTS } from "@/types/character";

import { useCharacters } from "@/hooks/queries/useCharactersQuery";
import { canViewField } from "@/lib/personnel";

import styles from "./page.module.css";

const ALL_DEPARTMENT_CODE = "ALL" as const;

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

  const [activeDept, setActiveDept] = useState<string>(ALL_DEPARTMENT_CODE);

  const filtered =
    activeDept === ALL_DEPARTMENT_CODE
      ? characters
      : characters.filter((c) => c.department === activeDept);

  const showIdentity = canViewField(clearance, "identity");

  return (
    <section className={styles.personnel}>
      <div className={styles.personnel__classification}>
        PERSONNEL DATABASE
      </div>

      <div className={styles.personnel__header}>
        <h1 className={styles.personnel__title}>인원 관리</h1>
      </div>

      {/* Clearance badge */}
      <div className={styles.personnel__clearanceBadge}>
        현재 열람 등급:
        <span className={styles.personnel__clearanceLevel}>{clearance}</span>
        {AGENT_LEVEL_LABELS[clearance]} CLEARANCE
      </div>

      {/* Department filter tabs */}
      <div className={styles.personnel__filters}>
        <button
          type="button"
          className={`${styles.personnel__filterTab} ${
            activeDept === ALL_DEPARTMENT_CODE
              ? styles["personnel__filterTab--active"]
              : ""
          }`}
          onClick={() => setActiveDept(ALL_DEPARTMENT_CODE)}
        >
          전체
        </button>
        {DEPARTMENTS.map((dept) => (
          <button
            key={dept.code}
            type="button"
            className={`${styles.personnel__filterTab} ${
              activeDept === dept.code
                ? styles["personnel__filterTab--active"]
                : ""
            }`}
            onClick={() => setActiveDept(dept.code)}
          >
            {dept.label}
          </button>
        ))}
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <p className={styles.personnel__empty}>
          해당 부서에 등록된 인원이 없습니다.
        </p>
      ) : (
        <div className={styles.personnel__grid}>
          {filtered.map((c) => {
            const level = c.agentLevel ?? "J";
            const dept = DEPARTMENTS.find((d) => d.code === c.department);

            return (
              <Link
                key={String(c._id)}
                href={`/erp/personnel/${String(c._id)}`}
                className={styles.personnel__card}
              >
                {c.previewImage ? (
                  <img
                    src={c.previewImage}
                    alt={c.codename}
                    className={styles.personnel__cardImage}
                  />
                ) : (
                  <div className={styles.personnel__cardPlaceholder}>?</div>
                )}

                <div className={styles.personnel__cardInfo}>
                  <div className={styles.personnel__cardCodename}>
                    {c.codename}
                  </div>

                  <div className={styles.personnel__cardRole}>
                    {c.role}
                    <span
                      className={`${styles.personnel__levelBadge} ${
                        styles[`personnel__levelBadge--${level}`]
                      }`}
                    >
                      {level}
                    </span>
                  </div>

                  <div className={styles.personnel__cardDept}>
                    {dept?.label ?? "미배정"}
                  </div>

                  <div className={styles.personnel__cardIdentity}>
                    {showIdentity ? (
                      c.sheet.name
                    ) : (
                      <span className={styles.personnel__classified}>
                        [CLASSIFIED]
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
