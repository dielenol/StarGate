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

const REDACTED = "[CLASSIFIED]";

function getInitial(c: Character): string {
  const source =
    c.lore.name && c.lore.name !== REDACTED ? c.lore.name : c.codename;
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

/* ── Component ──
 *
 * Phase 3 — `/erp/personnel` dossier 는 lore-only readonly. play (게임 시트) 섹션은 모두 제거되었다.
 * 게임 시트 노출은 `/erp/characters/[id]` 라우트로 분리. AGENT/NPC 모두 진입 가능.
 */

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
  const canMeta = canViewField(clearance, "meta");

  const auditId = buildAuditId(character);
  const auditTimestamp = formatDate(character.updatedAt);

  const breadcrumb = [
    { label: "‹ PERSONNEL", href: "/erp/personnel" },
    topGroupLabel ? { label: topGroupLabel } : null,
    subUnitLabel ? { label: subUnitLabel } : null,
    { label: character.codename },
  ].filter(Boolean) as { label: string; href?: string }[];

  const lore = character.lore;

  const displayName =
    canIdentity && !isRedactedValue(lore.name) ? lore.name : null;

  const nameEn =
    canIdentity && !isRedactedValue(lore.nameEn) ? lore.nameEn : null;

  const headRight = (
    <div className={styles.headRight}>
      <span className={styles.clrPill} data-rank={clearance}>
        <span>
          권한등급 · {clearance} · {AGENT_LEVEL_LABELS[clearance]}
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
                content={lore.appearance}
                fieldGroup="profile"
                clearance={clearance}
              />
            </p>
          </div>
          <div>
            <div className={styles.profileHeading}>PERSONALITY · 성격</div>
            <p className={styles.profileBody}>
              <RedactedBlock
                content={lore.personality}
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
              content={lore.background}
              fieldGroup="profile"
              clearance={clearance}
            />
          </p>
        </div>

        {lore.quote && !isRedactedValue(lore.quote) ? (
          <div className={styles.quote}>
            &ldquo;{lore.quote}&rdquo;
            <span className={styles.quoteMeta}>— QUOTE</span>
          </div>
        ) : null}
      </>
    );
  };

  /**
   * LORE 메타 (loreTags / appearsInEvents). identity 그룹 하위 보조 정보.
   */
  const renderLoreMeta = () => {
    const hasTags = lore.loreTags && lore.loreTags.length > 0;
    const hasEvents = lore.appearsInEvents && lore.appearsInEvents.length > 0;
    if (!hasTags && !hasEvents) return null;
    if (!canIdentity) return null;

    return (
      <Box>
        <PanelTitle right={<ReqClrBadge required="G" locked={false} />}>
          LORE · 태그 · 이벤트
        </PanelTitle>
        <dl className={styles.kv}>
          {hasTags ? (
            <KVRow label="TAGS">
              <span>{lore.loreTags!.join(", ")}</span>
            </KVRow>
          ) : null}
          {hasEvents ? (
            <KVRow label="APPEARS IN">
              <span>{lore.appearsInEvents!.join(", ")}</span>
            </KVRow>
          ) : null}
        </dl>
      </Box>
    );
  };

  /**
   * NPC 추가 필드 (NAME EN / ROLE DETAIL / NOTES).
   * lore sub-document 안에 NPC 호환 필드로 보존됨.
   */
  const renderNpcExtras = () => {
    const hasNpcExtras =
      !isRedactedValue(lore.nameEn) ||
      !isRedactedValue(lore.roleDetail) ||
      !isRedactedValue(lore.notes);
    if (!hasNpcExtras) return null;

    return (
      <Box>
        <PanelTitle right={<ReqClrBadge required="H" locked={!canProfile} />}>
          NPC DETAILS
        </PanelTitle>
        {canProfile ? (
          <dl className={styles.kv}>
            {!isRedactedValue(lore.nameEn) ? (
              <KVRow label="NAME (EN)">
                <span className={styles.mono}>
                  <ClassifiedValue
                    value={lore.nameEn}
                    fieldGroup="profile"
                    clearance={clearance}
                  />
                </span>
              </KVRow>
            ) : null}
            {!isRedactedValue(lore.roleDetail) ? (
              <KVRow label="ROLE DETAIL">
                <RedactedBlock
                  content={lore.roleDetail}
                  fieldGroup="profile"
                  clearance={clearance}
                />
              </KVRow>
            ) : null}
            {!isRedactedValue(lore.notes) ? (
              <KVRow label="NOTES">
                <RedactedBlock
                  content={lore.notes}
                  fieldGroup="profile"
                  clearance={clearance}
                />
              </KVRow>
            ) : null}
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

      {renderLoreMeta()}
      {renderNpcExtras()}
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
                  대상 권한등급 · {level} · {AGENT_LEVEL_LABELS[level]}
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
                    value={lore.name}
                    fieldGroup="identity"
                    clearance={clearance}
                  />
                </KVRow>
                {!isRedactedValue(lore.nameNative) ? (
                  <KVRow label="원어 표기">
                    <ClassifiedValue
                      value={lore.nameNative}
                      fieldGroup="identity"
                      clearance={clearance}
                    />
                  </KVRow>
                ) : null}
                {!isRedactedValue(lore.nickname) ? (
                  <KVRow label="별칭">
                    <ClassifiedValue
                      value={lore.nickname}
                      fieldGroup="identity"
                      clearance={clearance}
                    />
                  </KVRow>
                ) : null}
                <KVRow label="성별">
                  <ClassifiedValue
                    value={lore.gender}
                    fieldGroup="identity"
                    clearance={clearance}
                  />
                </KVRow>
                <KVRow label="나이">
                  <ClassifiedValue
                    value={lore.age}
                    fieldGroup="identity"
                    clearance={clearance}
                  />
                </KVRow>
                <KVRow label="신장">
                  <span className={styles.mono}>
                    <ClassifiedValue
                      value={lore.height}
                      fieldGroup="identity"
                      clearance={clearance}
                    />
                  </span>
                </KVRow>
                <KVRow label="체중">
                  <span className={styles.mono}>
                    <ClassifiedValue
                      value={lore.weight}
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
