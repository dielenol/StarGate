"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";

import { MemberAvatar } from "./MemberAvatar";

import styles from "./MemberPickerDrawer.module.css";

interface MemberPickerDrawerProps {
  open: boolean;
  members: readonly TrpgMemberView[];
  selectedIds: readonly string[];
  maxSelectable: number;
  currentUserDiscordId: string;
  refreshFailed: boolean;
  errorMessage: string | null;
  onToggle: (discordUserId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onClose: () => void;
}

type MemberPickerDialogProps = Omit<MemberPickerDrawerProps, "open">;

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** 닫히면 언마운트되므로 검색어·포커스 상태가 열 때마다 초기화된다. */
export function MemberPickerDrawer({ open, ...props }: MemberPickerDrawerProps) {
  if (!open) return null;
  return <MemberPickerDialog {...props} />;
}

function MemberPickerDialog({
  members,
  selectedIds,
  maxSelectable,
  currentUserDiscordId,
  refreshFailed,
  errorMessage,
  onToggle,
  onSelectAll,
  onClear,
  onClose,
}: MemberPickerDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("ko-KR");
  const visibleMembers = useMemo(() => {
    if (!normalizedSearchQuery) return members;

    return members.filter((member) =>
      `${member.displayName} ${member.discordUsername}`
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedSearchQuery),
    );
  }, [members, normalizedSearchQuery]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="roulette-member-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2 id="roulette-member-picker-title">명단 편집</h2>
            <p>
              <strong>{selectedIds.length}</strong>/{maxSelectable}명 선택
            </p>
          </div>
          <button
            className={styles.close}
            type="button"
            onClick={onClose}
            aria-label="명단 편집 닫기"
          >
            ×
          </button>
        </header>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <span className={styles.sr_only}>길드원 검색</span>
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="닉네임 또는 Discord 아이디"
            />
          </label>
          <div className={styles.bulk}>
            <button
              type="button"
              onClick={onSelectAll}
              disabled={members.length === 0}
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={selectedIds.length === 0}
            >
              선택 해제
            </button>
          </div>
        </div>

        <div className={styles.grid_wrap}>
          <div className={styles.grid} role="group" aria-label="활성 길드원">
            {visibleMembers.map((member) => {
              const selected = selectedIdSet.has(member.discordUserId);
              const order = selectedIds.indexOf(member.discordUserId) + 1;
              return (
                <button
                  key={member.discordUserId}
                  className={`${styles.tile} ${selected ? styles.tile_selected : ""}`}
                  type="button"
                  onClick={() => onToggle(member.discordUserId)}
                  aria-pressed={selected}
                >
                  <MemberAvatar
                    className={styles.tile_avatar}
                    avatarUrl={member.avatarUrl}
                    discordUserId={member.discordUserId}
                    name={member.displayName}
                    size={48}
                  />
                  <strong className={styles.tile_name}>
                    {member.displayName}
                    {member.discordUserId === currentUserDiscordId ? (
                      <em>나</em>
                    ) : null}
                  </strong>
                  <small className={styles.tile_username}>
                    @{member.discordUsername}
                  </small>
                  {selected ? (
                    <span className={styles.tile_order} aria-hidden="true">
                      {order}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {visibleMembers.length === 0 ? (
            <p className={styles.empty}>
              {members.length === 0
                ? "동기화된 활성 길드원이 없습니다."
                : "검색 결과가 없습니다."}
            </p>
          ) : null}
        </div>

        <footer className={styles.footer}>
          {errorMessage ? (
            <p className={`${styles.note} ${styles.note_error}`} role="alert">
              {errorMessage}
            </p>
          ) : refreshFailed ? (
            <p className={styles.note} role="status">
              길드원 목록을 새로 불러오지 못했습니다. 초기 목록으로 표시합니다.
            </p>
          ) : (
            <p className={styles.note}>
              최대 {maxSelectable}명까지 선택할 수 있습니다.
            </p>
          )}
          <button className={styles.done} type="button" onClick={onClose}>
            완료
          </button>
        </footer>
      </div>
    </div>
  );
}
