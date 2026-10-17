"use client";

import type {
  RouletteParticipant,
  RouletteWinnerMode,
} from "@/lib/roulette/engine";

import { MemberAvatar } from "./MemberAvatar";

import styles from "./RouletteResultPanel.module.css";

interface RouletteResultPanelProps {
  winnerMode: RouletteWinnerMode;
  winners: readonly RouletteParticipant[];
  seed: number | null;
  participantCount: number;
  ballsPerParticipant: number;
  busy: boolean;
  actionError: string | null;
  onCopyImage: () => void;
  onSaveImage: () => void;
  onRestart: () => void;
  onEditMembers: () => void;
}

export function formatRouletteSeed(seed: number): string {
  return seed.toString(16).padStart(8, "0").toUpperCase();
}

export function RouletteResultPanel({
  winnerMode,
  winners,
  seed,
  participantCount,
  ballsPerParticipant,
  busy,
  actionError,
  onCopyImage,
  onSaveImage,
  onRestart,
  onEditMembers,
}: RouletteResultPanelProps) {
  return (
    <section
      className={styles.panel}
      aria-labelledby="roulette-result-title"
    >
      <header className={styles.header}>
        <h2 id="roulette-result-title">
          {winnerMode === "first" ? "선착" : "후착"} 당첨{" "}
          <strong>{winners.length}명</strong>
        </h2>
        <p className={styles.meta}>
          {participantCount}명 × {ballsPerParticipant}개
          {seed !== null ? ` · 추첨 ID ${formatRouletteSeed(seed)}` : ""}
        </p>
      </header>

      <ol className={styles.list}>
        {winners.map((winner, index) => (
          <li key={winner.id} className={styles.item}>
            <span className={styles.rank}>{index + 1}</span>
            <MemberAvatar
              className={styles.avatar}
              avatarUrl={winner.avatarUrl}
              discordUserId={winner.id}
              name={winner.name}
              size={40}
              meaningful
            />
            <strong className={styles.name}>{winner.name}</strong>
          </li>
        ))}
      </ol>

      <div className={styles.actions}>
        <button
          className={styles.primary}
          type="button"
          onClick={onRestart}
          disabled={busy}
        >
          같은 설정으로 다시
        </button>
        <button type="button" onClick={onEditMembers} disabled={busy}>
          명단 수정
        </button>
        <button type="button" onClick={onCopyImage} disabled={busy}>
          결과 이미지 복사
        </button>
        <button type="button" onClick={onSaveImage} disabled={busy}>
          이미지 저장
        </button>
      </div>

      {actionError ? (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
