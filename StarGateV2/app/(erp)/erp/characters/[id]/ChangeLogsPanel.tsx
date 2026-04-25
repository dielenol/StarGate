"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type {
  CharacterChangeLogRow,
  CharacterChangeLogsResponse,
} from "@/hooks/queries/useCharacterChangeLogs";
import {
  characterChangeLogsKeys,
  useCharacterChangeLogs,
} from "@/hooks/queries/useCharacterChangeLogs";
import { characterKeys } from "@/hooks/queries/useCharactersQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./ChangeLogsPanel.module.css";

const PAGE_LIMIT = 20;

/**
 * 패널 권한 모드. CharacterDetailClient 가 결정해 prop 으로 내려준다.
 *
 * - 'gm'    : 모든 캐릭터 이력 + revert 버튼 노출 (서버 기반 권한 GM 한정)
 * - 'owner' : 본인 캐릭터 이력 readonly (revert 버튼 미노출)
 * - 'none'  : 패널 자체를 렌더하지 않음 (호출자가 패널 자체를 분기하지만, 안전망으로 가드)
 */
export type ChangeLogsPanelMode = "gm" | "owner" | "none";

interface Props {
  characterId: string;
  mode: ChangeLogsPanelMode;
}

/**
 * dot path 필드 키 → 한국어 라벨 매핑.
 * DiffPreviewModal 의 FIELD_LABELS 와 동일 셋. drift 가 발생해도 매핑 누락은 dot path
 * 그대로 노출 (기능 영향 X — 라벨만 저하).
 */
const FIELD_LABELS: Record<string, string> = {
  codename: "CODENAME",
  role: "ROLE",
  isPublic: "공개 여부",
  ownerId: "소유자 ID",
  previewImage: "프리뷰 이미지 URL",
  "sheet.name": "이름",
  "sheet.mainImage": "메인 이미지 URL",
  "sheet.posterImage": "포스터 이미지 URL",
  "sheet.quote": "인용문",
  "sheet.gender": "성별",
  "sheet.age": "나이",
  "sheet.height": "신장",
  "sheet.appearance": "외모",
  "sheet.personality": "성격",
  "sheet.background": "배경",
  "sheet.weight": "체중",
  "sheet.className": "직군",
  "sheet.hp": "HP",
  "sheet.san": "SAN",
  "sheet.def": "DEF",
  "sheet.atk": "ATK",
  "sheet.abilityType": "능력 타입",
  "sheet.credit": "크레딧",
  "sheet.weaponTraining": "무기 훈련",
  "sheet.skillTraining": "기술 훈련",
  "sheet.equipment": "장비",
  "sheet.abilities": "어빌리티",
  "sheet.nameEn": "이름(EN)",
  "sheet.roleDetail": "역할 상세",
  "sheet.notes": "비고",
};

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "(비어 있음)";
  if (typeof value === "string") return value || "(빈 문자열)";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 1024 ? `${json.slice(0, 1024)}…` : json;
  } catch {
    return String(value);
  }
}

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatKst(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return KST_FORMATTER.format(date);
}

export default function ChangeLogsPanel({ characterId, mode }: Props) {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);

  const enabled = mode !== "none";
  const skip = page * PAGE_LIMIT;
  const { data, isLoading, isError, error } = useCharacterChangeLogs(
    characterId,
    enabled,
    { limit: PAGE_LIMIT, skip },
  );

  // 조기 반환: 권한 없음 케이스. 호출자가 분기하지만 이중 안전망.
  if (mode === "none") return null;

  async function handleRevert(log: CharacterChangeLogRow) {
    if (!log.revertable) return;

    const summary = `${log.changes.length}개 필드 변경`;
    const ts = formatKst(log.createdAt);
    const confirmed = window.confirm(
      `이 변경(${ts}, ${summary})을 되돌리시겠습니까?\n` +
        `- 캐릭터가 변경 직전 값으로 복원됩니다.\n` +
        `- 되돌리기 자체도 변경 이력에 새 항목으로 기록됩니다.`,
    );
    if (!confirmed) return;

    setRevertingId(log._id);
    setRevertError(null);

    try {
      const res = await fetch(
        `/api/erp/characters/${characterId}/change-logs/${log._id}/revert`,
        { method: "POST" },
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setRevertError(body?.error ?? "되돌리기에 실패했습니다.");
        return;
      }

      // 이력 + 캐릭터 캐시 둘 다 invalidate.
      // - 이력은 revert 자체가 새 row 로 추가됨 + 원본 row 의 revertedAt 표시
      // - 캐릭터는 시트 값이 복원됨
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: characterChangeLogsKeys.all,
        }),
        queryClient.invalidateQueries({ queryKey: characterKeys.all }),
      ]);
    } catch {
      setRevertError("네트워크 오류가 발생했습니다.");
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <Box>
      <PanelTitle right={<span className={styles.headerHint}>AUDIT</span>}>
        변경 이력
      </PanelTitle>

      {revertError ? (
        <div className={styles.errorBox} role="alert">
          {revertError}
        </div>
      ) : null}

      {isLoading ? (
        <div className={styles.empty}>로딩 중...</div>
      ) : isError ? (
        <div className={styles.empty}>
          {error instanceof Error ? error.message : "이력을 불러올 수 없습니다."}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className={styles.empty}>기록된 변경 이력이 없습니다.</div>
      ) : (
        <ul className={styles.list}>
          {data.items.map((log) => (
            <LogRow
              key={log._id}
              log={log}
              expanded={expandedId === log._id}
              onToggle={() =>
                setExpandedId((cur) => (cur === log._id ? null : log._id))
              }
              onRevert={() => handleRevert(log)}
              isReverting={revertingId === log._id}
              showRevertButton={mode === "gm"}
            />
          ))}
        </ul>
      )}

      {data ? (
        <div className={styles.pager}>
          <Button
            type="button"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            이전
          </Button>
          <span className={styles.pagerLabel}>
            페이지 {page + 1}
            {data.hasMore ? "" : " (마지막)"}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!data.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      ) : null}
    </Box>
  );
}

/* ── Row ── */

interface RowProps {
  log: CharacterChangeLogRow;
  expanded: boolean;
  onToggle: () => void;
  onRevert: () => void;
  isReverting: boolean;
  showRevertButton: boolean;
}

function LogRow({
  log,
  expanded,
  onToggle,
  onRevert,
  isReverting,
  showRevertButton,
}: RowProps) {
  const actorLabel = log.actorDisplayName ?? log.actorUsername ?? log.actorId;
  const isReverted = Boolean(log.revertedAt);

  return (
    <li
      className={[
        styles.row,
        isReverted ? styles["row--reverted"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.row__head}>
        <div className={styles.row__meta}>
          <span className={styles.row__time}>{formatKst(log.createdAt)}</span>
          <span className={styles.row__actor}>{actorLabel}</span>
          <Tag tone={log.actorRole === "GM" ? "rank-gm" : "default"}>
            {log.actorRole}
          </Tag>
          <Tag tone={log.source === "admin" ? "gold" : "info"}>
            {log.source === "admin" ? "ADMIN" : "PLAYER"}
          </Tag>
          {log.actorIsOwner ? <Tag tone="default">OWNER</Tag> : null}
          {isReverted ? <Tag tone="danger">REVERTED</Tag> : null}
        </div>
        <div className={styles.row__actions}>
          <span className={styles.row__count}>
            {log.changes.length}개 필드 변경
          </span>
          <Button
            type="button"
            size="sm"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? "접기" : "펼치기"}
          </Button>
          {showRevertButton ? (
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={onRevert}
              disabled={!log.revertable || isReverting}
            >
              {isReverting ? "되돌리는 중..." : "되돌리기"}
            </Button>
          ) : null}
        </div>
      </div>

      {log.reason ? (
        <div className={styles.row__reason}>
          <span className={styles.row__reasonLabel}>사유</span>
          <span className={styles.row__reasonText}>{log.reason}</span>
        </div>
      ) : null}

      {isReverted ? (
        <div className={styles.row__revertedNote}>
          되돌림 ·{" "}
          {log.revertedByDisplayName ?? log.revertedBy ?? "(unknown)"} ·{" "}
          {log.revertedAt ? formatKst(log.revertedAt) : ""}
        </div>
      ) : null}

      {expanded ? (
        <ul className={styles.diffList}>
          {log.changes.map((change, idx) => (
            <li key={`${change.field}-${idx}`} className={styles.diff}>
              <div className={styles.diff__head}>
                <span className={styles.diff__label}>
                  {labelFor(change.field)}
                </span>
                <span className={styles.diff__field} aria-hidden="true">
                  {change.field}
                </span>
              </div>
              <div className={styles.diff__body}>
                <pre className={styles["diff__cell--before"]}>
                  {stringifyValue(change.before)}
                </pre>
                <span className={styles.diff__arrow} aria-hidden="true">
                  →
                </span>
                <pre className={styles["diff__cell--after"]}>
                  {stringifyValue(change.after)}
                </pre>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// 응답 타입 재export — 호출자가 import 단순화하도록.
export type { CharacterChangeLogsResponse };
