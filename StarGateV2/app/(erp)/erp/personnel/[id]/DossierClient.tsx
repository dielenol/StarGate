"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import type { AgentLevel, Character } from "@/types/character";
import { AGENT_LEVEL_LABELS } from "@/types/character";

import {
  canViewField,
  FIELD_REQUIRED_LEVEL,
  getLevelDisplayRank,
} from "@/lib/personnel";
import type { FieldGroup } from "@/lib/personnel";
import { getDepartmentLabel, getTopLevelGroup } from "@/lib/org-structure";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Pips from "@/components/ui/Pips/Pips";
import Seal from "@/components/ui/Seal/Seal";
import Tag from "@/components/ui/Tag/Tag";

import ClearanceMap from "./_components/ClearanceMap";
import DossierTabs from "./_components/DossierTabs";
import type { DossierTabKey } from "./_components/DossierTabs";
import LockedSection from "./_components/LockedSection";
import ReqClrBadge from "./_components/ReqClrBadge";

import styles from "./page.module.css";

const AGENT_DETAIL_LABELS = [
  "CLASS",
  "WEIGHT",
  "ABILITY TYPE",
  "CREDIT",
  "WEAPON TRAINING",
  "SKILL TRAINING",
] as const;

const EQUIPMENT_LOCKED_CODES = [
  "EQ-████ · 01",
  "EQ-████ · 02",
  "EQ-████ · 03",
  "EQ-████ · 04",
] as const;

const ABILITIES_LOCKED_WIDTHS = [140, 200, 160] as const;

const REDACTED = "[CLASSIFIED]";

function getInitial(c: Character): string {
  const source =
    c.sheet.name && c.sheet.name !== REDACTED ? c.sheet.name : c.codename;
  return source.charAt(0).toUpperCase() || "?";
}

function formatDate(value: string | Date | undefined | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * 임시 AUDIT ID placeholder.
 * character._id 가 있으면 뒷 6자 대문자, 없으면 codename fallback + 0 패딩.
 * TODO: 실제 감사 로그 연동 시 ObjectId 기반 audit log ID 로 교체.
 */
function buildAuditId(character: Character): string {
  const raw = character._id ? String(character._id) : character.codename;
  return raw.slice(-6).toUpperCase().padStart(6, "0");
}

function isRedactedValue(value: unknown): boolean {
  return value === REDACTED || value === "" || value === null || value === undefined;
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
        [CLASSIFIED · {FIELD_REQUIRED_LEVEL[fieldGroup]}]
      </span>
    );
  }
  if (isRedactedValue(value)) return <span>—</span>;
  return <span>{value}</span>;
}

function RedactedBlock({
  content,
  fieldGroup,
  clearance,
}: {
  content: string | undefined | null;
  fieldGroup: FieldGroup;
  clearance: AgentLevel;
}) {
  if (!canViewField(clearance, fieldGroup)) {
    return <span className={styles.redactedBar}>████████████████████</span>;
  }
  if (isRedactedValue(content)) return <span>—</span>;
  return <span className={styles.textBlock}>{content}</span>;
}

function KVRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.kvRow}>
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
  const [activeTab, setActiveTab] = useState<DossierTabKey>("dossier");

  const level: AgentLevel = character.agentLevel ?? "J";
  const department = character.department ?? "UNASSIGNED";
  const isAgent = character.type === "AGENT";

  const departmentLabel = getDepartmentLabel(department);
  const topGroup = getTopLevelGroup(department);
  const topGroupLabel = topGroup === "UNASSIGNED" ? "" : topGroup;
  const subUnitLabel =
    topGroup !== "UNASSIGNED" && department !== topGroup ? department : "";

  const canIdentity = canViewField(clearance, "identity");
  const canProfile = canViewField(clearance, "profile");
  const canCombat = canViewField(clearance, "combatStats");
  const canAbilities = canViewField(clearance, "abilities");
  const canMeta = canViewField(clearance, "meta");

  const auditId = buildAuditId(character);
  const auditTimestamp = formatDate(character.updatedAt);

  const breadcrumb = [
    { label: "‹ PERSONNEL", href: "/erp/personnel" },
    topGroupLabel ? { label: topGroupLabel } : null,
    subUnitLabel ? { label: subUnitLabel } : null,
    { label: character.codename },
  ].filter(Boolean) as { label: string; href?: string }[];

  const displayName = canIdentity && !isRedactedValue(character.sheet.name)
    ? character.sheet.name
    : null;

  const nameEn =
    !isAgent && canProfile && !isRedactedValue(character.sheet.nameEn)
      ? character.sheet.nameEn
      : null;

  const headRight = (
    <div className={styles.headRight}>
      <span className={styles.clrPill} data-rank={clearance}>
        <span>
          MY CLR · {clearance} · {AGENT_LEVEL_LABELS[clearance]}
        </span>
        <Pips total={7} filled={getLevelDisplayRank(clearance)} />
      </span>
      <Button as="a" href="/erp/personnel" size="sm">
        ← 복귀
      </Button>
      <Button
        size="sm"
        onClick={() => {
          /* Phase 3: PDF 내보내기 연결 예정 */
        }}
      >
        ⇣ PDF
      </Button>
    </div>
  );

  const pageTitle = (
    <>
      {displayName ?? character.codename}
      {nameEn ? <span className={styles.headTitleEn}>{nameEn}</span> : null}
    </>
  );

  /* ── 탭 본문: DOSSIER ── */

  const renderCharacterProfile = () => {
    if (!canProfile) {
      return (
        <LockedSection
          variant="full"
          required="H"
          title="CLASSIFIED · H"
          subtitle={"APPEARANCE / PERSONALITY / BACKGROUND\n상위 등급 필요"}
        />
      );
    }

    return (
      <>
        <div className={styles.profileGrid}>
          <div>
            <div className={styles.profileHeading}>APPEARANCE · 외형</div>
            <p className={styles.profileBody}>
              <RedactedBlock
                content={character.sheet.appearance}
                fieldGroup="profile"
                clearance={clearance}
              />
            </p>
          </div>
          <div>
            <div className={styles.profileHeading}>PERSONALITY · 성격</div>
            <p className={styles.profileBody}>
              <RedactedBlock
                content={character.sheet.personality}
                fieldGroup="profile"
                clearance={clearance}
              />
            </p>
          </div>
        </div>

        <div className={styles.profileSection}>
          <div className={styles.profileHeading}>BACKGROUND · 배경</div>
          <p className={styles.profileBody}>
            <RedactedBlock
              content={character.sheet.background}
              fieldGroup="profile"
              clearance={clearance}
            />
          </p>
        </div>

        {character.sheet.quote && !isRedactedValue(character.sheet.quote) ? (
          <div className={styles.quote}>
            {character.sheet.quote}
            <span className={styles.quoteMeta}>— QUOTE</span>
          </div>
        ) : null}
      </>
    );
  };

  const renderAgentBody = () => {
    if (!isAgent) return null;

    const sheet = character.sheet;

    return (
      <>
        {/* COMBAT STATS */}
        <Box>
          <PanelTitle
            right={
              <ReqClrBadge required="H" locked={!canCombat} />
            }
          >
            COMBAT STATS · AGENT
          </PanelTitle>
          {canCombat ? (
            <div className={styles.combatStatsGrid}>
              {(
                [
                  ["HP", sheet.hp],
                  ["SAN", sheet.san],
                  ["DEF", sheet.def],
                  ["ATK", sheet.atk],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className={styles.statBox}>
                  <div className={styles.statLabel}>{label}</div>
                  <div className={styles.statNumber}>{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <LockedSection
              variant="full"
              required="H"
              title="CLASSIFIED · H"
              subtitle={"HP / SAN / DEF / ATK\n상위 등급 필요"}
            />
          )}
        </Box>

        {/* AGENT DETAILS */}
        <Box>
          <PanelTitle
            right={<ReqClrBadge required="M" locked={!canAbilities} />}
          >
            AGENT DETAILS
          </PanelTitle>
          {canAbilities ? (
            <div className={styles.agentDetailsGrid}>
              <div className={styles.agentDetailCell}>
                <div className={styles.agentDetailLabel}>CLASS</div>
                <div className={styles.agentDetailValue}>
                  <ClassifiedValue
                    value={sheet.className}
                    fieldGroup="abilities"
                    clearance={clearance}
                  />
                </div>
              </div>
              <div className={styles.agentDetailCell}>
                <div className={styles.agentDetailLabel}>WEIGHT</div>
                <div className={styles.agentDetailValue}>
                  <ClassifiedValue
                    value={sheet.weight}
                    fieldGroup="abilities"
                    clearance={clearance}
                  />
                </div>
              </div>
              <div className={styles.agentDetailCell}>
                <div className={styles.agentDetailLabel}>ABILITY TYPE</div>
                <div className={styles.agentDetailValue}>
                  <ClassifiedValue
                    value={sheet.abilityType}
                    fieldGroup="abilities"
                    clearance={clearance}
                  />
                </div>
              </div>
              <div className={styles.agentDetailCell}>
                <div className={styles.agentDetailLabel}>CREDIT</div>
                <div
                  className={[styles.agentDetailValue, styles.mono]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <ClassifiedValue
                    value={sheet.credit}
                    fieldGroup="abilities"
                    clearance={clearance}
                  />
                </div>
              </div>
              <div className={styles.agentDetailCell}>
                <div className={styles.agentDetailLabel}>WEAPON TRAINING</div>
                <div className={styles.agentDetailValue}>
                  <ClassifiedValue
                    value={sheet.weaponTraining}
                    fieldGroup="abilities"
                    clearance={clearance}
                  />
                </div>
              </div>
              <div className={styles.agentDetailCell}>
                <div className={styles.agentDetailLabel}>SKILL TRAINING</div>
                <div className={styles.agentDetailValue}>
                  <ClassifiedValue
                    value={sheet.skillTraining}
                    fieldGroup="abilities"
                    clearance={clearance}
                  />
                </div>
              </div>
            </div>
          ) : (
            <LockedSection
              variant="grid"
              required="M"
              fields={[...AGENT_DETAIL_LABELS]}
            />
          )}
        </Box>

        {/* ABILITIES */}
        <Box>
          <PanelTitle
            right={<ReqClrBadge required="M" locked={!canAbilities} />}
          >
            ABILITIES
          </PanelTitle>
          {canAbilities ? (
            sheet.abilities.length === 0 ? (
              <div className={styles.empty}>등록된 능력 없음</div>
            ) : (
              <div className={styles.abilitiesList}>
                {sheet.abilities.map((ab, i) => (
                  <div
                    key={ab.code || `${ab.name}-${i}`}
                    className={styles.abilityItem}
                  >
                    <div className={styles.abilityItem__head}>
                      <div className={styles.abilityItem__name}>{ab.name}</div>
                      {ab.code ? <Tag tone="gold">{ab.code}</Tag> : null}
                    </div>
                    {ab.description ? (
                      <div className={styles.abilityItem__desc}>
                        {ab.description}
                      </div>
                    ) : null}
                    {ab.effect ? (
                      <div className={styles.abilityItem__effect}>
                        <span className={styles.mono}>EFFECT · </span>
                        {ab.effect}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              <div className={styles.abilitiesLockedList}>
                {ABILITIES_LOCKED_WIDTHS.map((width, i) => (
                  <div key={i} className={styles.abilitiesLockedRow}>
                    <span>
                      <span className={styles.abilitiesLockedCode}>AB-████</span>
                      <span
                        className={styles.redactBlock}
                        style={{ width }}
                        aria-hidden
                      />
                    </span>
                    <span className={styles.classifiedTag}>CLR · M</span>
                  </div>
                ))}
              </div>
              <div className={styles.abilitiesLockedFooter}>
                {ABILITIES_LOCKED_WIDTHS.length} 항목 · 전체 마스킹
              </div>
            </>
          )}
        </Box>

        {/* EQUIPMENT */}
        <Box>
          <PanelTitle
            right={<ReqClrBadge required="M" locked={!canAbilities} />}
          >
            EQUIPMENT
          </PanelTitle>
          {canAbilities ? (
            sheet.equipment.length === 0 ? (
              <div className={styles.empty}>등록된 장비 없음</div>
            ) : (
              <div className={styles.equipmentGrid}>
                {sheet.equipment.map((eq, i) => (
                  <div key={`${eq.name}-${i}`} className={styles.equipmentCard}>
                    <div className={styles.equipmentCard__head}>
                      <div className={styles.equipmentCard__name}>
                        {eq.name || "UNNAMED"}
                      </div>
                      {eq.damage ? (
                        <Tag tone="danger">DMG {eq.damage}</Tag>
                      ) : null}
                    </div>
                    {eq.price !== undefined && eq.price !== "" ? (
                      <div className={styles.equipmentCard__meta}>
                        PRICE · {eq.price}
                      </div>
                    ) : null}
                    {eq.description ? (
                      <div className={styles.equipmentCard__desc}>
                        {eq.description}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className={styles.equipmentLockedGrid}>
              {EQUIPMENT_LOCKED_CODES.map((code) => (
                <div key={code} className={styles.equipmentLockedCard}>
                  <div className={styles.equipmentLockedCode}>{code}</div>
                  <div className={styles.equipmentLockedValue}>
                    [CLASSIFIED · M]
                  </div>
                </div>
              ))}
            </div>
          )}
        </Box>
      </>
    );
  };

  const renderNpcBody = () => {
    if (isAgent) return null;

    return (
      <Box>
        <PanelTitle right={<ReqClrBadge required="H" locked={!canProfile} />}>
          NPC DETAILS
        </PanelTitle>
        {canProfile ? (
          <dl className={styles.kv}>
            <KVRow label="NAME (EN)">
              <span className={styles.mono}>
                <ClassifiedValue
                  value={character.sheet.nameEn}
                  fieldGroup="profile"
                  clearance={clearance}
                />
              </span>
            </KVRow>
            <KVRow label="ROLE DETAIL">
              <RedactedBlock
                content={character.sheet.roleDetail}
                fieldGroup="profile"
                clearance={clearance}
              />
            </KVRow>
            <KVRow label="NOTES">
              <RedactedBlock
                content={character.sheet.notes}
                fieldGroup="profile"
                clearance={clearance}
              />
            </KVRow>
          </dl>
        ) : (
          <LockedSection
            variant="full"
            required="H"
            title="CLASSIFIED · H"
            subtitle={"NAME(EN) / ROLE DETAIL / NOTES\n상위 등급 필요"}
          />
        )}
      </Box>
    );
  };

  const renderDossierTab = () => (
    <>
      {/* CHARACTER PROFILE */}
      <Box>
        <PanelTitle right={<ReqClrBadge required="H" locked={!canProfile} />}>
          CHARACTER PROFILE
        </PanelTitle>
        {renderCharacterProfile()}
      </Box>

      {isAgent ? renderAgentBody() : renderNpcBody()}
    </>
  );

  const renderEmptyTab = (title: string) => (
    <Box>
      <PanelTitle>{title}</PanelTitle>
      <div className={styles.tabEmpty}>
        준비중 · 추후 구현
        <br />
        AUD-{auditId}
      </div>
    </Box>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "dossier":
        return renderDossierTab();
      case "relations":
        return renderEmptyTab("관계도");
      case "sessions":
        return renderEmptyTab("세션 출현 이력");
      case "audit":
        return renderEmptyTab("감사 로그");
    }
  };

  /* ── 렌더 ── */

  return (
    <>
      <PageHead breadcrumb={breadcrumb} title={pageTitle} right={headRight} />

      {/* Read-only + masking notice */}
      <div className={styles.readOnlyNotice}>
        <span className={styles.readOnlyNotice__label}>READ-ONLY</span>
        <span className={styles.readOnlyNotice__body}>
          이 Dossier 는 서버에서 마스킹된 후 전달됩니다. 일부 섹션은{" "}
          <strong>M · Memorian</strong> 이상 필요.
        </span>
        <span className={styles.readOnlyNotice__audit}>
          AUDIT #AUD-{auditId} · {auditTimestamp}
        </span>
      </div>

      <div className={styles.layout}>
        {/* ── SIDE ── */}
        <div className={styles.side}>
          {/* Portrait */}
          <Box variant="gold" className={styles.portraitBox}>
            {character.previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={character.previewImage}
                alt={character.codename}
                className={styles.portraitImg}
              />
            ) : (
              <div className={styles.portraitPlaceholder}>
                <Seal size="lg">{getInitial(character)}</Seal>
              </div>
            )}

            <h2 className={styles.portraitName}>
              {displayName ?? (
                <span className={styles.redactedInline}>████████</span>
              )}
            </h2>
            <div className={styles.portraitCode}>{character.codename}</div>
            {nameEn ? (
              <div className={styles.portraitNameEn}>{nameEn}</div>
            ) : null}

            <div className={styles.typeRow}>
              <Tag tone={isAgent ? "gold" : "default"}>{character.type}</Tag>
              {departmentLabel && departmentLabel !== "미배정" ? (
                <Tag tone="default">{departmentLabel}</Tag>
              ) : null}
            </div>

            <div className={styles.clrPillRow}>
              <span className={styles.clrPill} data-rank={level}>
                <span>
                  TARGET CLR · {level} · {AGENT_LEVEL_LABELS[level]}
                </span>
                <Pips total={7} filled={getLevelDisplayRank(level)} />
              </span>
            </div>
          </Box>

          {/* IDENTITY */}
          <Box>
            <PanelTitle
              right={<ReqClrBadge required="G" locked={!canIdentity} />}
            >
              IDENTITY
            </PanelTitle>
            {canIdentity ? (
              <dl className={styles.kv}>
                <KVRow label="CODE">
                  <span className={`${styles.mono} ${styles.monoGold}`}>
                    {character.codename}
                  </span>
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
                  <span className={styles.mono}>
                    <ClassifiedValue
                      value={character.sheet.height}
                      fieldGroup="identity"
                      clearance={clearance}
                    />
                  </span>
                </KVRow>
                <KVRow label="소속">
                  <span>{departmentLabel}</span>
                </KVRow>
              </dl>
            ) : (
              <LockedSection
                variant="full"
                required="G"
                title="CLASSIFIED · G"
                subtitle={"CODE / 실명 / 성별 / 나이 / 신장\n상위 등급 필요"}
              />
            )}
          </Box>

          {/* AUDIT */}
          <Box>
            <PanelTitle right={<ReqClrBadge required="V" locked={!canMeta} />}>
              AUDIT
            </PanelTitle>
            {canMeta ? (
              <dl className={styles.kv}>
                <KVRow label="OWNER">
                  <span className={styles.mono}>{character.ownerId ?? "—"}</span>
                </KVRow>
                <KVRow label="CREATED">
                  <span className={styles.mono}>
                    {formatDate(character.createdAt)}
                  </span>
                </KVRow>
                <KVRow label="UPDATED">
                  <span className={styles.mono}>
                    {formatDate(character.updatedAt)}
                  </span>
                </KVRow>
              </dl>
            ) : (
              <LockedSection
                variant="full"
                required="V"
                title="CLASSIFIED · V"
                subtitle={"OWNER / CREATED / UPDATED\nVoidwalker 등급 필요"}
              />
            )}
          </Box>

          {/* CLEARANCE MAP */}
          <ClearanceMap clearance={clearance} />
        </div>

        {/* ── MAIN ── */}
        <div className={styles.main}>
          <DossierTabs
            active={activeTab}
            onChange={setActiveTab}
            counts={{ relations: 0, sessions: 0 }}
            auditLevel="V"
          />
          <div
            id={`dossier-tabpanel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`dossier-tab-${activeTab}`}
            className={styles.tabContent}
          >
            {renderTabContent()}
          </div>
        </div>
      </div>
    </>
  );
}
