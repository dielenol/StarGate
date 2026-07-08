"use client";

import { useMemo, useState } from "react";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import type { TrpgSessionView } from "@/lib/trpg/serializer";

import { useCancelTrpgSession } from "@/hooks/mutations/useCancelTrpgSession";
import { useUpdateTrpgSession } from "@/hooks/mutations/useUpdateTrpgSession";

import styles from "./styles.module.css";

interface Props {
  session: TrpgSessionView;
  members: TrpgMemberView[];
  existingSessions: TrpgSessionView[];
  currentUserDiscordId: string;
  minDate: string;
  onClose: () => void;
}

export function SessionDetailModal({
  session,
  members,
  existingSessions,
  currentUserDiscordId,
  minDate,
  onClose,
}: Props) {
  const isOwner = session.createdByDiscordId === currentUserDiscordId;
  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState(session.title);
  const [date, setDate] = useState(session.date);
  const [startTime, setStartTime] = useState(session.startTime);
  const [participants, setParticipants] = useState<Set<string>>(
    () =>
      new Set(
        session.participantDiscordIds.filter(
          (pid) => pid !== session.createdByDiscordId,
        ),
      ),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateMutation = useUpdateTrpgSession();
  const cancelMutation = useCancelTrpgSession();

  const scheduledSessionMap = useMemo(() => {
    const map = new Map<string, TrpgSessionView>();
    for (const s of existingSessions) {
      if (s.date !== date) continue;
      if (s.id === session.id) continue;
      for (const pid of s.participantDiscordIds) {
        if (!map.has(pid)) map.set(pid, s);
      }
    }
    return map;
  }, [existingSessions, date, session.id]);
  const masterScheduledSession = scheduledSessionMap.get(
    session.createdByDiscordId,
  );

  const membersById = useMemo(() => {
    const map = new Map<string, TrpgMemberView>();
    for (const m of members) map.set(m.discordUserId, m);
    return map;
  }, [members]);
  const selectableMembers = useMemo(
    () =>
      members.filter(
        (member) => member.discordUserId !== session.createdByDiscordId,
      ),
    [members, session.createdByDiscordId],
  );
  const masterName =
    membersById.get(session.createdByDiscordId)?.displayName ??
    session.createdByUsername;
  const displayParticipantIds = session.participantDiscordIds.filter(
    (pid) => pid !== session.createdByDiscordId,
  );

  function toggleParticipant(id: string) {
    if (id === session.createdByDiscordId) return;
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetDraft() {
    setTitle(session.title);
    setDate(session.date);
    setStartTime(session.startTime);
    setParticipants(
      new Set(
        session.participantDiscordIds.filter(
          (pid) => pid !== session.createdByDiscordId,
        ),
      ),
    );
    setErrorMessage(null);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    if (title.trim().length === 0) {
      setErrorMessage("제목을 입력하세요.");
      return;
    }
    if (date < minDate) {
      setErrorMessage("오늘 이전 날짜로는 세션을 수정할 수 없습니다.");
      return;
    }

    // 변경된 필드만 patch 로 전달.
    const patch: {
      title?: string;
      date?: string;
      startTime?: string;
      participantDiscordIds?: string[];
    } = {};
    if (title.trim() !== session.title) patch.title = title.trim();
    if (date !== session.date) patch.date = date;
    if (startTime !== session.startTime) patch.startTime = startTime;

    const newParticipants = Array.from(
      new Set([session.createdByDiscordId, ...participants]),
    );
    const originalSorted = [...session.participantDiscordIds].sort();
    const newSorted = [...newParticipants].sort();
    if (
      originalSorted.length !== newSorted.length ||
      originalSorted.some((id, i) => id !== newSorted[i])
    ) {
      patch.participantDiscordIds = newParticipants;
    }

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }

    try {
      await updateMutation.mutateAsync({ id: session.id, patch });
      setEditing(false);
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("세션 갱신 실패");
      }
    }
  }

  async function handleCancel() {
    if (!confirm("정말 이 세션을 취소하시겠습니까?")) return;
    setErrorMessage(null);
    try {
      await cancelMutation.mutateAsync(session.id);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "세션 취소 실패";
      setErrorMessage(message);
    }
  }

  return (
    <div
      className={styles.modal__backdrop}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.modal__header}>
          <h2 className={styles.modal__title} id="session-detail-title">
            {editing ? "세션 수정" : session.title}
          </h2>
          <button
            className={styles.modal__close}
            type="button"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        {!editing ? (
          <div className={styles.modal__form}>
            <dl className={styles.modal__dl}>
              <div className={styles.modal__row}>
                <dt className={styles.modal__dt}>날짜</dt>
                <dd className={styles.modal__dd}>{session.date}</dd>
              </div>
              <div className={styles.modal__row}>
                <dt className={styles.modal__dt}>시작</dt>
                <dd className={styles.modal__dd}>{session.startTime}</dd>
              </div>
              <div className={styles.modal__row}>
                <dt className={styles.modal__dt}>마스터</dt>
                <dd className={`${styles.modal__dd} ${styles.modal__master}`}>
                  <span>{masterName}</span>
                  {session.createdByDiscordId === currentUserDiscordId ? (
                    <span className={styles.modal__selfBadge}>본인</span>
                  ) : null}
                </dd>
              </div>
              <div className={styles.modal__row}>
                <dt className={styles.modal__dt}>참여자</dt>
                <dd className={styles.modal__dd}>
                  {displayParticipantIds.length === 0 ? (
                    <span className={styles.modal__emptyValue}>없음</span>
                  ) : (
                    <ul className={styles.modal__participants}>
                      {displayParticipantIds.map((pid) => (
                        <li
                          key={pid}
                          className={`${styles.modal__participant} ${
                            pid === currentUserDiscordId
                              ? styles["modal__participant--self"]
                              : ""
                          }`}
                        >
                          <span>
                            {membersById.get(pid)?.displayName ?? `(${pid})`}
                          </span>
                          {pid === currentUserDiscordId ? (
                            <span className={styles.modal__selfBadge}>
                              본인
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>

            {errorMessage ? (
              <p className={styles.modal__error} role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className={styles.modal__actions}>
              {isOwner ? (
                <>
                  <button
                    className={styles["modal__btn-danger"]}
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? "취소 중..." : "세션 취소"}
                  </button>
                  <button
                    className={styles["modal__btn-primary"]}
                    type="button"
                    onClick={() => setEditing(true)}
                  >
                    수정
                  </button>
                </>
              ) : (
                <button
                  className={styles["modal__btn-secondary"]}
                  type="button"
                  onClick={onClose}
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        ) : (
          <form className={styles.modal__form} onSubmit={handleSave}>
            <label className={styles.modal__label}>
              제목
              <input
                className={styles.modal__input}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
              />
            </label>

            <div className={styles["modal__row-2"]}>
              <label className={styles.modal__label}>
                날짜
                <input
                  className={styles.modal__input}
                  type="date"
                  value={date}
                  min={minDate}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <label className={styles.modal__label}>
                시작 시각
                <input
                  className={styles.modal__input}
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </label>
            </div>

            <fieldset className={styles.modal__fieldset}>
              <legend className={styles.modal__legend}>참여자</legend>
              <div className={styles.modal__masterMember}>
                <span className={styles["modal__masterMember-role"]}>
                  마스터
                </span>
                <strong className={styles["modal__masterMember-name"]}>
                  {masterName}
                </strong>
                {masterScheduledSession ? (
                  <span
                    className={styles["modal__masterMember-note"]}
                    title={`${masterScheduledSession.startTime} ${masterScheduledSession.title}`}
                  >
                    {formatMonthDay(date)} 참여 세션 있음
                  </span>
                ) : null}
              </div>
              <ul className={styles["modal__member-list"]}>
                {selectableMembers.map((m) => {
                  const scheduledSession = scheduledSessionMap.get(
                    m.discordUserId,
                  );
                  const checked = participants.has(m.discordUserId);
                  return (
                    <li
                      key={m.discordUserId}
                      className={`${styles.modal__member} ${
                        scheduledSession
                          ? styles["modal__member--has-session"]
                          : ""
                      }`}
                    >
                      <label className={styles["modal__member-label"]}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParticipant(m.discordUserId)}
                        />
                        <span className={styles["modal__member-name"]}>
                          {m.displayName}
                        </span>
                        {scheduledSession ? (
                          <span
                            className={styles["modal__member-note"]}
                            title={`${scheduledSession.startTime} ${scheduledSession.title}`}
                          >
                            {formatMonthDay(date)} 참여 세션 있음
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
                {selectableMembers.length === 0 ? (
                  <li className={styles["modal__member-empty"]}>
                    선택 가능한 참여자가 없습니다.
                  </li>
                ) : null}
              </ul>
            </fieldset>

            {errorMessage ? (
              <p className={styles.modal__error} role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className={styles.modal__actions}>
              <button
                className={styles["modal__btn-secondary"]}
                type="button"
                onClick={() => {
                  resetDraft();
                  setEditing(false);
                }}
                disabled={updateMutation.isPending}
              >
                되돌리기
              </button>
              <button
                className={styles["modal__btn-primary"]}
                type="submit"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}
