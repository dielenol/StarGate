"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  useDisconnectGoogleCalendar,
  useUpdateSelectedGoogleCalendars,
} from "@/hooks/mutations/useGoogleCalendarMutations";
import { useGoogleCalendarOptions } from "@/hooks/queries/useGoogleCalendar";
import { GoogleCalendarClientError } from "@/lib/google-calendar/client";
import {
  MAX_SELECTED_GOOGLE_CALENDARS,
  type GoogleCalendarConnectionView,
} from "@/lib/google-calendar/types";

import styles from "./styles.module.css";

interface Props {
  connection: GoogleCalendarConnectionView;
  onClose: () => void;
}

export function GoogleCalendarSettingsModal({
  connection,
  onClose,
}: Props) {
  const optionsQuery = useGoogleCalendarOptions(
    connection.connected && !connection.reconnectRequired,
  );
  const updateMutation = useUpdateSelectedGoogleCalendars();
  const disconnectMutation = useDisconnectGoogleCalendar();
  const [draftSelection, setDraftSelection] = useState<string[] | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
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

  const selectedIds = useMemo(
    () =>
      draftSelection ??
      (optionsQuery.data ?? [])
        .filter((calendar) => calendar.selected)
        .map((calendar) => calendar.id),
    [draftSelection, optionsQuery.data],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function handleToggle(calendarId: string) {
    setDraftSelection((currentDraft) => {
      const current = new Set(
        currentDraft ??
          (optionsQuery.data ?? [])
            .filter((calendar) => calendar.selected)
            .map((calendar) => calendar.id),
      );
      if (current.has(calendarId)) current.delete(calendarId);
      else if (current.size < MAX_SELECTED_GOOGLE_CALENDARS) {
        current.add(calendarId);
      }
      return Array.from(current);
    });
  }

  function handleSave() {
    updateMutation.mutate(selectedIds, { onSuccess: onClose });
  }

  function handleDisconnect() {
    if (!window.confirm("Google Calendar 연결을 해제하시겠습니까?")) return;
    disconnectMutation.mutate(undefined, { onSuccess: onClose });
  }

  const queryNeedsReconnect =
    optionsQuery.error instanceof GoogleCalendarClientError &&
    optionsQuery.error.code === "GOOGLE_RECONNECT_REQUIRED";
  const needsReconnect = connection.reconnectRequired || queryNeedsReconnect;
  const mutationError = updateMutation.error ?? disconnectMutation.error;

  return (
    <div
      className={styles.modal__backdrop}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`${styles.modal} ${styles.googleSettings}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-calendar-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.modal__header}>
          <div>
            <p className={styles.googleSettings__eyebrow}>개인 일정 오버레이</p>
            <h2
              className={styles.modal__title}
              id="google-calendar-settings-title"
            >
              Google Calendar
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            className={styles.modal__close}
            type="button"
            onClick={onClose}
            aria-label="Google Calendar 설정 닫기"
          >
            ×
          </button>
        </header>

        <div className={styles.googleSettings__body}>
          {mutationError ? (
            <p className={styles.modal__error} role="alert">
              {mutationError instanceof Error
                ? mutationError.message
                : "Google Calendar 설정을 변경하지 못했습니다."}
            </p>
          ) : null}

          {!connection.connected || needsReconnect ? (
            <div className={styles.googleSettings__connectPanel}>
              <span className={styles.googleSettings__mark} aria-hidden="true">
                G
              </span>
              <p>
                {needsReconnect
                  ? "Google 권한이 만료되었습니다. 개인 일정을 다시 보려면 재연결해주세요."
                  : "내 Google 캘린더를 연결하면 선택한 일정의 제목과 시간만 이 화면에 표시됩니다."}
              </p>
              <div className={styles.googleSettings__connectActions}>
                <a
                  className={styles.googleSettings__connect}
                  href="/api/integrations/google-calendar/connect"
                >
                  {needsReconnect
                    ? "Google Calendar 재연결"
                    : "Google Calendar 연결"}
                </a>
                {connection.connected ? (
                  <button
                    className={styles.googleSettings__disconnect}
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending
                      ? "삭제 중..."
                      : "연결 정보 삭제"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : optionsQuery.isPending ? (
            <p className={styles.googleSettings__status} role="status">
              Google 캘린더 목록을 불러오는 중입니다...
            </p>
          ) : optionsQuery.isError ? (
            <div className={styles.googleSettings__status} role="alert">
              <p>
                {optionsQuery.error instanceof Error
                  ? optionsQuery.error.message
                  : "Google 캘린더 목록을 불러오지 못했습니다."}
              </p>
              <div className={styles.googleSettings__statusActions}>
                <button type="button" onClick={() => optionsQuery.refetch()}>
                  다시 시도
                </button>
                <button
                  className={styles.googleSettings__disconnect}
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? "해제 중..." : "연결 해제"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.googleSettings__selectionHeader}>
                <div>
                  <strong>표시할 캘린더</strong>
                  <p>선택하지 않으면 연결은 유지되고 오버레이만 꺼집니다.</p>
                </div>
                <span>
                  {selectedIds.length}/{MAX_SELECTED_GOOGLE_CALENDARS}
                </span>
              </div>

              <ul className={styles.googleSettings__calendarList}>
                {(optionsQuery.data ?? []).map((calendar) => {
                  const checked = selectedIdSet.has(calendar.id);
                  const selectionFull =
                    !checked &&
                    selectedIds.length >= MAX_SELECTED_GOOGLE_CALENDARS;
                  return (
                    <li key={calendar.id}>
                      <label className={styles.googleSettings__calendar}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={selectionFull}
                          onChange={() => handleToggle(calendar.id)}
                        />
                        <span
                          className={styles.googleSettings__calendarColor}
                          style={{ backgroundColor: calendar.color }}
                          aria-hidden="true"
                        />
                        <span className={styles.googleSettings__calendarName}>
                          {calendar.name}
                        </span>
                        {calendar.primary ? (
                          <span className={styles.googleSettings__primaryBadge}>
                            기본
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.googleSettings__actions}>
                <button
                  className={styles.googleSettings__disconnect}
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? "해제 중..." : "연결 해제"}
                </button>
                <button
                  className={styles["modal__btn-secondary"]}
                  type="button"
                  onClick={onClose}
                  disabled={updateMutation.isPending}
                >
                  취소
                </button>
                <button
                  className={styles["modal__btn-primary"]}
                  type="button"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? "저장 중..." : "저장"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
