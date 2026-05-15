"use client";

import { useMemo, useState } from "react";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import type { TrpgSessionView } from "@/lib/trpg/serializer";

import { useCreateTrpgSession } from "@/hooks/mutations/useCreateTrpgSession";

import styles from "./styles.module.css";

interface Props {
  defaultDate: string;
  minDate: string;
  members: TrpgMemberView[];
  existingSessions: TrpgSessionView[];
  currentUserDiscordId: string;
  onClose: () => void;
}

export function SessionCreateModal({
  defaultDate,
  minDate,
  members,
  existingSessions,
  currentUserDiscordId,
  onClose,
}: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("20:00");
  const [memberSearch, setMemberSearch] = useState("");
  const [participants, setParticipants] = useState<Set<string>>(
    () => new Set(),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createMutation = useCreateTrpgSession();

  const masterMember = useMemo(
    () =>
      members.find((member) => member.discordUserId === currentUserDiscordId),
    [currentUserDiscordId, members],
  );
  const selectableMembers = useMemo(
    () =>
      members.filter((member) => member.discordUserId !== currentUserDiscordId),
    [currentUserDiscordId, members],
  );
  const selectedMembers = useMemo(
    () =>
      selectableMembers.filter((member) =>
        participants.has(member.discordUserId),
      ),
    [participants, selectableMembers],
  );
  const visibleMembers = useMemo(() => {
    const keyword = memberSearch.trim().toLowerCase();
    if (keyword.length === 0) return selectableMembers;
    return selectableMembers.filter((member) =>
      `${member.displayName} ${member.discordUsername ?? ""}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [memberSearch, selectableMembers]);

  const scheduledSessionMap = useMemo(() => {
    const map = new Map<string, TrpgSessionView>();
    for (const s of existingSessions) {
      if (s.date !== date) continue;
      for (const pid of s.participantDiscordIds) {
        if (!map.has(pid)) map.set(pid, s);
      }
    }
    return map;
  }, [existingSessions, date]);
  const masterScheduledSession = scheduledSessionMap.get(currentUserDiscordId);

  function toggleParticipant(id: string) {
    if (id === currentUserDiscordId) return;
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    if (title.trim().length === 0) {
      setErrorMessage("제목을 입력하세요.");
      return;
    }
    if (date < minDate) {
      setErrorMessage("오늘 이전 날짜에는 세션을 생성할 수 없습니다.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        date,
        startTime,
        participantDiscordIds: Array.from(
          new Set([currentUserDiscordId, ...participants]),
        ),
      });
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("세션 생성 실패");
      }
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
        aria-labelledby="session-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.modal__header}>
          <h2 className={styles.modal__title} id="session-create-title">
            새 세션 만들기
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

        <form className={styles.modal__form} onSubmit={handleSubmit}>
          <label className={styles.modal__label}>
            제목
            <input
              className={styles.modal__input}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="세션 제목 (최대 100자)"
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
                {masterMember?.displayName ?? "나"}
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
            <div
              className={styles.modal__selectedMembers}
              aria-live="polite"
              aria-label="선택된 참여자"
            >
              <div className={styles["modal__selectedMembers-head"]}>
                <span>선택된 참여자</span>
                <strong>{selectedMembers.length}명</strong>
              </div>
              {selectedMembers.length > 0 ? (
                <ul className={styles["modal__selectedMembers-list"]}>
                  {selectedMembers.map((member) => {
                    const scheduledSession = scheduledSessionMap.get(
                      member.discordUserId,
                    );
                    return (
                      <li key={member.discordUserId}>
                        <button
                          className={`${styles["modal__selectedMember-chip"]} ${
                            scheduledSession
                              ? styles[
                                  "modal__selectedMember-chip--has-session"
                                ]
                              : ""
                          }`}
                          type="button"
                          onClick={() =>
                            toggleParticipant(member.discordUserId)
                          }
                          aria-label={`${member.displayName} 선택 해제`}
                          title={
                            scheduledSession
                              ? `${scheduledSession.startTime} ${scheduledSession.title}`
                              : undefined
                          }
                        >
                          <span>{member.displayName}</span>
                          {scheduledSession ? (
                            <span
                              className={
                                styles["modal__selectedMember-warning"]
                              }
                            >
                              세션 있음
                            </span>
                          ) : null}
                          <span aria-hidden="true">×</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles["modal__selectedMembers-empty"]}>
                  아직 선택된 참여자가 없습니다.
                </p>
              )}
            </div>
            <label className={styles["modal__member-search"]}>
              참여자 검색
              <input
                className={styles.modal__input}
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="닉네임 또는 Discord username"
              />
            </label>
            <ul className={styles["modal__member-list"]}>
              {visibleMembers.map((m) => {
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
              {selectableMembers.length > 0 && visibleMembers.length === 0 ? (
                <li className={styles["modal__member-empty"]}>
                  검색 결과가 없습니다.
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
              onClick={onClose}
              disabled={createMutation.isPending}
            >
              취소
            </button>
            <button
              className={styles["modal__btn-primary"]}
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "생성 중..." : "세션 만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}
