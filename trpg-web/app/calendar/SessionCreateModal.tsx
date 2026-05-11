"use client";

import { useMemo, useState } from "react";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import type { TrpgSessionView } from "@/lib/trpg/serializer";

import {
  TrpgSessionConflictError,
  useCreateTrpgSession,
} from "@/hooks/mutations/useCreateTrpgSession";

import styles from "./styles.module.css";

interface Props {
  defaultDate: string;
  members: TrpgMemberView[];
  existingSessions: TrpgSessionView[];
  currentUserDiscordId: string;
  onClose: () => void;
}

export function SessionCreateModal({
  defaultDate,
  members,
  existingSessions,
  currentUserDiscordId,
  onClose,
}: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("20:00");
  const [participants, setParticipants] = useState<Set<string>>(
    () => new Set([currentUserDiscordId]),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictedIds, setConflictedIds] = useState<string[]>([]);

  const createMutation = useCreateTrpgSession();

  // 선택 date 에 이미 참여 중인 사용자 ID 맵 (자기 자신은 제외 — 같은 사용자가 같은 날 두 개에 들어가는 것은 막아도 됨).
  const busyMap = useMemo(() => {
    const map = new Map<string, string>(); // discordUserId -> session title
    for (const s of existingSessions) {
      if (s.date !== date) continue;
      for (const pid of s.participantDiscordIds) {
        if (!map.has(pid)) map.set(pid, s.title);
      }
    }
    return map;
  }, [existingSessions, date]);

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setConflictedIds([]);

    if (title.trim().length === 0) {
      setErrorMessage("제목을 입력하세요.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        date,
        startTime,
        participantDiscordIds: Array.from(participants),
      });
      onClose();
    } catch (err) {
      if (err instanceof TrpgSessionConflictError) {
        setConflictedIds(err.conflictedParticipants);
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
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
              {members.length === 0 ? (
                <li className={styles["modal__member-empty"]}>
                  활성 길드 멤버가 없습니다.
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
