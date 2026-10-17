"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createRouletteRace,
  ROULETTE_FIXED_STEP_SECONDS,
  stepRouletteRace,
  type RouletteCourseId,
  type RouletteParticipant,
  type RouletteRace,
  type RouletteWinnerMode,
} from "@/lib/roulette/engine";

const MAX_FRAME_DELTA_SECONDS = 0.05;
const OVERTIME_SIMULATION_SECONDS = 20;
const ELAPSED_PUBLISH_INTERVAL_SECONDS = 0.1;

export type RacePhase = "ready" | "running" | "finished";

export interface RouletteRaceConfig {
  participants: readonly RouletteParticipant[];
  courseId: RouletteCourseId;
  winnerMode: RouletteWinnerMode;
  winnerCount: number;
  ballsPerParticipant: number;
}

interface UseRouletteRaceOptions {
  /** 물리 스텝마다 호출되는 그리기 콜백. 최신 값을 ref 로 보관하므로 매 렌더 바뀌어도 된다. */
  onFrame: () => void;
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

function resolveWinners(race: RouletteRace): RouletteParticipant[] {
  return race.winnerParticipantIds.flatMap((participantId) => {
    const ball = race.balls.find((candidate) => candidate.id === participantId);
    return ball
      ? [{ id: ball.id, name: ball.name, avatarUrl: ball.avatarUrl }]
      : [];
  });
}

/**
 * 경주 한 판의 생명주기(phase · seed · 경과 시간 · 완주자 · 당첨자)와
 * 고정 스텝 물리 루프를 담당한다. 그리기는 `onFrame` 에 위임한다.
 */
export function useRouletteRace({ onFrame }: UseRouletteRaceOptions) {
  const raceRef = useRef<RouletteRace | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const onFrameRef = useRef(onFrame);

  const [phase, setPhase] = useState<RacePhase>("ready");
  const [seed, setSeed] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [finishedParticipantIds, setFinishedParticipantIds] = useState<
    readonly string[]
  >([]);
  const [winners, setWinners] = useState<RouletteParticipant[]>([]);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancelAnimation();
    raceRef.current = null;
    setPhase("ready");
    setSeed(null);
    setElapsedSeconds(0);
    setFinishedParticipantIds([]);
    setWinners([]);
    onFrameRef.current();
  }, [cancelAnimation]);

  const start = useCallback(
    (config: RouletteRaceConfig) => {
      cancelAnimation();

      const nextSeed = createBrowserSeed();
      const race = createRouletteRace(config.participants, nextSeed, {
        courseId: config.courseId,
        winnerMode: config.winnerMode,
        winnerCount: config.winnerCount,
        ballsPerParticipant: config.ballsPerParticipant,
      });
      raceRef.current = race;
      setPhase("running");
      setSeed(nextSeed);
      setElapsedSeconds(0);
      setFinishedParticipantIds([]);
      setWinners([]);

      const totalBalls = race.balls.length;
      let previousTime = performance.now();
      let accumulator = 0;
      let publishedElapsedSeconds = 0;
      let publishedFinishCount = 0;

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

        if (race.finishOrder.length !== publishedFinishCount) {
          publishedFinishCount = race.finishOrder.length;
          setFinishedParticipantIds(
            Array.from(
              new Set(race.finishOrder.map((finish) => finish.participantId)),
            ),
          );
        }

        if (race.done) {
          animationFrameRef.current = null;
          setElapsedSeconds(race.elapsedSeconds);
          setWinners(resolveWinners(race));
          setPhase("finished");
          onFrameRef.current();
          return;
        }

        if (
          race.elapsedSeconds - publishedElapsedSeconds >=
          ELAPSED_PUBLISH_INTERVAL_SECONDS
        ) {
          publishedElapsedSeconds = race.elapsedSeconds;
          setElapsedSeconds(race.elapsedSeconds);
        }

        onFrameRef.current();
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      onFrameRef.current();
      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [cancelAnimation],
  );

  useEffect(() => cancelAnimation, [cancelAnimation]);

  return {
    phase,
    seed,
    elapsedSeconds,
    finishedParticipantIds,
    winners,
    raceRef,
    start,
    reset,
  };
}
