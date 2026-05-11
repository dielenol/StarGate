"use client";

import { useMemo, useState } from "react";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import type { TrpgSessionView } from "@/lib/trpg/serializer";

import { useCancelTrpgSession } from "@/hooks/mutations/useCancelTrpgSession";
import { TrpgSessionConflictError } from "@/hooks/mutations/useCreateTrpgSession";
import { useUpdateTrpgSession } from "@/hooks/mutations/useUpdateTrpgSession";

import styles from "./styles.module.css";

interface Props {
  session: TrpgSessionView;
  members: TrpgMemberView[];
  existingSessions: TrpgSessionView[];
  currentUserDiscordId: string;
  onClose: () => void;
}

export function SessionDetailModal({
  session,
  members,
  existingSessions,
  currentUserDiscordId,
  onClose,
}: Props) {
  const isOwner = session.createdByDiscordId === currentUserDiscordId;
  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState(session.title);
  const [date, setDate] = useState(session.date);
  const [startTime, setStartTime] = useState(session.startTime);
  const [participants, setParticipants] = useState<Set<string>>(
    () => new Set(session.participantDiscordIds),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictedIds, setConflictedIds] = useState<string[]>([]);

  const updateMutation = useUpdateTrpgSession();
  const cancelMutation = useCancelTrpgSession();

  // 선택 date 에 이미 참여 중인 사용자 ID 맵 — 본 세션은 제외.
  const busyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of existingSessions) {
      if (s.date !== date) continue;
      if (s.id === session.id) continue;
      for (const pid of s.participantDiscordIds) {
        if (!map.has(pid)) map.set(pid, s.title);
      }
    }
    return map;
  }, [existingSessions, date, session.id]);

  const membersById = useMemo(() => {
    const map = new Map<string, TrpgMemberView>();
    for (const m of members) map.set(m.discordUserId, m);
    return map;
  }, [members]);

  function toggleParticipant(id: string) {
    // disabled 체크박스를 외부 도구(키보드 단축키 등)로 우회해 add 가 발생하는
    // 시나리오 방어 — 이미 다른 세션에 잡힌 사용자는 add 차단.
    if (busyMap.has(id) && !participants.has(id)) return;
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setConflictedIds([]);

    if (title.trim().length === 0) {
      setErrorMessage("제목을 입력하세요.");
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

    const newParticipants = Array.from(participants);
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
      if (err instanceof TrpgSessionConflictError) {
        setConflictedIds(err.conflictedParticipants);
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
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
                <dt className={styles.modal__dt}>생성자</dt>
                <dd className={styles.modal__dd}>
                  {session.createdByUsername}
                </dd>
              </div>
              <div className={styles.modal__row}>
                <dt className={styles.modal__dt}>참여자</dt>
                <dd className={styles.modal__dd}>
                  {session.participantDiscordIds.length === 0
                    ? "없음"
                    : session.participantDiscordIds
                        .map(
                          (pid) =>
                            membersById.get(pid)?.displayName ?? `(${pid})`,
                        )
                        .join(", ")}
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
              <ul className={styles["modal__member-list"]}>
                {members.map((m) => {
                  const busyOther =
                    busyMap.has(m.discordUserId) &&
                    !participants.has(m.discordUserId);
                  const conflicted = conflictedIds.includes(m.discordUserId);
                  const checked = participants.has(m.discordUserId);
                  return (
                    <li
                      key={m.discordUserId}
                      className={`${styles.modal__member} ${
                        busyOther ? styles["modal__member--busy"] : ""
                      } ${conflicted ? styles["modal__member--conflict"] : ""}`}
                    >
                      <label className={styles["modal__member-label"]}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busyOther}
                          onChange={() => toggleParticipant(m.discordUserId)}
                        />
                        <span className={styles["modal__member-name"]}>
                          {m.displayName}
                        </span>
                        {busyOther ? (
                          <span className={styles["modal__member-note"]}>
                            다른 세션 참여 중
                          </span>
                        ) : null}
                        {conflicted ? (
                          <span
                            className={`${styles["modal__member-note"]} ${styles["modal__member-note--danger"]}`}
                          >
                            충돌
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
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
                onClick={() => setEditing(false)}
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
