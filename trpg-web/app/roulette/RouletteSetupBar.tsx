"use client";

import {
  ROULETTE_COURSES,
  ROULETTE_MIN_PARTICIPANTS,
  type RouletteCourse,
  type RouletteCourseId,
  type RouletteParticipant,
  type RouletteWinnerMode,
} from "@/lib/roulette/engine";

import { MemberAvatar } from "./MemberAvatar";
import type { RacePhase } from "./useRouletteRace";

import styles from "./RouletteSetupBar.module.css";

const AVATAR_STACK_LIMIT = 4;

interface RouletteSetupBarProps {
  phase: RacePhase;
  course: RouletteCourse;
  participants: readonly RouletteParticipant[];
  winnerMode: RouletteWinnerMode;
  winnerCount: number;
  winnerCountOptions: readonly number[];
  ballsPerParticipant: number;
  minBallsPerParticipant: number;
  maxBallsPerParticipant: number;
  totalBalls: number;
  elapsedSeconds: number;
  errorMessage: string | null;
  onOpenMembers: () => void;
  onCourseChange: (courseId: RouletteCourseId) => void;
  onWinnerModeChange: (winnerMode: RouletteWinnerMode) => void;
  onWinnerCountChange: (winnerCount: number) => void;
  onBallsPerParticipantChange: (ballsPerParticipant: number) => void;
  onStart: () => void;
  onStop: () => void;
  onEditSettings: () => void;
}

export function RouletteSetupBar({
  phase,
  course,
  participants,
  winnerMode,
  winnerCount,
  winnerCountOptions,
  ballsPerParticipant,
  minBallsPerParticipant,
  maxBallsPerParticipant,
  totalBalls,
  elapsedSeconds,
  errorMessage,
  onOpenMembers,
  onCourseChange,
  onWinnerModeChange,
  onWinnerCountChange,
  onBallsPerParticipantChange,
  onStart,
  onStop,
  onEditSettings,
}: RouletteSetupBarProps) {
  if (phase !== "ready") {
    const running = phase === "running";
    return (
      <section
        className={`${styles.bar} ${styles.bar_compact}`}
        aria-label="경주 진행"
      >
        <p className={styles.compact_summary}>
          <strong>{course.name}</strong>
          <span aria-hidden="true">·</span>
          <span
            className={`${styles.compact_time} ${running ? styles.compact_time_running : ""}`}
          >
            {running ? "경과" : "완주"} {elapsedSeconds.toFixed(1)}초
          </span>
        </p>
        {running ? (
          <button
            className={`${styles.compact_action} ${styles.compact_action_stop}`}
            type="button"
            onClick={onStop}
          >
            중단
          </button>
        ) : (
          <button
            className={styles.compact_action}
            type="button"
            onClick={onEditSettings}
          >
            설정 변경
          </button>
        )}
      </section>
    );
  }

  const canStart = participants.length >= ROULETTE_MIN_PARTICIPANTS;
  const stackedParticipants = participants.slice(0, AVATAR_STACK_LIMIT);

  return (
    <div className={styles.wrap}>
      <section className={styles.bar} aria-label="추첨 준비">
        <button
          className={`${styles.members} ${participants.length === 0 ? styles.members_empty : ""}`}
          type="button"
          onClick={onOpenMembers}
          aria-haspopup="dialog"
        >
          {stackedParticipants.length > 0 ? (
            <span className={styles.members_stack} aria-hidden="true">
              {stackedParticipants.map((participant) => (
                <MemberAvatar
                  key={participant.id}
                  className={styles.members_avatar}
                  avatarUrl={participant.avatarUrl}
                  discordUserId={participant.id}
                  name={participant.name}
                  size={24}
                />
              ))}
            </span>
          ) : (
            <span className={styles.members_plus} aria-hidden="true">
              +
            </span>
          )}
          <span className={styles.members_label}>
            <strong>{participants.length}명</strong>
            <span>명단 편집</span>
          </span>
        </button>

        <div className={styles.courses} role="group" aria-label="코스">
          {ROULETTE_COURSES.map((item) => {
            const selected = item.id === course.id;
            return (
              <button
                key={item.id}
                className={`${styles.course} ${selected ? styles.course_selected : ""}`}
                type="button"
                onClick={() => onCourseChange(item.id)}
                aria-pressed={selected}
              >
                <strong>{item.name}</strong>
                <small>{item.duration}</small>
              </button>
            );
          })}
        </div>

        <div className={styles.modes} role="group" aria-label="당첨 순서">
          <button
            className={`${styles.mode} ${winnerMode === "first" ? styles.mode_selected : ""}`}
            type="button"
            onClick={() => onWinnerModeChange("first")}
            aria-pressed={winnerMode === "first"}
          >
            선착
          </button>
          <button
            className={`${styles.mode} ${winnerMode === "last" ? styles.mode_selected : ""}`}
            type="button"
            onClick={() => onWinnerModeChange("last")}
            aria-pressed={winnerMode === "last"}
          >
            후착
          </button>
        </div>

        <label className={styles.field}>
          <span>당첨</span>
          <select
            className={styles.select}
            value={winnerCount}
            onChange={(event) => onWinnerCountChange(Number(event.target.value))}
          >
            {winnerCountOptions.map((count) => (
              <option key={count} value={count}>
                {count}명
              </option>
            ))}
          </select>
        </label>

        <div className={styles.field}>
          <span id="roulette-balls-label">1인당</span>
          <div
            className={styles.stepper}
            role="group"
            aria-labelledby="roulette-balls-label"
          >
            <button
              type="button"
              aria-label="1인당 마블 수 줄이기"
              onClick={() => onBallsPerParticipantChange(ballsPerParticipant - 1)}
              disabled={ballsPerParticipant <= minBallsPerParticipant}
            >
              −
            </button>
            <output aria-live="polite">{ballsPerParticipant}개</output>
            <button
              type="button"
              aria-label="1인당 마블 수 늘리기"
              onClick={() => onBallsPerParticipantChange(ballsPerParticipant + 1)}
              disabled={ballsPerParticipant >= maxBallsPerParticipant}
            >
              +
            </button>
          </div>
        </div>

        <button
          className={styles.start}
          type="button"
          onClick={onStart}
          disabled={!canStart}
          title={
            canStart
              ? undefined
              : `길드원을 ${ROULETTE_MIN_PARTICIPANTS}명 이상 선택하면 출발할 수 있습니다.`
          }
        >
          {totalBalls}개 마블 출발
        </button>
      </section>

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
