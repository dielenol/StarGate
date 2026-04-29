"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import type {
  AgentLevel,
  Character,
  CharacterTier,
} from "@/types/character";
import {
  AGENT_LEVELS,
  AGENT_LEVEL_LABELS,
  CHARACTER_TIERS,
} from "@/types/character";

import {
  canViewField,
  FIELD_REQUIRED_LEVEL,
  getLevelDisplayRank,
} from "@/lib/personnel";
import type { FieldGroup } from "@/lib/personnel";
import {
  getDepartmentLabel,
  getGroupKind,
  getGroupLabel,
  getTopLevelGroup,
} from "@/lib/org-structure";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Pips from "@/components/ui/Pips/Pips";
import Seal from "@/components/ui/Seal/Seal";
import Tag from "@/components/ui/Tag/Tag";

import OrgDrillCrumbs from "../_components/OrgDrillCrumbs";
import type { DrillCrumbItem } from "../_components/OrgDrillCrumbs";

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

/* ── Edit-mode primitives ── */

interface EditDraft {
  /* root */
  codename: string;
  tier: CharacterTier;
  agentLevel: AgentLevel;
  department: string;
  /* lore */
  loreName: string;
  loreNameNative: string;
  loreNickname: string;
  loreNameEn: string;
  loreGender: string;
  loreAge: string;
  loreHeight: string;
  loreWeight: string;
  loreAppearance: string;
  lorePersonality: string;
  loreBackground: string;
  loreQuote: string;
  loreMainImage: string;
  loreLoreTagsRaw: string; // CSV
  loreAppearsInEventsRaw: string; // CSV
  loreRoleDetail: string;
  loreNotes: string;
}

function dropRedacted(value: string | undefined | null): string {
  if (value === undefined || value === null) return "";
  if (value === REDACTED) return "";
  return value;
}

function buildInitialDraft(c: Character): EditDraft {
  return {
    codename: c.codename ?? "",
    tier: (c.tier ?? "MAIN") as CharacterTier,
    agentLevel: (c.agentLevel ?? "J") as AgentLevel,
    department: c.department ?? "",
    loreName: dropRedacted(c.lore.name),
    loreNameNative: dropRedacted(c.lore.nameNative),
    loreNickname: dropRedacted(c.lore.nickname),
    loreNameEn: dropRedacted(c.lore.nameEn),
    loreGender: dropRedacted(c.lore.gender),
    loreAge: dropRedacted(c.lore.age),
    loreHeight: dropRedacted(c.lore.height),
    loreWeight: dropRedacted(c.lore.weight),
    loreAppearance: dropRedacted(c.lore.appearance),
    lorePersonality: dropRedacted(c.lore.personality),
    loreBackground: dropRedacted(c.lore.background),
    loreQuote: dropRedacted(c.lore.quote),
    loreMainImage: dropRedacted(c.lore.mainImage),
    loreLoreTagsRaw: (c.lore.loreTags ?? []).join(", "),
    loreAppearsInEventsRaw: (c.lore.appearsInEvents ?? []).join(", "),
    loreRoleDetail: dropRedacted(c.lore.roleDetail),
    loreNotes: dropRedacted(c.lore.notes),
  };
}

/** CSV 문자열 → 정리된 배열 (공백 trim, 빈 항목 제거). */
function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface KVEditRowProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
}

function KVEditRow({
  label,
  value,
  onChange,
  multiline = false,
  rows = 4,
  placeholder,
  mono = false,
}: KVEditRowProps) {
  const inputCls = [
    styles.editInput,
    mono ? styles["editInput--mono"] : "",
    multiline ? styles["editInput--area"] : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={styles.kvRow}>
      <dt>{label}</dt>
      <dd>
        {multiline ? (
          <textarea
            className={inputCls}
            value={value}
            rows={rows}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            type="text"
            className={inputCls}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </dd>
    </div>
  );
}

interface KVEditSelectRowProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}

function KVEditSelectRow({
  label,
  value,
  onChange,
  options,
}: KVEditSelectRowProps) {
  return (
    <div className={styles.kvRow}>
      <dt>{label}</dt>
      <dd>
        <select
          className={`${styles.editInput} ${styles["editInput--select"]}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </dd>
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DossierTabKey>("dossier");

  const isGM = clearance === "GM";
  const characterId = character._id ? String(character._id) : null;

  /* ── 편집 상태 ──
   *
   * GM 한정. 토글 시 사이드/본문 KV 가 input/textarea 로 변환되며 [저장]/[취소] 버튼이 노출된다.
   * NPC 도 동일한 PATCH /api/erp/characters/[id] 를 사용 (admin 모드에서 lore + root 화이트리스트 적용).
   */
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(() =>
    buildInitialDraft(character),
  );
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const updateDraft = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleStartEdit = () => {
    setDraft(buildInitialDraft(character));
    setEditError(null);
    setActiveTab("dossier"); // 편집 폼은 DOSSIER 탭에 모여 있음
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setDraft(buildInitialDraft(character));
    setEditError(null);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!characterId) return;
    setSaving(true);
    setEditError(null);
    try {
      const body = {
        codename: draft.codename,
        tier: draft.tier,
        agentLevel: draft.agentLevel,
        department: draft.department,
        lore: {
          name: draft.loreName,
          nameNative: draft.loreNameNative,
          nickname: draft.loreNickname,
          nameEn: draft.loreNameEn,
          gender: draft.loreGender,
          age: draft.loreAge,
          height: draft.loreHeight,
          weight: draft.loreWeight,
          appearance: draft.loreAppearance,
          personality: draft.lorePersonality,
          background: draft.loreBackground,
          quote: draft.loreQuote,
          mainImage: draft.loreMainImage,
          loreTags: parseCsv(draft.loreLoreTagsRaw),
          appearsInEvents: parseCsv(draft.loreAppearsInEventsRaw),
          roleDetail: draft.loreRoleDetail,
          notes: draft.loreNotes,
        },
        reason: "personnel dossier 편집",
      };
      const res = await fetch(`/api/erp/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "저장 실패");
      }
      setIsEditing(false);
      router.refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setSaving(false);
    }
  };

  const level: AgentLevel = character.agentLevel ?? "J";
  const department = character.department ?? "UNASSIGNED";
  const isAgent = character.type === "AGENT";

  const departmentLabel = getDepartmentLabel(department);
  const topGroup = getTopLevelGroup(department);
  const subUnitLabel =
    topGroup !== "UNASSIGNED" && department !== topGroup ? department : "";

  const canIdentity = canViewField(clearance, "identity");
  const canProfile = canViewField(clearance, "profile");
  const canMeta = canViewField(clearance, "meta");

  const auditId = buildAuditId(character);
  const auditTimestamp = formatDate(character.updatedAt);

  /* dossier 에서 형제(같은 sub-unit) 캐릭터로 빠르게 점프할 수 있도록 breadcrumb 와
     "복귀" 버튼에 group/sub query 를 포함 — PersonnelClient 가 이 query 로
     해당 그룹/하위기구를 자동으로 펼친 상태로 진입한다. */
  const personnelHref = (() => {
    if (topGroup === "UNASSIGNED") return "/erp/personnel";
    const params = new URLSearchParams({ group: topGroup });
    if (department && department !== topGroup) params.set("sub", department);
    return `/erp/personnel?${params.toString()}`;
  })();

  const lore = character.lore;

  const displayName =
    canIdentity && !isRedactedValue(lore.name) ? lore.name : null;

  const nameEn =
    canIdentity && !isRedactedValue(lore.nameEn) ? lore.nameEn : null;

  /* 인덱스(PersonnelClient) 의 drill chip 과 동일한 UI 로 통일.
     마지막 chip 은 사용자 요청대로 `이름 (코드네임)` 형태. identity 권한이 없으면 codename 만. */
  const drillItems: DrillCrumbItem[] = (() => {
    const items: DrillCrumbItem[] = [
      { key: "root", label: "◎ 조직도 L1", href: "/erp/personnel" },
    ];

    if (topGroup !== "UNASSIGNED") {
      const kind = getGroupKind(topGroup);
      const prefix =
        kind === "faction" ? "세력" : kind === "institution" ? "기관" : "";
      const groupLabel =
        kind === "unassigned"
          ? "미배정"
          : `${prefix}: ${getGroupLabel(topGroup)}`;
      items.push({
        key: "group",
        label: groupLabel,
        href: `/erp/personnel?group=${topGroup}`,
      });
    }

    if (subUnitLabel && department !== topGroup) {
      items.push({
        key: "sub",
        label: `하위: ${getDepartmentLabel(department)}`,
        href: `/erp/personnel?group=${topGroup}&sub=${department}`,
      });
    }

    items.push({
      key: "char",
      label: displayName
        ? `${displayName} (${character.codename})`
        : character.codename,
      on: true,
    });

    return items;
  })();

  const headRight = (
    <div className={styles.headRight}>
      <span className={styles.clrPill} data-rank={clearance}>
        <span>
          권한등급 : {clearance} - {AGENT_LEVEL_LABELS[clearance]}
        </span>
        <Pips total={7} filled={getLevelDisplayRank(clearance)} />
      </span>
      {isEditing ? (
        <>
          <Button
            size="sm"
            onClick={handleCancelEdit}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveEdit}
            disabled={saving}
          >
            {saving ? "저장 중…" : "✓ 저장"}
          </Button>
        </>
      ) : (
        <>
          <Button as="a" href={personnelHref} size="sm">
            ← 복귀
          </Button>
          {isGM && characterId ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartEdit}
            >
              ✎ 편집
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() => {
              /* Phase 3: PDF 내보내기 연결 예정 */
            }}
          >
            ⇣ PDF
          </Button>
        </>
      )}
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
    if (isEditing) {
      return (
        <>
          <div className={styles.profileGrid}>
            <div>
              <div className={styles.profileHeading}>APPEARANCE · 외형</div>
              <textarea
                className={`${styles.editInput} ${styles["editInput--area"]} ${styles.profileEditArea}`}
                value={draft.loreAppearance}
                rows={6}
                onChange={(e) => updateDraft("loreAppearance", e.target.value)}
                placeholder="외형 묘사"
              />
            </div>
            <div>
              <div className={styles.profileHeading}>PERSONALITY · 성격</div>
              <textarea
                className={`${styles.editInput} ${styles["editInput--area"]} ${styles.profileEditArea}`}
                value={draft.lorePersonality}
                rows={6}
                onChange={(e) => updateDraft("lorePersonality", e.target.value)}
                placeholder="성격 묘사"
              />
            </div>
          </div>

          <div className={styles.profileSection}>
            <div className={styles.profileHeading}>BACKGROUND · 배경</div>
            <textarea
              className={`${styles.editInput} ${styles["editInput--area"]} ${styles.profileEditArea}`}
              value={draft.loreBackground}
              rows={8}
              onChange={(e) => updateDraft("loreBackground", e.target.value)}
              placeholder="배경 서사"
            />
          </div>

          <div className={styles.profileSection}>
            <div className={styles.profileHeading}>QUOTE · 한 마디</div>
            <textarea
              className={`${styles.editInput} ${styles["editInput--area"]} ${styles.profileEditArea}`}
              value={draft.loreQuote}
              rows={2}
              onChange={(e) => updateDraft("loreQuote", e.target.value)}
              placeholder="대표 인용구"
            />
          </div>
        </>
      );
    }

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
   * 현 보직 정보 — 사이드의 IDENTITY 와 일부 중복되지만, 본문에 인사기록부 격식으로 한 번 더 명문화.
   */
  const renderCurrentPosting = () => {
    const typeLabel =
      character.type === "AGENT" ? "AGENT · 현장 요원" : "NPC · 외부 인사";
    return (
      <Box>
        <PanelTitle right={<ReqClrBadge required="G" locked={!canIdentity} />}>
          CURRENT POSTING · 현 보직
        </PanelTitle>
        {canIdentity ? (
          <dl className={styles.kv}>
            <KVRow label="구분">
              <span>{typeLabel}</span>
            </KVRow>
            <KVRow label="소속">
              <span>{departmentLabel || "미배정"}</span>
            </KVRow>
            <KVRow label="권한등급">
              <span className={styles.mono}>
                {level} · {AGENT_LEVEL_LABELS[level]}
              </span>
            </KVRow>
            <KVRow label="등록일">
              <span className={styles.mono}>
                {formatDate(character.createdAt)}
              </span>
            </KVRow>
          </dl>
        ) : (
          <LockedSection
            variant="full"
            required="G"
            title="CLASSIFIED · G"
            subtitle={"CURRENT POSTING\n상위 등급 필요"}
          />
        )}
      </Box>
    );
  };

  /**
   * REFERENCES & NOTES — loreTags / appearsInEvents / lore.notes 통합.
   * 항상 표시. 비어 있으면 in-world placeholder 메시지로 자리 잡음.
   */
  const renderReferencesAndNotes = () => {
    if (isEditing) {
      return (
        <Box>
          <PanelTitle right={<ReqClrBadge required="G" locked={false} />}>
            REFERENCES & NOTES · 참조 · 특이사항
          </PanelTitle>
          <dl className={styles.kv}>
            <KVEditRow
              label="등재 태그"
              value={draft.loreLoreTagsRaw}
              onChange={(v) => updateDraft("loreLoreTagsRaw", v)}
              placeholder="태그1, 태그2 (쉼표 구분)"
            />
            <KVEditRow
              label="참조 사건"
              value={draft.loreAppearsInEventsRaw}
              onChange={(v) => updateDraft("loreAppearsInEventsRaw", v)}
              placeholder="2025-Q1-알파, 2026-Q2-베타 (쉼표 구분)"
            />
            <KVEditRow
              label="특이사항"
              value={draft.loreNotes}
              onChange={(v) => updateDraft("loreNotes", v)}
              multiline
              rows={4}
              placeholder="추가 메모 / 보조 설명"
            />
          </dl>
        </Box>
      );
    }

    const hasTags = lore.loreTags && lore.loreTags.length > 0;
    const hasEvents = lore.appearsInEvents && lore.appearsInEvents.length > 0;
    const hasNotes = !isRedactedValue(lore.notes);

    return (
      <Box>
        <PanelTitle right={<ReqClrBadge required="G" locked={!canIdentity} />}>
          REFERENCES & NOTES · 참조 · 특이사항
        </PanelTitle>
        {canIdentity ? (
          <dl className={styles.kv}>
            <KVRow label="등재 태그">
              {hasTags ? (
                <span>{lore.loreTags!.join(" · ")}</span>
              ) : (
                <span className={styles.placeholder}>등재된 태그 없음</span>
              )}
            </KVRow>
            <KVRow label="참조 사건">
              {hasEvents ? (
                <span>{lore.appearsInEvents!.join(" · ")}</span>
              ) : (
                <span className={styles.placeholder}>
                  참조된 사건 기록 없음
                </span>
              )}
            </KVRow>
            <KVRow label="특이사항">
              {hasNotes ? (
                <span className={styles.textBlock}>{lore.notes}</span>
              ) : (
                <span className={styles.placeholder}>
                  기록된 특이사항 없음
                </span>
              )}
            </KVRow>
          </dl>
        ) : (
          <LockedSection
            variant="full"
            required="G"
            title="CLASSIFIED · G"
            subtitle={"REFERENCES & NOTES\n상위 등급 필요"}
          />
        )}
      </Box>
    );
  };

  /**
   * NPC 호환 필드 (nameEn / roleDetail) — NOTES 는 REFERENCES & NOTES 박스로 이관됨.
   * NPC 에서만, 데이터 있을 때만 표시.
   */
  const renderNpcExtras = () => {
    if (character.type !== "NPC") return null;

    if (isEditing) {
      return (
        <Box>
          <PanelTitle right={<ReqClrBadge required="H" locked={false} />}>
            NPC DETAILS
          </PanelTitle>
          <dl className={styles.kv}>
            <KVEditRow
              label="NAME (EN)"
              value={draft.loreNameEn}
              onChange={(v) => updateDraft("loreNameEn", v)}
              placeholder="(선택) Hush Tegger"
              mono
            />
            <KVEditRow
              label="ROLE DETAIL"
              value={draft.loreRoleDetail}
              onChange={(v) => updateDraft("loreRoleDetail", v)}
              multiline
              rows={3}
              placeholder="역할 상세 서술"
            />
          </dl>
        </Box>
      );
    }

    const hasNameEn = !isRedactedValue(lore.nameEn);
    const hasRoleDetail = !isRedactedValue(lore.roleDetail);
    if (!hasNameEn && !hasRoleDetail) return null;

    return (
      <Box>
        <PanelTitle right={<ReqClrBadge required="H" locked={!canProfile} />}>
          NPC DETAILS
        </PanelTitle>
        {canProfile ? (
          <dl className={styles.kv}>
            {hasNameEn ? (
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
            {hasRoleDetail ? (
              <KVRow label="ROLE DETAIL">
                <RedactedBlock
                  content={lore.roleDetail}
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
            subtitle={"NPC DETAILS\n상위 등급 필요"}
          />
        )}
      </Box>
    );
  };

  const renderDossierTab = () => (
    <>
      {/* 현 보직 — 본문 최상단 격식 헤더. 편집 모드에서는 사이드 IDENTITY 와 중복이라 숨김. */}
      {!isEditing && renderCurrentPosting()}

      {/* CHARACTER PROFILE */}
      <Box>
        <PanelTitle right={<ReqClrBadge required="H" locked={!canProfile} />}>
          CHARACTER PROFILE · 인적 사항
        </PanelTitle>
        {renderCharacterProfile()}
      </Box>

      {/* REFERENCES & NOTES — 항상 표시, 빈 placeholder 로 자리 잡음. */}
      {renderReferencesAndNotes()}

      {/* NPC 전용 추가 정보 — 데이터 있을 때만 (편집 모드에서는 NPC 라면 항상 표시). */}
      {renderNpcExtras()}
    </>
  );

  /* in-world placeholder — 인사기록부에 데이터가 비어 있을 때 자연스럽게 자리 잡는 메시지. */
  const renderRelationsTab = () => (
    <Box>
      <PanelTitle>INTERPERSONAL · 관계도</PanelTitle>
      <div className={styles.tabEmpty}>
        등록된 인적 관계 없음
        <span className={styles.tabEmpty__hint}>
          추가 정보 수집 시 자동 갱신
        </span>
      </div>
    </Box>
  );

  const renderSessionsTab = () => (
    <Box>
      <PanelTitle>FIELD ACTIVITY · 현장 출현 이력</PanelTitle>
      <div className={styles.tabEmpty}>
        현장 활동 기록 없음
        <span className={styles.tabEmpty__hint}>
          작전 출현 시 자동 등록됩니다
        </span>
      </div>
    </Box>
  );

  const renderAuditTab = () => {
    if (!canMeta) {
      return (
        <Box>
          <PanelTitle right={<ReqClrBadge required="V" locked />}>
            AUDIT TRAIL · 감사 로그
          </PanelTitle>
          <LockedSection
            variant="full"
            required="V"
            title="CLASSIFIED · V"
            subtitle={
              "AUDIT TRAIL\nVoidwalker (V) 등급 이상 열람"
            }
          />
        </Box>
      );
    }
    return (
      <Box>
        <PanelTitle right={<ReqClrBadge required="V" locked={false} />}>
          AUDIT TRAIL · 감사 로그
        </PanelTitle>
        <div className={styles.tabEmpty}>
          조회 이력 없음
          <span className={styles.tabEmpty__hint}>
            권한자 열람 시점부터 자동 기록됩니다 · AUD-{auditId}
          </span>
        </div>
      </Box>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "dossier":
        return renderDossierTab();
      case "relations":
        return renderRelationsTab();
      case "sessions":
        return renderSessionsTab();
      case "audit":
        return renderAuditTab();
    }
  };

  /* ── 렌더 ── */

  return (
    <>
      <PageHead
        breadcrumb={<OrgDrillCrumbs items={drillItems} />}
        title={pageTitle}
        right={headRight}
      />

      {/* Read-only / 편집 모드 notice */}
      {isEditing ? (
        <div
          className={`${styles.readOnlyNotice} ${styles["readOnlyNotice--edit"]}`}
        >
          <span className={styles.readOnlyNotice__label}>EDIT MODE</span>
          <span className={styles.readOnlyNotice__body}>
            편집 중 — 저장 시 즉시 반영됩니다. 잠긴 섹션도 GM 권한으로 모두 편집
            가능.
          </span>
          {editError ? (
            <span className={styles.readOnlyNotice__error}>
              ⚠ {editError}
            </span>
          ) : null}
        </div>
      ) : (
        <div className={styles.readOnlyNotice}>
          <span className={styles.readOnlyNotice__label}>READ-ONLY</span>
          <span className={styles.readOnlyNotice__body}>
            이 Dossier 는 서버에서 마스킹된 후 전달됩니다. 일부 섹션은{" "}
            <strong>M · Memorian</strong> 이상 필요.
          </span>
          {clearance === "GM" && character.bulkUpdatedAt ? (
            <span
              className={styles.readOnlyNotice__audit}
              title="GM 운영진 전용 — Claude/스크립트로 통짜 데이터를 덮어쓴 시점. 사용자 폼 편집은 반영되지 않음."
            >
              SYNC · {formatDate(character.bulkUpdatedAt)}
            </span>
          ) : null}
          <span className={styles.readOnlyNotice__audit}>
            AUDIT #AUD-{auditId} · {auditTimestamp}
          </span>
        </div>
      )}

      <div className={styles.layout}>
        {/* ── SIDE ── */}
        <div className={styles.side}>
          {/* Portrait — dossier 좌측 메인 이미지: lore.mainImage 우선, 폴백으로 previewImage(pixel-profile). */}
          <Box variant="gold" className={styles.portraitBox}>
            {character.lore.mainImage || character.previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={character.lore.mainImage || character.previewImage}
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
                  대상 권한등급 : {level} - {AGENT_LEVEL_LABELS[level]}
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
            {isEditing ? (
              <dl className={styles.kv}>
                <KVEditRow
                  label="CODE"
                  value={draft.codename}
                  onChange={(v) => updateDraft("codename", v)}
                  placeholder="INDEXER"
                  mono
                />
                <KVEditRow
                  label="실명"
                  value={draft.loreName}
                  onChange={(v) => updateDraft("loreName", v)}
                />
                <KVEditRow
                  label="원어 표기"
                  value={draft.loreNameNative}
                  onChange={(v) => updateDraft("loreNameNative", v)}
                  placeholder="(선택)"
                />
                <KVEditRow
                  label="별칭"
                  value={draft.loreNickname}
                  onChange={(v) => updateDraft("loreNickname", v)}
                  placeholder="(선택)"
                />
                <KVEditRow
                  label="성별"
                  value={draft.loreGender}
                  onChange={(v) => updateDraft("loreGender", v)}
                />
                <KVEditRow
                  label="나이"
                  value={draft.loreAge}
                  onChange={(v) => updateDraft("loreAge", v)}
                />
                <KVEditRow
                  label="신장"
                  value={draft.loreHeight}
                  onChange={(v) => updateDraft("loreHeight", v)}
                  mono
                />
                <KVEditRow
                  label="체중"
                  value={draft.loreWeight}
                  onChange={(v) => updateDraft("loreWeight", v)}
                  mono
                />
                <KVEditRow
                  label="소속"
                  value={draft.department}
                  onChange={(v) => updateDraft("department", v)}
                  placeholder="department code"
                  mono
                />
                <KVEditSelectRow
                  label="권한등급"
                  value={draft.agentLevel}
                  onChange={(v) => updateDraft("agentLevel", v as AgentLevel)}
                  options={AGENT_LEVELS.map((l) => ({
                    value: l,
                    label: `${l} · ${AGENT_LEVEL_LABELS[l]}`,
                  }))}
                />
                <KVEditSelectRow
                  label="구분"
                  value={draft.tier}
                  onChange={(v) => updateDraft("tier", v as CharacterTier)}
                  options={CHARACTER_TIERS.map((t) => ({
                    value: t,
                    label: t,
                  }))}
                />
                <KVEditRow
                  label="대표 이미지"
                  value={draft.loreMainImage}
                  onChange={(v) => updateDraft("loreMainImage", v)}
                  placeholder="https://..."
                  mono
                />
              </dl>
            ) : canIdentity ? (
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

          {/* SERVICE RECORD — in-world 활동 통계. AUDIT(시스템 메타)과 분리. */}
          <Box>
            <PanelTitle
              right={<ReqClrBadge required="G" locked={!canIdentity} />}
            >
              SERVICE RECORD
            </PanelTitle>
            {canIdentity ? (
              <dl className={styles.kv}>
                <KVRow label="현장 출현">
                  <span className={styles.mono}>0회</span>
                </KVRow>
                <KVRow label="인적 관계">
                  <span className={styles.mono}>0건</span>
                </KVRow>
                <KVRow label="최종 출현">
                  <span className={styles.placeholder}>
                    출현 기록 없음
                  </span>
                </KVRow>
              </dl>
            ) : (
              <LockedSection
                variant="full"
                required="G"
                title="CLASSIFIED · G"
                subtitle={"SERVICE RECORD\n상위 등급 필요"}
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
