"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { useTrpgMembers } from "@/hooks/queries/useTrpgMembers";
import {
  getRouletteCourse,
  ROULETTE_DEFAULT_COURSE_ID,
  ROULETTE_MAX_BALLS_PER_PARTICIPANT,
  ROULETTE_MAX_PARTICIPANTS,
  ROULETTE_MAX_TOTAL_BALLS,
  ROULETTE_MAX_WINNERS,
  ROULETTE_MIN_BALLS_PER_PARTICIPANT,
  ROULETTE_MIN_PARTICIPANTS,
  type RouletteCourseId,
  type RouletteParticipant,
  type RouletteWinnerMode,
} from "@/lib/roulette/engine";
import {
  canvasToPngBlob,
  createRouletteResultCanvas,
} from "@/lib/roulette/result-image";

import { MemberAvatar } from "./MemberAvatar";
import { MemberPickerDrawer } from "./MemberPickerDrawer";
import {
  formatRouletteSeed,
  RouletteResultPanel,
} from "./RouletteResultPanel";
import { RouletteSetupBar } from "./RouletteSetupBar";
import { RouletteStage, type RouletteStageHandle } from "./RouletteStage";
import { useRouletteRace } from "./useRouletteRace";

import styles from "./styles.module.css";

const ERROR_MESSAGE_TIMEOUT_MS = 4_000;

interface RouletteClientProps {
  currentUserDiscordId: string;
  currentUserName: string;
  initialMembers: TrpgMemberView[];
}

export function RouletteClient({
  currentUserDiscordId,
  currentUserName,
  initialMembers,
}: RouletteClientProps) {
  const stageRef = useRef<RouletteStageHandle>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);

  const { showToast } = useToast();
  const membersQuery = useTrpgMembers({ initialData: initialMembers });
  const members = membersQuery.data ?? initialMembers;

  const renderStage = useCallback(() => stageRef.current?.render(), []);
  const race = useRouletteRace({ onFrame: renderStage });
  const { phase, reset: resetRace, start: startRace } = race;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [courseId, setCourseId] = useState<RouletteCourseId>(
    ROULETTE_DEFAULT_COURSE_ID,
  );
  const [winnerMode, setWinnerMode] = useState<RouletteWinnerMode>("first");
  const [winnerCount, setWinnerCount] = useState(1);
  const [ballsPerParticipant, setBallsPerParticipant] = useState(1);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const course = getRouletteCourse(courseId);
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.discordUserId, member])),
    [members],
  );
  const validSelectedIds = useMemo(
    () => selectedIds.filter((id) => memberById.has(id)),
    [memberById, selectedIds],
  );
  const selectedParticipants = useMemo(
    () =>
      validSelectedIds.flatMap((id): RouletteParticipant[] => {
        const member = memberById.get(id);
        return member
          ? [
              {
                id: member.discordUserId,
                name: member.displayName,
                avatarUrl: member.avatarUrl,
              },
            ]
          : [];
      }),
    [memberById, validSelectedIds],
  );
  const maxSelectableParticipants = Math.min(
    ROULETTE_MAX_PARTICIPANTS,
    Math.floor(ROULETTE_MAX_TOTAL_BALLS / ballsPerParticipant),
  );
  const effectiveWinnerCount = Math.min(
    winnerCount,
    Math.max(1, selectedParticipants.length),
    ROULETTE_MAX_WINNERS,
  );
  const winnerCountOptions = useMemo(
    () =>
      Array.from(
        {
          length: Math.min(
            ROULETTE_MAX_WINNERS,
            Math.max(1, selectedParticipants.length),
          ),
        },
        (_, index) => index + 1,
      ),
    [selectedParticipants.length],
  );
  const totalBalls = selectedParticipants.length * ballsPerParticipant;
  const maxBallsForSelection = Math.min(
    ROULETTE_MAX_BALLS_PER_PARTICIPANT,
    selectedParticipants.length > 0
      ? Math.floor(ROULETTE_MAX_TOTAL_BALLS / selectedParticipants.length)
      : ROULETTE_MAX_BALLS_PER_PARTICIPANT,
  );
  const previewMarbles = useMemo(
    () =>
      selectedParticipants.flatMap((participant) =>
        Array.from({ length: ballsPerParticipant }, () => participant),
      ),
    [ballsPerParticipant, selectedParticipants],
  );
  const finishedParticipantIdSet = useMemo(
    () => new Set(race.finishedParticipantIds),
    [race.finishedParticipantIds],
  );

  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(
      () => setErrorMessage(null),
      ERROR_MESSAGE_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [errorMessage]);

  useEffect(() => {
    const behavior: ScrollBehavior = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "auto"
      : "smooth";

    if (phase === "running") {
      arenaRef.current?.scrollIntoView({ block: "nearest", behavior });
    } else if (phase === "finished") {
      sideRef.current?.scrollIntoView({ block: "nearest", behavior });
    }
  }, [phase]);

  function prepareForConfigurationChange() {
    if (phase !== "ready") resetRace();
    setErrorMessage(null);
    setActionError(null);
  }

  function handleParticipantToggle(discordUserId: string) {
    if (phase === "running") return;
    prepareForConfigurationChange();

    if (validSelectedIds.includes(discordUserId)) {
      setSelectedIds(validSelectedIds.filter((id) => id !== discordUserId));
      return;
    }
    if (validSelectedIds.length >= maxSelectableParticipants) {
      setErrorMessage(
        `현재 마블 수에서는 최대 ${maxSelectableParticipants}명까지 선택할 수 있습니다.`,
      );
      return;
    }
    setSelectedIds([...validSelectedIds, discordUserId]);
  }

  function handleSelectAll() {
    if (phase === "running") return;
    prepareForConfigurationChange();
    setSelectedIds(
      members
        .slice(0, maxSelectableParticipants)
        .map((member) => member.discordUserId),
    );
  }

  function handleClearSelection() {
    if (phase === "running") return;
    prepareForConfigurationChange();
    setSelectedIds([]);
  }

  function handleCourseChange(nextCourseId: RouletteCourseId) {
    if (phase === "running" || nextCourseId === courseId) return;
    prepareForConfigurationChange();
    setCourseId(nextCourseId);
  }

  function handleWinnerModeChange(nextWinnerMode: RouletteWinnerMode) {
    if (phase === "running" || nextWinnerMode === winnerMode) return;
    prepareForConfigurationChange();
    setWinnerMode(nextWinnerMode);
  }

  function handleWinnerCountChange(nextWinnerCount: number) {
    if (phase === "running" || nextWinnerCount === winnerCount) return;
    prepareForConfigurationChange();
    setWinnerCount(nextWinnerCount);
  }

  function handleBallsPerParticipantChange(nextBallCount: number) {
    if (phase === "running" || nextBallCount === ballsPerParticipant) return;
    if (
      nextBallCount < ROULETTE_MIN_BALLS_PER_PARTICIPANT ||
      nextBallCount > ROULETTE_MAX_BALLS_PER_PARTICIPANT
    ) {
      return;
    }
    if (selectedParticipants.length * nextBallCount > ROULETTE_MAX_TOTAL_BALLS) {
      setErrorMessage(
        `전체 마블은 최대 ${ROULETTE_MAX_TOTAL_BALLS}개까지 사용할 수 있습니다.`,
      );
      return;
    }
    prepareForConfigurationChange();
    setBallsPerParticipant(nextBallCount);
  }

  function handleStart() {
    if (selectedParticipants.length < ROULETTE_MIN_PARTICIPANTS) {
      setErrorMessage(
        `길드원 ${ROULETTE_MIN_PARTICIPANTS}명 이상을 선택해 주세요.`,
      );
      return;
    }

    setErrorMessage(null);
    setActionError(null);
    try {
      startRace({
        participants: selectedParticipants,
        courseId,
        winnerMode,
        winnerCount: effectiveWinnerCount,
        ballsPerParticipant,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "추첨을 시작하지 못했습니다.",
      );
    }
  }

  function handleEditMembers() {
    resetRace();
    setActionError(null);
    setMemberPickerOpen(true);
  }

  function buildResultCanvas(): HTMLCanvasElement | null {
    const stage = stageRef.current;
    const currentRace = race.raceRef.current;
    if (!stage || !currentRace || race.winners.length === 0) return null;

    const sourceCanvas = stage.getCanvas();
    if (!sourceCanvas) return null;

    return createRouletteResultCanvas({
      sourceCanvas,
      course,
      race: currentRace,
      winners: race.winners,
      avatarImages: stage.getAvatarImages(),
    });
  }

  async function handleCopyImage() {
    if (imageBusy) return;
    setActionError(null);

    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setActionError(
        "이 브라우저는 이미지 복사를 지원하지 않습니다. 이미지 저장을 이용해 주세요.",
      );
      return;
    }

    let resultCanvas: HTMLCanvasElement | null;
    try {
      resultCanvas = buildResultCanvas();
    } catch {
      setActionError("결과 이미지를 만들지 못했습니다.");
      return;
    }
    if (!resultCanvas) return;

    setImageBusy(true);
    try {
      // Safari 는 사용자 제스처 안에서 ClipboardItem 을 만들어야 하므로 Blob 은 Promise 로 넘긴다.
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": canvasToPngBlob(resultCanvas) }),
      ]);
      showToast("결과 이미지를 클립보드에 복사했습니다.");
    } catch {
      setActionError("클립보드 복사에 실패했습니다. 이미지 저장을 이용해 주세요.");
    } finally {
      setImageBusy(false);
    }
  }

  function handleSaveImage() {
    if (imageBusy) return;
    setActionError(null);

    try {
      const resultCanvas = buildResultCanvas();
      if (!resultCanvas) return;

      const seedLabel =
        race.seed !== null ? formatRouletteSeed(race.seed) : "result";
      const anchor = document.createElement("a");
      anchor.href = resultCanvas.toDataURL("image/png");
      anchor.download = `dache-roulette-${seedLabel}.png`;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      showToast("결과 이미지를 저장했습니다.");
    } catch {
      setActionError("이미지 저장에 실패했습니다.");
    }
  }

  const resultLabel = winnerMode === "first" ? "선착 당첨" : "후착 당첨";
  const winnerNames = race.winners.map((winner) => winner.name).join(", ");
  const liveStatus =
    race.winners.length > 0
      ? `${resultLabel}: ${winnerNames}`
      : phase === "running"
        ? winnerMode === "last"
          ? `총 ${totalBalls}개 마블의 완주를 기다리는 중입니다.`
          : `${effectiveWinnerCount}명의 선착 당첨자를 가리는 중입니다.`
        : selectedParticipants.length >= ROULETTE_MIN_PARTICIPANTS
          ? "명단과 추첨 설정을 확인한 뒤 출발하세요."
          : `길드원을 ${ROULETTE_MIN_PARTICIPANTS}명 이상 선택하면 출발할 수 있습니다.`;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <Link className={styles.back} href="/calendar">
            ← 캘린더
          </Link>
          <h1>다채 룰렛</h1>
        </div>
        <div className={styles.account}>
          <span title="현재 로그인 사용자">{currentUserName}</span>
          <ThemeToggle />
        </div>
      </header>

      <RouletteSetupBar
        phase={phase}
        course={course}
        participants={selectedParticipants}
        winnerMode={winnerMode}
        winnerCount={effectiveWinnerCount}
        winnerCountOptions={winnerCountOptions}
        ballsPerParticipant={ballsPerParticipant}
        minBallsPerParticipant={ROULETTE_MIN_BALLS_PER_PARTICIPANT}
        maxBallsPerParticipant={maxBallsForSelection}
        totalBalls={totalBalls}
        elapsedSeconds={race.elapsedSeconds}
        errorMessage={memberPickerOpen ? null : errorMessage}
        onOpenMembers={() => {
          setActionError(null);
          setMemberPickerOpen(true);
        }}
        onCourseChange={handleCourseChange}
        onWinnerModeChange={handleWinnerModeChange}
        onWinnerCountChange={handleWinnerCountChange}
        onBallsPerParticipantChange={handleBallsPerParticipantChange}
        onStart={handleStart}
        onStop={resetRace}
        onEditSettings={resetRace}
      />

      <div ref={arenaRef} className={styles.arena}>
        <RouletteStage
          ref={stageRef}
          course={course}
          raceRef={race.raceRef}
          previewParticipants={previewMarbles}
          layoutKey={phase}
        />

        <div ref={sideRef} className={styles.side}>
          <div className={styles.side_inner}>
            <p
              className={phase === "finished" ? styles.sr_only : styles.status}
              aria-live="polite"
            >
              {liveStatus}
            </p>

            {phase === "finished" ? (
              <RouletteResultPanel
                winnerMode={winnerMode}
                winners={race.winners}
                seed={race.seed}
                participantCount={selectedParticipants.length}
                ballsPerParticipant={ballsPerParticipant}
                busy={imageBusy}
                actionError={actionError}
                onCopyImage={handleCopyImage}
                onSaveImage={handleSaveImage}
                onRestart={handleStart}
                onEditMembers={handleEditMembers}
              />
            ) : (
              <section
                className={styles.roster}
                aria-labelledby="roulette-roster-title"
              >
                <div className={styles.roster_header}>
                  <h2 id="roulette-roster-title">
                    참가자 <strong>{selectedParticipants.length}명</strong>
                  </h2>
                  {phase === "running" ? (
                    <span className={styles.roster_progress}>
                      완주 {race.finishedParticipantIds.length}/
                      {selectedParticipants.length}
                    </span>
                  ) : null}
                </div>

                {selectedParticipants.length > 0 ? (
                  <ol className={styles.roster_list}>
                    {selectedParticipants.map((participant, index) => {
                      const finished = finishedParticipantIdSet.has(
                        participant.id,
                      );
                      return (
                        <li
                          key={participant.id}
                          className={`${styles.roster_item} ${finished ? styles.roster_item_finished : ""}`}
                        >
                          <span className={styles.roster_index}>
                            {index + 1}
                          </span>
                          <MemberAvatar
                            avatarUrl={participant.avatarUrl}
                            discordUserId={participant.id}
                            name={participant.name}
                            size={28}
                          />
                          <span className={styles.roster_name}>
                            {participant.name}
                          </span>
                          {finished ? (
                            <span className={styles.roster_check}>완주</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className={styles.roster_empty}>
                    명단 편집에서 길드원을 선택하세요.
                  </p>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <p>
          LazyGyu의{" "}
          <a
            href="https://github.com/lazygyu/roulette"
            target="_blank"
            rel="noreferrer"
          >
            Marble Roulette
          </a>
          를 참고해 독립 구현했습니다.
        </p>
        <nav aria-label="법적 고지">
          <Link href="/privacy">개인정보 처리방침</Link>
          <a
            href="/assets/licenses/marble-roulette.txt"
            target="_blank"
            rel="noreferrer"
          >
            MIT 라이선스
          </a>
        </nav>
      </footer>

      <MemberPickerDrawer
        open={memberPickerOpen}
        members={members}
        selectedIds={validSelectedIds}
        maxSelectable={maxSelectableParticipants}
        currentUserDiscordId={currentUserDiscordId}
        refreshFailed={membersQuery.isError}
        errorMessage={errorMessage}
        onToggle={handleParticipantToggle}
        onSelectAll={handleSelectAll}
        onClear={handleClearSelection}
        onClose={() => setMemberPickerOpen(false)}
      />
    </main>
  );
}
