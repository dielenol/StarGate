"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import type {
  CharacterChangeLogRow,
  CharacterChangeLogsResponse,
} from "@/hooks/queries/useCharacterChangeLogs";
import {
  characterChangeLogsKeys,
  useCharacterChangeLogs,
} from "@/hooks/queries/useCharacterChangeLogs";

import { labelForCharacterField } from "./_field-labels";

import styles from "./ChangeLogsPanel.module.css";

const PAGE_LIMIT = 20;

/**
 * 패널 권한 모드. CharacterDetailClient 가 결정해 prop 으로 내려준다.
 *
 * - 'gm'    : 모든 캐릭터 이력 + revert + 삭제 버튼 노출 (서버 기반 권한 GM 한정)
 * - 'none'  : 패널 자체를 렌더하지 않음 (호출자가 패널 자체를 분기하지만, 안전망으로 가드)
 */
export type ChangeLogsPanelMode = "gm" | "none";

interface Props {
  characterId: string;
  mode: ChangeLogsPanelMode;
}

function labelFor(field: string): string {
  return labelForCharacterField(field);
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
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

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.length === 0;
  return false;
}

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatKst(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return KST_FORMATTER.format(date);
}

export default function ChangeLogsPanel({ characterId, mode }: Props) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

      // 이력만 invalidate — revert 자체가 새 row 추가 + 원본 row 의 revertedAt 표시.
      // 캐릭터 상세는 server component(/erp/characters/[id]/page.tsx)라 client query
      // 캐시가 없으므로 router.refresh() 로 서버 재요청.
      await queryClient.invalidateQueries({
        queryKey: characterChangeLogsKeys.all,
      });
      router.refresh();
    } catch {
      setRevertError("네트워크 오류가 발생했습니다.");
    } finally {
      setRevertingId(null);
    }
  }

  async function handleDelete(log: CharacterChangeLogRow) {
    const summary = `${log.changes.length}개 필드 변경`;
    const ts = formatKst(log.createdAt);
    const confirmed = window.confirm(
      `이 변경 이력(${ts}, ${summary})을 영구 삭제하시겠습니까?\n` +
        `- 캐릭터 본문은 변경되지 않습니다 (revert 와 다름).\n` +
        `- 감사 기록 자체가 사라지므로 되돌릴 수 없습니다.`,
    );
    if (!confirmed) return;

    setDeletingId(log._id);
    setDeleteError(null);

    try {
      const res = await fetch(
        `/api/erp/characters/${characterId}/change-logs/${log._id}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setDeleteError(body?.error ?? "삭제에 실패했습니다.");
        return;
      }

      // 이력 목록만 invalidate — 캐릭터 본문 변경 없음.
      await queryClient.invalidateQueries({
        queryKey: characterChangeLogsKeys.all,
      });
    } catch {
      setDeleteError("네트워크 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = data
    ? data.hasMore
      ? page + 2
      : page + 1
    : page + 1;

  return (
    <div className={styles.box}>
      <header className={styles.header}>
        <h3 className={styles.header__title}>변경 이력</h3>
        <span className={styles.headerHint}>AUDIT</span>
      </header>

      {revertError ? (
        <div className={styles.errorBox} role="alert">
          {revertError}
        </div>
      ) : null}

      {deleteError ? (
        <div className={styles.errorBox} role="alert">
          {deleteError}
        </div>
      ) : null}

      {isLoading ? (
        <div className={`${styles.empty} ${styles["empty--loading"]}`}>
          로딩 중...
        </div>
      ) : isError ? (
        <div className={styles.empty}>
          {error instanceof Error
            ? error.message
            : "이력을 불러올 수 없습니다."}
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
              onDelete={() => handleDelete(log)}
              isDeleting={deletingId === log._id}
              showGmActions={mode === "gm"}
            />
          ))}
        </ul>
      )}

      {data && data.items.length > 0 ? (
        <div className={styles.pager}>
          <button
            type="button"
            className={`${styles.pagerBtn} ${styles["pagerBtn--prev"]}`}
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← PREV
          </button>
          <span className={styles.pagerLabel}>
            <b>{page + 1}</b>
            <span className={styles.pagerLabel__sep}>/</span>
            {totalPages}
          </span>
          <button
            type="button"
            className={`${styles.pagerBtn} ${styles["pagerBtn--next"]}`}
            disabled={!data.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            NEXT →
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ── Row ── */

interface RowProps {
  log: CharacterChangeLogRow;
  expanded: boolean;
  onToggle: () => void;
  onRevert: () => void;
  isReverting: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  /** GM 모드일 때만 revert + 삭제 버튼 노출. */
  showGmActions: boolean;
}

function LogRow({
  log,
  expanded,
  onToggle,
  onRevert,
  isReverting,
  onDelete,
  isDeleting,
  showGmActions,
}: RowProps) {
  const actorLabel = log.actorDisplayName ?? log.actorUsername ?? log.actorId;
  const isReverted = Boolean(log.revertedAt);
  const canRevert = showGmActions && log.revertable && !isReverted;
  const canDelete = showGmActions;

  // actor role 라벨 — owner 면 OWNER 접두, 그 외 actorRole
  const actorRoleLabel = log.actorIsOwner
    ? `/ OWNER · ${log.actorRole}`
    : `/ ${log.actorRole}`;

  return (
    <li
      className={[
        styles.row,
        expanded ? styles["row--expanded"] : "",
        isReverted ? styles["row--reverted"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.row__head}>
        <div className={styles.row__meta}>
          <span className={styles.row__time}>
            {formatKst(log.createdAt)}
            <span className={styles.row__time__kst}>KST</span>
          </span>
          <span className={styles.row__actor}>
            {actorLabel}
            <span className={styles.row__actor__role}>{actorRoleLabel}</span>
          </span>
          <span
            className={`${styles.sourceBadge} ${
              log.source === "admin"
                ? styles["sourceBadge--admin"]
                : styles["sourceBadge--player"]
            }`}
          >
            {log.source === "admin" ? "ADMIN" : "PLAYER"}
          </span>
          {isReverted ? (
            <span className={styles.row__revertedBadge}>REVERTED</span>
          ) : null}
        </div>
        <div className={styles.row__actions}>
          <span className={styles.row__count}>
            <b>{log.changes.length}</b>개 필드 변경
          </span>
          <button
            type="button"
            className={styles.expandBtn}
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? "접기" : "펼치기"}
            <span className={styles.expandBtn__caret} aria-hidden>
              ▾
            </span>
          </button>
          {canRevert ? (
            <button
              type="button"
              className={styles.revertBtn}
              onClick={onRevert}
              disabled={isReverting}
              aria-label={`로그 ${log._id} 되돌리기`}
            >
              {isReverting ? "REVERTING…" : "REVERT"}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={onDelete}
              disabled={isDeleting}
              aria-label={`로그 ${log._id} 삭제`}
            >
              {isDeleting ? "DELETING…" : "DELETE"}
            </button>
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
          REVERTED ·{" "}
          <b>
            {log.revertedByDisplayName ?? log.revertedBy ?? "(unknown)"}
          </b>
          {log.revertedAt ? ` · ${formatKst(log.revertedAt)} KST` : ""}
        </div>
      ) : null}

      {expanded ? (
        <ul className={styles.diffList}>
          {log.changes.map((change, idx) => (
            <DiffItem key={`${change.field}-${idx}`} change={change} index={idx + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function DiffItem({
  change,
  index,
}: {
  change: { field: string; before: unknown; after: unknown };
  index: number;
}) {
  const beforeEmpty = isEmptyValue(change.before);
  const afterEmpty = isEmptyValue(change.after);
  const beforeText = beforeEmpty ? "(비어 있음)" : stringifyValue(change.before);
  const afterText = afterEmpty ? "(비어 있음)" : stringifyValue(change.after);
  const indexStr = String(index).padStart(2, "0");

  return (
    <li className={styles.diff}>
      <div className={styles.diff__head}>
        <div>
          <span className={styles.diff__index}>{indexStr}</span>
          <span className={styles.diff__label}>{labelFor(change.field)}</span>
        </div>
        <span className={styles.diff__field} aria-hidden="true">
          {change.field}
        </span>
      </div>
      <div className={styles.diff__body}>
        <pre
          className={[
            styles.diff__cell,
            styles["diff__cell--before"],
            beforeEmpty ? styles["diff__cell--empty"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={styles.diff__cell__tag}>BEFORE</span>
          {beforeText}
        </pre>
        <span className={styles.diff__arrow} aria-hidden="true">
          →
        </span>
        <pre
          className={[
            styles.diff__cell,
            styles["diff__cell--after"],
            afterEmpty ? styles["diff__cell--empty"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={styles.diff__cell__tag}>AFTER</span>
          {afterText}
        </pre>
      </div>
    </li>
  );
}

// 응답 타입 재export — 호출자가 import 단순화하도록.
export type { CharacterChangeLogsResponse };
