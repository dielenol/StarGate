"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import NextImage from "next/image";
import Link from "next/link";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTrpgMembers } from "@/hooks/queries/useTrpgMembers";
import { getDiscordDefaultAvatarUrl } from "@/lib/discord/avatar";
import {
  createRouletteRace,
  getRouletteCourse,
  ROULETTE_BOARD_WIDTH,
  ROULETTE_COURSES,
  ROULETTE_DEFAULT_COURSE_ID,
  ROULETTE_FIXED_STEP_SECONDS,
  ROULETTE_MAX_BALLS_PER_PARTICIPANT,
  ROULETTE_MAX_PARTICIPANTS,
  ROULETTE_MAX_TOTAL_BALLS,
  ROULETTE_MAX_WINNERS,
  ROULETTE_MIN_BALLS_PER_PARTICIPANT,
  ROULETTE_MIN_PARTICIPANTS,
  stepRouletteRace,
  type RouletteCourseId,
  type RouletteParticipant,
  type RouletteRace,
  type RouletteWinnerMode,
} from "@/lib/roulette/engine";
import { drawRouletteScene } from "@/lib/roulette/renderer";
import {
  canvasToPngBlob,
  createRouletteResultCanvas,
} from "@/lib/roulette/result-image";

import styles from "./styles.module.css";

const MAX_FRAME_DELTA_SECONDS = 0.05;
const OVERTIME_SIMULATION_SECONDS = 20;

type RacePhase = "ready" | "running" | "finished";
type CopyState = "idle" | "copying" | "success" | "error";

interface RouletteClientProps {
  currentUserDiscordId: string;
  currentUserName: string;
  initialMembers: TrpgMemberView[];
}

interface MemberAvatarProps {
  avatarUrl: string | null;
  discordUserId: string;
  name: string;
  variant?: "member" | "winner";
  meaningful?: boolean;
}

function getInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

function MemberAvatar({
  avatarUrl,
  discordUserId,
  name,
  variant = "member",
  meaningful = false,
}: MemberAvatarProps) {
  const size = variant === "winner" ? 54 : 38;
  const className = `${styles.roulette__avatar} ${styles[`roulette__avatar_${variant}`]}`;

  if (!avatarUrl) {
    return (
      <span className={className} aria-hidden={!meaningful}>
        {getInitial(name)}
      </span>
    );
  }

  return (
    <span className={className}>
      <NextImage
        className={styles.roulette__avatar_image}
        src={avatarUrl}
        alt={meaningful ? `${name}의 Discord 프로필` : ""}
        width={size}
        height={size}
        sizes={`${size}px`}
        unoptimized
        onError={(event) => {
          const fallbackAvatarUrl = getDiscordDefaultAvatarUrl(discordUserId);
          if (event.currentTarget.src !== fallbackAvatarUrl) {
            event.currentTarget.src = fallbackAvatarUrl;
          }
        }}
      />
    </span>
  );
}

function createBrowserSeed(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Date.now() >>> 0;
}

function getSimulationRate(totalBalls: number, elapsedSeconds: number): number {
  const loadRate = totalBalls > 64 ? 2.5 : totalBalls > 32 ? 1.75 : 1;
  const overtimeRate = elapsedSeconds > OVERTIME_SIMULATION_SECONDS ? 2 : 1;
  return loadRate * overtimeRate;
}

export function RouletteClient({
  currentUserDiscordId,
  currentUserName,
  initialMembers,
}: RouletteClientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raceRef = useRef<RouletteRace | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previewAnimationFrameRef = useRef<number | null>(null);
  const previewParticipantsRef = useRef<RouletteParticipant[]>([]);
  const courseRef = useRef(getRouletteCourse(ROULETTE_DEFAULT_COURSE_ID));
  const avatarImagesRef = useRef(new Map<string, CanvasImageSource>());
  const loadedAvatarUrlsRef = useRef(new Map<string, string>());

  const membersQuery = useTrpgMembers({ initialData: initialMembers });
  const members = membersQuery.data ?? initialMembers;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [courseId, setCourseId] = useState<RouletteCourseId>(
    ROULETTE_DEFAULT_COURSE_ID,
  );
  const [winnerMode, setWinnerMode] = useState<RouletteWinnerMode>("first");
  const [winnerCount, setWinnerCount] = useState(1);
  const [ballsPerParticipant, setBallsPerParticipant] = useState(1);
  const [phase, setPhase] = useState<RacePhase>("ready");
  const [winners, setWinners] = useState<RouletteParticipant[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSeed, setLastSeed] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

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
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("ko-KR");
  const visibleMembers = useMemo(() => {
    if (!normalizedSearchQuery) return members;

    return members.filter((member) =>
      `${member.displayName} ${member.discordUsername}`
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedSearchQuery),
    );
  }, [members, normalizedSearchQuery]);
  const selectedIdSet = useMemo(
    () => new Set(validSelectedIds),
    [validSelectedIds],
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
  const winnerCountOptions = Array.from(
    {
      length: Math.min(
        ROULETTE_MAX_WINNERS,
        Math.max(1, selectedParticipants.length),
      ),
    },
    (_, index) => index + 1,
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

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const activeCourse = courseRef.current;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.round(bounds.width * pixelRatio);
    const targetHeight = Math.round(bounds.height * pixelRatio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(
      targetWidth / ROULETTE_BOARD_WIDTH,
      0,
      0,
      targetHeight / activeCourse.height,
      0,
      0,
    );
    drawRouletteScene(context, {
      race: raceRef.current,
      previewParticipants: previewParticipantsRef.current,
      previewElapsedSeconds: performance.now() / 1_000,
      course: activeCourse,
      avatarImages: avatarImagesRef.current,
    });
  }, []);

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const clearRace = useCallback(() => {
    stopAnimation();
    raceRef.current = null;
    setWinners([]);
    setLastSeed(null);
    setCopyState("idle");
    setPhase("ready");
    renderCanvas();
  }, [renderCanvas, stopAnimation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(renderCanvas);
    observer.observe(canvas);
    renderCanvas();

    return () => observer.disconnect();
  }, [renderCanvas]);

  useEffect(() => {
    previewParticipantsRef.current = previewMarbles;
    if (!raceRef.current) renderCanvas();
  }, [previewMarbles, renderCanvas]);

  useEffect(() => {
    courseRef.current = course;
    if (!raceRef.current) renderCanvas();
  }, [course, renderCanvas]);

  useEffect(() => {
    let cancelled = false;

    for (const participant of selectedParticipants) {
      if (!participant.avatarUrl) continue;
      if (
        loadedAvatarUrlsRef.current.get(participant.id) ===
          participant.avatarUrl &&
        avatarImagesRef.current.has(participant.id)
      ) {
        continue;
      }

      avatarImagesRef.current.delete(participant.id);
      loadedAvatarUrlsRef.current.delete(participant.id);

      const avatar = new window.Image();
      avatar.crossOrigin = "anonymous";
      avatar.decoding = "async";
      avatar.onload = () => {
        if (cancelled) return;
        avatarImagesRef.current.set(participant.id, avatar);
        loadedAvatarUrlsRef.current.set(participant.id, participant.avatarUrl!);
        renderCanvas();
      };
      avatar.onerror = () => {
        const fallbackAvatarUrl = getDiscordDefaultAvatarUrl(participant.id);
        if (avatar.src !== fallbackAvatarUrl) {
          avatar.src = fallbackAvatarUrl;
        }
      };
      avatar.src = participant.avatarUrl;
    }

    return () => {
      cancelled = true;
    };
  }, [renderCanvas, selectedParticipants]);

  useEffect(() => stopAnimation, [stopAnimation]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let lastRenderTime = 0;
    const animatePreview = (currentTime: number) => {
      if (!raceRef.current && currentTime - lastRenderTime >= 1_000 / 30) {
        renderCanvas();
        lastRenderTime = currentTime;
      }
      previewAnimationFrameRef.current = requestAnimationFrame(animatePreview);
    };

    previewAnimationFrameRef.current = requestAnimationFrame(animatePreview);
    return () => {
      if (previewAnimationFrameRef.current !== null) {
        cancelAnimationFrame(previewAnimationFrameRef.current);
        previewAnimationFrameRef.current = null;
      }
    };
  }, [renderCanvas]);

  function prepareForConfigurationChange() {
    if (phase !== "ready") clearRace();
    setErrorMessage(null);
    setCopyState("idle");
  }

  function handleParticipantToggle(discordUserId: string) {
    if (phase === "running") return;
    prepareForConfigurationChange();

    setSelectedIds((current) => {
      const activeCurrent = current.filter((id) => memberById.has(id));
      if (activeCurrent.includes(discordUserId)) {
        return activeCurrent.filter((id) => id !== discordUserId);
      }
      if (activeCurrent.length >= maxSelectableParticipants) {
        setErrorMessage(
          `현재 마블 수에서는 최대 ${maxSelectableParticipants}명까지 선택할 수 있습니다.`,
        );
        return activeCurrent;
      }
      return [...activeCurrent, discordUserId];
    });
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

    stopAnimation();
    const seed = createBrowserSeed();
    const race = createRouletteRace(selectedParticipants, seed, {
      courseId,
      winnerMode,
      winnerCount: effectiveWinnerCount,
      ballsPerParticipant,
    });
    raceRef.current = race;
    setErrorMessage(null);
    setWinners([]);
    setCopyState("idle");
    setLastSeed(seed);
    setPhase("running");

    let previousTime = performance.now();
    let accumulator = 0;

    const animate = (currentTime: number) => {
      const frameDelta = Math.min(
        (currentTime - previousTime) / 1_000,
        MAX_FRAME_DELTA_SECONDS,
      );
      previousTime = currentTime;
      accumulator +=
        frameDelta * getSimulationRate(totalBalls, race.elapsedSeconds);

      while (accumulator >= ROULETTE_FIXED_STEP_SECONDS && !race.done) {
        stepRouletteRace(race, ROULETTE_FIXED_STEP_SECONDS);
        accumulator -= ROULETTE_FIXED_STEP_SECONDS;
      }

      if (race.done) {
        const result = race.winnerParticipantIds.flatMap(
          (participantId): RouletteParticipant[] => {
            const ball = race.balls.find(
              (candidate) => candidate.id === participantId,
            );
            return ball
              ? [
                  {
                    id: ball.id,
                    name: ball.name,
                    avatarUrl: ball.avatarUrl,
                  },
                ]
              : [];
          },
        );
        setWinners(result);
        setPhase("finished");
        animationFrameRef.current = null;
        renderCanvas();
        return;
      }

      renderCanvas();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    renderCanvas();
    animationFrameRef.current = requestAnimationFrame(animate);
  }

  async function handleCopyResult() {
    const sourceCanvas = canvasRef.current;
    const race = raceRef.current;
    if (!sourceCanvas || !race || winners.length === 0) return;

    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setCopyState("error");
      return;
    }

    setCopyState("copying");
    try {
      const resultCanvas = createRouletteResultCanvas({
        sourceCanvas,
        course,
        race,
        winners,
        avatarImages: avatarImagesRef.current,
      });
      const pngBlob = canvasToPngBlob(resultCanvas);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
  }

  const phaseLabel =
    phase === "running"
      ? "낙하 진행 중"
      : phase === "finished"
        ? "선발 완료"
        : "출발 대기";
  const resultLabel = winnerMode === "first" ? "선착 당첨" : "후착 당첨";
  const winnerNames = winners.map((winner) => winner.name).join(", ");

  return (
    <main className={styles.roulette}>
      <header className={styles.roulette__header}>
        <div className={styles.roulette__heading}>
          <Link className={styles.roulette__back} href="/calendar">
            ← 세션 캘린더
          </Link>
          <div>
            <p className={styles.roulette__eyebrow}>DACHE ROULETTE</p>
            <h1>다채 룰렛</h1>
            <p className={styles.roulette__subtitle}>
              길드원을 선택하고 Discord 프로필 마블을 출발시키세요.
            </p>
          </div>
        </div>
        <div className={styles.roulette__account}>
          <span title="현재 로그인 사용자">{currentUserName}</span>
          <ThemeToggle />
        </div>
      </header>

      <section className={styles.roulette__layout}>
        <aside className={styles.roulette__controls}>
          <section className={styles.roulette__control_section}>
            <div className={styles.roulette__control_header}>
              <div>
                <p>코스</p>
                <strong>{course.distance}</strong>
              </div>
              <span className={styles.roulette__badge}>4 TRACKS</span>
            </div>

            <div
              className={styles.roulette__course_grid}
              role="group"
              aria-label="룰렛 코스"
            >
              {ROULETTE_COURSES.map((item) => {
                const selected = item.id === courseId;
                return (
                  <button
                    key={item.id}
                    className={`${styles.roulette__course} ${selected ? styles.roulette__course_selected : ""}`}
                    type="button"
                    onClick={() => handleCourseChange(item.id)}
                    aria-pressed={selected}
                    disabled={phase === "running"}
                  >
                    <span>{item.number}</span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.distance} · {item.duration}
                    </small>
                  </button>
                );
              })}
            </div>
            <p className={styles.roulette__course_description}>
              {course.description}
            </p>
          </section>

          <section className={styles.roulette__control_section}>
            <div className={styles.roulette__control_header}>
              <div>
                <p>추첨 설정</p>
                <strong>{resultLabel}</strong>
              </div>
              <span className={styles.roulette__badge}>{totalBalls} BALLS</span>
            </div>

            <fieldset
              className={styles.roulette__settings}
              disabled={phase === "running"}
            >
              <legend className={styles.roulette__sr_only}>추첨 설정</legend>
              <div className={styles.roulette__setting}>
                <span>당첨 순서</span>
                <div
                  className={styles.roulette__mode_toggle}
                  role="group"
                  aria-label="당첨 순서"
                >
                  <button
                    type="button"
                    className={
                      winnerMode === "first"
                        ? styles.roulette__mode_selected
                        : undefined
                    }
                    onClick={() => handleWinnerModeChange("first")}
                    aria-pressed={winnerMode === "first"}
                  >
                    먼저 도착
                  </button>
                  <button
                    type="button"
                    className={
                      winnerMode === "last"
                        ? styles.roulette__mode_selected
                        : undefined
                    }
                    onClick={() => handleWinnerModeChange("last")}
                    aria-pressed={winnerMode === "last"}
                  >
                    마지막 도착
                  </button>
                </div>
              </div>

              <div className={styles.roulette__settings_grid}>
                <label className={styles.roulette__setting}>
                  <span>당첨 인원</span>
                  <select
                    value={effectiveWinnerCount}
                    onChange={(event) =>
                      handleWinnerCountChange(Number(event.target.value))
                    }
                  >
                    {winnerCountOptions.map((count) => (
                      <option key={count} value={count}>
                        {count}명
                      </option>
                    ))}
                  </select>
                </label>

                <div className={styles.roulette__setting}>
                  <span>1인당 마블 수</span>
                  <div className={styles.roulette__stepper}>
                    <button
                      type="button"
                      aria-label="1인당 마블 수 줄이기"
                      onClick={() =>
                        handleBallsPerParticipantChange(
                          ballsPerParticipant - 1,
                        )
                      }
                      disabled={
                        phase === "running" ||
                        ballsPerParticipant <=
                          ROULETTE_MIN_BALLS_PER_PARTICIPANT
                      }
                    >
                      −
                    </button>
                    <output aria-live="polite">
                      <strong>{ballsPerParticipant}</strong>
                      <small>개</small>
                    </output>
                    <button
                      type="button"
                      aria-label="1인당 마블 수 늘리기"
                      onClick={() =>
                        handleBallsPerParticipantChange(
                          ballsPerParticipant + 1,
                        )
                      }
                      disabled={
                        phase === "running" ||
                        ballsPerParticipant >= maxBallsForSelection
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <p className={styles.roulette__setting_note}>
                −/+ 버튼으로 1인당 최대 {ROULETTE_MAX_BALLS_PER_PARTICIPANT}
                개까지 늘릴 수 있습니다. 전체 마블은 최대 {ROULETTE_MAX_TOTAL_BALLS}
                개입니다.
              </p>
            </fieldset>
          </section>

          <section className={styles.roulette__control_section}>
            <div className={styles.roulette__control_header}>
              <div>
                <p>참가자</p>
                <strong>
                  {selectedParticipants.length}/{maxSelectableParticipants}
                </strong>
              </div>
              <span
                className={`${styles.roulette__phase} ${styles[`roulette__phase_${phase}`]}`}
              >
                {phaseLabel}
              </span>
            </div>

            <label className={styles.roulette__search}>
              <span className={styles.roulette__sr_only}>길드원 검색</span>
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="닉네임 또는 Discord 아이디 검색"
                disabled={phase === "running"}
              />
            </label>

            <div className={styles.roulette__selection_actions}>
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={phase === "running" || members.length === 0}
              >
                최대 {maxSelectableParticipants}명 선택
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={phase === "running" || validSelectedIds.length === 0}
              >
                선택 해제
              </button>
            </div>

            <div
              className={styles.roulette__member_list}
              role="group"
              aria-label="활성 길드원"
            >
              {visibleMembers.map((member) => {
                const selected = selectedIdSet.has(member.discordUserId);
                const order = validSelectedIds.indexOf(member.discordUserId) + 1;
                return (
                  <button
                    key={member.discordUserId}
                    className={`${styles.roulette__member} ${selected ? styles.roulette__member_selected : ""}`}
                    type="button"
                    onClick={() => handleParticipantToggle(member.discordUserId)}
                    aria-pressed={selected}
                    disabled={phase === "running"}
                  >
                    <MemberAvatar
                      avatarUrl={member.avatarUrl}
                      discordUserId={member.discordUserId}
                      name={member.displayName}
                    />
                    <span className={styles.roulette__member_identity}>
                      <strong>
                        {member.displayName}
                        {member.discordUserId === currentUserDiscordId ? (
                          <em>나</em>
                        ) : null}
                      </strong>
                      <small>@{member.discordUsername}</small>
                    </span>
                    <span
                      className={styles.roulette__member_order}
                      aria-hidden="true"
                    >
                      {selected ? order.toString().padStart(2, "0") : "+"}
                    </span>
                  </button>
                );
              })}

              {visibleMembers.length === 0 ? (
                <p className={styles.roulette__empty}>
                  {members.length === 0
                    ? "동기화된 활성 길드원이 없습니다."
                    : "검색 결과가 없습니다."}
                </p>
              ) : null}
            </div>

            {membersQuery.isError ? (
              <p className={styles.roulette__error} role="alert">
                길드원 목록을 새로 불러오지 못했습니다. 초기 목록으로 표시합니다.
              </p>
            ) : null}
          </section>

          <section className={styles.roulette__dispatch}>
            {errorMessage ? (
              <p className={styles.roulette__error} role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className={styles.roulette__actions}>
              <button
                className={styles.roulette__secondary}
                type="button"
                onClick={handleClearSelection}
                disabled={phase === "running" || validSelectedIds.length === 0}
              >
                초기화
              </button>

              {phase === "ready" ? (
                <button
                  className={styles.roulette__primary}
                  type="button"
                  onClick={handleStart}
                  disabled={
                    selectedParticipants.length < ROULETTE_MIN_PARTICIPANTS
                  }
                >
                  {totalBalls}개 마블 출발
                </button>
              ) : (
                <button
                  className={styles.roulette__primary}
                  type="button"
                  onClick={clearRace}
                >
                  {phase === "running" ? "추첨 중단" : "다시 추첨"}
                </button>
              )}
            </div>

            <dl className={styles.roulette__facts}>
              <div>
                <dt>선정 방식</dt>
                <dd>
                  {winnerMode === "first"
                    ? `결승선을 먼저 통과한 참가자 ${effectiveWinnerCount}명`
                    : `모든 마블 완주 후 가장 늦은 참가자 ${effectiveWinnerCount}명`}
                </dd>
              </div>
              <div>
                <dt>마블 구성</dt>
                <dd>
                  {selectedParticipants.length}명 × {ballsPerParticipant}개 = 총 {totalBalls}개
                </dd>
              </div>
              <div>
                <dt>데이터</dt>
                <dd>Discord CDN 이미지를 직접 표시하며 별도 파일 저장 안 함</dd>
              </div>
              {lastSeed !== null ? (
                <div>
                  <dt>추첨 ID</dt>
                  <dd>{lastSeed.toString(16).padStart(8, "0").toUpperCase()}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </aside>

        <article className={styles.roulette__race_report}>
          <div className={styles.roulette__race_heading}>
            <div>
              <p>선택 코스 · {course.distance}</p>
              <h2>{course.name}</h2>
            </div>
            <span>{course.duration}</span>
          </div>

          <div className={styles.roulette__stage}>
            <canvas
              ref={canvasRef}
              className={styles.roulette__canvas}
              style={{
                aspectRatio: `${ROULETTE_BOARD_WIDTH} / ${course.height}`,
              }}
              aria-label={`${course.name}에서 선택한 길드원의 프로필 마블이 회전 장애물과 충돌하며 결승선으로 내려가는 룰렛`}
              role="img"
            />

            {winners.length > 0 ? (
              <div className={styles.roulette__winner} role="status">
                <div className={styles.roulette__winner_heading}>
                  <span>{winnerMode === "first" ? "FIRST IN" : "LAST IN"}</span>
                  <strong>{winners.length}명 당첨</strong>
                </div>
                <ol className={styles.roulette__winner_list}>
                  {winners.map((winner, index) => (
                    <li key={winner.id}>
                      <span className={styles.roulette__winner_rank}>
                        {index + 1}
                      </span>
                      <MemberAvatar
                        avatarUrl={winner.avatarUrl}
                        discordUserId={winner.id}
                        name={winner.name}
                        variant="winner"
                        meaningful
                      />
                      <strong>{winner.name}</strong>
                    </li>
                  ))}
                </ol>
                <div className={styles.roulette__winner_actions}>
                  <button
                    className={styles.roulette__winner_copy}
                    type="button"
                    onClick={handleCopyResult}
                    disabled={copyState === "copying"}
                  >
                    {copyState === "copying"
                      ? "PNG 만드는 중…"
                      : copyState === "success"
                        ? "클립보드 복사 완료"
                        : "결과 PNG 복사"}
                  </button>
                  <button
                    className={styles.roulette__winner_retry}
                    type="button"
                    onClick={clearRace}
                  >
                    다시 추첨하기
                  </button>
                </div>
                {copyState === "success" ? (
                  <p
                    className={`${styles.roulette__copy_status} ${styles.roulette__copy_status_success}`}
                    aria-live="polite"
                  >
                    결과 이미지를 PNG로 클립보드에 넣었습니다.
                  </p>
                ) : copyState === "error" ? (
                  <p
                    className={`${styles.roulette__copy_status} ${styles.roulette__copy_status_error}`}
                    role="alert"
                  >
                    이미지 복사에 실패했습니다. 브라우저의 클립보드 권한을
                    확인해 주세요.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <p className={styles.roulette__status} aria-live="polite">
            {winners.length > 0
              ? `${resultLabel}: ${winnerNames}`
              : phase === "running"
                ? winnerMode === "last"
                  ? `총 ${totalBalls}개 마블의 완주를 기다리는 중입니다.`
                  : `${effectiveWinnerCount}명의 선착 당첨자를 가리는 중입니다.`
                : selectedParticipants.length >= ROULETTE_MIN_PARTICIPANTS
                  ? "명단과 추첨 설정을 확인한 뒤 출발하세요."
                  : `길드원을 ${ROULETTE_MIN_PARTICIPANTS}명 이상 선택하면 출발할 수 있습니다.`}
          </p>
        </article>
      </section>

      <footer className={styles.roulette__footer}>
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
    </main>
  );
}
