"use client";

import type { ReactNode } from "react";

import type { AgentLevel, Character } from "@/types/character";
import { AGENT_LEVEL_LABELS } from "@/types/character";

import { canViewField, type FieldGroup } from "@/lib/personnel";
import { getDepartmentLabel } from "@/lib/org-structure";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Seal from "@/components/ui/Seal/Seal";
import Stack from "@/components/ui/Stack/Stack";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

const FIELD_REQUIRED_LABEL: Record<FieldGroup, string> = {
  identity: "G",
  profile: "H",
  combatStats: "H",
  abilities: "M",
  meta: "V",
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

/* ── Helper primitives ── */

function ClassifiedValue({
  value,
  fieldGroup,
  clearance,
}: {
  value: string | number | undefined | null;
  fieldGroup: FieldGroup;
  clearance: AgentLevel;
}) {
  if (!canViewField(clearance, fieldGroup)) {
    return (
      <span className={styles.classified}>
        [CLASSIFIED · {FIELD_REQUIRED_LABEL[fieldGroup]}]
      </span>
    );
  }
  if (value === undefined || value === null || value === "") return <span>—</span>;
  return <span>{value}</span>;
}

function RedactedBlock({
  content,
  fieldGroup,
  clearance,
}: {
  content: string | undefined;
  fieldGroup: FieldGroup;
  clearance: AgentLevel;
}) {
  if (!canViewField(clearance, fieldGroup)) {
    return <span className={styles.redactedBar}>████████████████████</span>;
  }
  if (!content) return <span>—</span>;
  return <span className={styles.textBlock}>{content}</span>;
}

function KVRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.kv__row}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/* ── Props ── */

interface Props {
  character: Character;
  clearance: AgentLevel;
}

/* ── Component ── */

export default function DossierClient({ character, clearance }: Props) {
  const level: AgentLevel = character.agentLevel ?? "J";
  const department = character.department ?? "UNASSIGNED";
  const isAgent = character.type === "AGENT";

  const departmentLabel = getDepartmentLabel(department);
  const canMeta = canViewField(clearance, "meta");

  return (
    <>
      <PageHead
        breadcrumb={`IDENTITY / ${character.codename}`}
        title={character.codename}
        right={
          <>
            <Tag tone={LEVEL_TAG_TONE[level]}>
              CLR · {level} · {AGENT_LEVEL_LABELS[level]}
            </Tag>
            <Tag tone={isAgent ? "gold" : "default"}>{character.type}</Tag>
            <Button as="a" href="/erp/personnel">
              ← 목록
            </Button>
          </>
        }
      />

      <div className={styles.layout}>
        {/* ── Side: portrait + basic identity ── */}
        <div className={styles.side}>
          <Box>
            <div className={styles.sideHeader}>
              {character.previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={character.previewImage}
                  alt={character.codename}
                  className={styles.sideHeader__image}
                />
              ) : (
                <Seal size="lg" className={styles.sideHeader__seal}>
                  {getInitial(character)}
                </Seal>
              )}
              <div className={styles.sideHeader__code}>
                {character.codename}
              </div>
              <h2 className={styles.sideHeader__name}>
                {canViewField(clearance, "identity") && character.sheet.name
                  ? character.sheet.name
                  : null}
                {!canViewField(clearance, "identity") ? (
                  <span className={styles.redactedInline}>████████</span>
                ) : null}
              </h2>
              <div className={styles.sideHeader__role}>
                {[character.role, departmentLabel]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className={styles.sideHeader__tags}>
                <Tag tone={LEVEL_TAG_TONE[level]}>{level}</Tag>
                <Tag tone={isAgent ? "gold" : "default"}>
                  {isAgent ? "AGENT" : "NPC"}
                </Tag>
              </div>
            </div>

            <dl className={styles.kv}>
              <KVRow label="CODE">
                <span className={styles.mono}>{character.codename}</span>
              </KVRow>
              <KVRow label="실명">
                <ClassifiedValue
                  value={character.sheet.name}
                  fieldGroup="identity"
                  clearance={clearance}
                />
              </KVRow>
              <KVRow label="성별">
                <ClassifiedValue
                  value={character.sheet.gender}
                  fieldGroup="identity"
                  clearance={clearance}
                />
              </KVRow>
              <KVRow label="나이">
                <ClassifiedValue
                  value={character.sheet.age}
                  fieldGroup="identity"
                  clearance={clearance}
                />
              </KVRow>
              <KVRow label="신장">
                <ClassifiedValue
                  value={character.sheet.height}
                  fieldGroup="identity"
                  clearance={clearance}
                />
              </KVRow>
              <KVRow label="소속">
                <span>{departmentLabel}</span>
              </KVRow>
            </dl>
          </Box>

          <Box>
            <PanelTitle
              right={<span className={styles.mono}>META</span>}
            >
              AUDIT
            </PanelTitle>
            <dl className={styles.kv}>
              <KVRow label="OWNER">
                <ClassifiedValue
                  value={canMeta ? (character.ownerId ?? "—") : undefined}
                  fieldGroup="meta"
                  clearance={clearance}
                />
              </KVRow>
              <KVRow label="생성일">
                <ClassifiedValue
                  value={canMeta ? formatDate(character.createdAt) : undefined}
                  fieldGroup="meta"
                  clearance={clearance}
                />
              </KVRow>
              <KVRow label="수정일">
                <ClassifiedValue
                  value={canMeta ? formatDate(character.updatedAt) : undefined}
                  fieldGroup="meta"
                  clearance={clearance}
                />
              </KVRow>
            </dl>
          </Box>
        </div>

        {/* ── Main sections ── */}
        <div className={styles.main}>
          <Box>
            <PanelTitle
              right={<span className={styles.mono}>CLR · H</span>}
            >
              CHARACTER PROFILE
            </PanelTitle>
            <dl className={styles.prof}>
              <div className={styles.prof__row}>
                <dt>외형</dt>
                <dd>
                  <RedactedBlock
                    content={character.sheet.appearance}
                    fieldGroup="profile"
                    clearance={clearance}
                  />
                </dd>
              </div>
              <div className={styles.prof__row}>
                <dt>성격</dt>
                <dd>
                  <RedactedBlock
                    content={character.sheet.personality}
                    fieldGroup="profile"
                    clearance={clearance}
                  />
                </dd>
              </div>
              <div className={styles.prof__row}>
                <dt>배경</dt>
                <dd>
                  <RedactedBlock
                    content={character.sheet.background}
                    fieldGroup="profile"
                    clearance={clearance}
                  />
                </dd>
              </div>
              {character.sheet.quote ? (
                <div className={styles.prof__row}>
                  <dt>QUOTE</dt>
                  <dd>
                    <RedactedBlock
                      content={character.sheet.quote}
                      fieldGroup="profile"
                      clearance={clearance}
                    />
                  </dd>
                </div>
              ) : null}
            </dl>
          </Box>

          {isAgent ? (
            <>
              <Box>
                <PanelTitle
                  right={<span className={styles.mono}>CLR · H</span>}
                >
                  COMBAT STATS
                </PanelTitle>
                {canViewField(clearance, "combatStats") ? (
                  <div className={styles.statsGrid}>
                    <StatCard label="HP" value={character.sheet.hp} />
                    <StatCard label="SAN" value={character.sheet.san} />
                    <StatCard label="DEF" value={character.sheet.def} />
                    <StatCard label="ATK" value={character.sheet.atk} />
                  </div>
                ) : (
                  <div className={styles.empty}>
                    <span className={styles.classified}>
                      [CLASSIFIED · H등급 필요]
                    </span>
                  </div>
                )}
              </Box>

              <Box>
                <PanelTitle
                  right={<span className={styles.mono}>CLR · M</span>}
                >
                  AGENT DETAILS
                </PanelTitle>
                <dl className={styles.prof}>
                  <div className={styles.prof__row}>
                    <dt>CLASS</dt>
                    <dd>
                      <ClassifiedValue
                        value={character.sheet.className}
                        fieldGroup="abilities"
                        clearance={clearance}
                      />
                    </dd>
                  </div>
                  <div className={styles.prof__row}>
                    <dt>WEIGHT</dt>
                    <dd>
                      <ClassifiedValue
                        value={character.sheet.weight}
                        fieldGroup="abilities"
                        clearance={clearance}
                      />
                    </dd>
                  </div>
                  <div className={styles.prof__row}>
                    <dt>ABILITY TYPE</dt>
                    <dd>
                      <ClassifiedValue
                        value={character.sheet.abilityType}
                        fieldGroup="abilities"
                        clearance={clearance}
                      />
                    </dd>
                  </div>
                  <div className={styles.prof__row}>
                    <dt>CREDIT</dt>
                    <dd className={styles.mono}>
                      <ClassifiedValue
                        value={character.sheet.credit}
                        fieldGroup="abilities"
                        clearance={clearance}
                      />
                    </dd>
                  </div>
                  <div className={styles.prof__row}>
                    <dt>WEAPON</dt>
                    <dd>
                      <ClassifiedValue
                        value={character.sheet.weaponTraining}
                        fieldGroup="abilities"
                        clearance={clearance}
                      />
                    </dd>
                  </div>
                  <div className={styles.prof__row}>
                    <dt>SKILL</dt>
                    <dd>
                      <ClassifiedValue
                        value={character.sheet.skillTraining}
                        fieldGroup="abilities"
                        clearance={clearance}
                      />
                    </dd>
                  </div>
                </dl>
              </Box>

              <Box>
                <PanelTitle
                  right={
                    <span className={styles.mono}>
                      {canViewField(clearance, "abilities")
                        ? character.sheet.abilities.length
                        : "CLR · M"}
                    </span>
                  }
                >
                  ABILITIES
                </PanelTitle>
                {canViewField(clearance, "abilities") ? (
                  character.sheet.abilities.length === 0 ? (
                    <div className={styles.empty}>등록된 능력 없음</div>
                  ) : (
                    <Stack gap={10} className={styles.itemList}>
                      {character.sheet.abilities.map((ab, i) => (
                        <div key={ab.code || i} className={styles.itemCard}>
                          <div className={styles.itemCard__head}>
                            <div className={styles.itemCard__name}>{ab.name}</div>
                            {ab.code ? <Tag tone="gold">{ab.code}</Tag> : null}
                          </div>
                          {ab.description ? (
                            <div className={styles.itemCard__desc}>
                              {ab.description}
                            </div>
                          ) : null}
                          {ab.effect ? (
                            <div className={styles.itemCard__effect}>
                              <span className={styles.mono}>EFFECT · </span>
                              {ab.effect}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </Stack>
                  )
                ) : (
                  <div className={styles.empty}>
                    <span className={styles.classified}>
                      [CLASSIFIED · M등급 필요]
                    </span>
                  </div>
                )}
              </Box>

              <Box>
                <PanelTitle
                  right={
                    <span className={styles.mono}>
                      {canViewField(clearance, "abilities")
                        ? character.sheet.equipment.length
                        : "CLR · M"}
                    </span>
                  }
                >
                  EQUIPMENT
                </PanelTitle>
                {canViewField(clearance, "abilities") ? (
                  character.sheet.equipment.length === 0 ? (
                    <div className={styles.empty}>등록된 장비 없음</div>
                  ) : (
                    <Stack gap={10} className={styles.itemList}>
                      {character.sheet.equipment.map((eq, i) => (
                        <div key={i} className={styles.itemCard}>
                          <div className={styles.itemCard__head}>
                            <div className={styles.itemCard__name}>{eq.name}</div>
                            {eq.damage ? (
                              <Tag tone="danger">DMG {eq.damage}</Tag>
                            ) : null}
                          </div>
                          {eq.price !== undefined && eq.price !== "" ? (
                            <div className={styles.itemCard__meta}>
                              <span className={styles.mono}>
                                PRICE · {eq.price}
                              </span>
                            </div>
                          ) : null}
                          {eq.description ? (
                            <div className={styles.itemCard__desc}>
                              {eq.description}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </Stack>
                  )
                ) : (
                  <div className={styles.empty}>
                    <span className={styles.classified}>
                      [CLASSIFIED · M등급 필요]
                    </span>
                  </div>
                )}
              </Box>
            </>
          ) : (
            <Box>
              <PanelTitle right={<span className={styles.mono}>NPC</span>}>
                NPC DETAILS
              </PanelTitle>
              <dl className={styles.prof}>
                <div className={styles.prof__row}>
                  <dt>NAME (EN)</dt>
                  <dd className={styles.mono}>
                    <ClassifiedValue
                      value={character.sheet.nameEn}
                      fieldGroup="profile"
                      clearance={clearance}
                    />
                  </dd>
                </div>
                <div className={styles.prof__row}>
                  <dt>ROLE DETAIL</dt>
                  <dd>
                    <RedactedBlock
                      content={character.sheet.roleDetail}
                      fieldGroup="profile"
                      clearance={clearance}
                    />
                  </dd>
                </div>
                <div className={styles.prof__row}>
                  <dt>NOTES</dt>
                  <dd>
                    <RedactedBlock
                      content={character.sheet.notes}
                      fieldGroup="profile"
                      clearance={clearance}
                    />
                  </dd>
                </div>
              </dl>
            </Box>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statCard__value}>{value}</div>
      <div className={styles.statCard__label}>{label}</div>
    </div>
  );
}
