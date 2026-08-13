"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";
import {
  createRouletteRace,
  parseRouletteParticipants,
  ROULETTE_BOARD_HEIGHT,
  ROULETTE_BOARD_WIDTH,
  ROULETTE_FIXED_STEP_SECONDS,
  ROULETTE_MAX_PARTICIPANTS,
  ROULETTE_MIN_PARTICIPANTS,
  shuffleRouletteParticipants,
  stepRouletteRace,
  type RouletteRace,
} from "@/lib/roulette/engine";
import { drawRouletteScene } from "@/lib/roulette/renderer";

import styles from "./styles.module.css";

const DEFAULT_PARTICIPANTS = [
  "참가자 1",
  "참가자 2",
  "참가자 3",
  "참가자 4",
  "참가자 5",
  "참가자 6",
].join("\n");
const MAX_FRAME_DELTA_SECONDS = 0.05;

type RacePhase = "ready" | "running" | "finished";

interface RouletteClientProps {
  currentUserName: string;
}

function createBrowserSeed(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Date.now() >>> 0;
}

export function RouletteClient({ currentUserName }: RouletteClientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raceRef = useRef<RouletteRace | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previewParticipantsRef = useRef<string[]>([]);

  const [participantInput, setParticipantInput] = useState(
    DEFAULT_PARTICIPANTS,
  );
  const [phase, setPhase] = useState<RacePhase>("ready");
  const [winner, setWinner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSeed, setLastSeed] = useState<number | null>(null);

  const participants = useMemo(
    () => parseRouletteParticipants(participantInput),
    [participantInput],
  );

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

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
      targetHeight / ROULETTE_BOARD_HEIGHT,
      0,
      0,
    );
    drawRouletteScene(context, {
      race: raceRef.current,
      previewParticipants: previewParticipantsRef.current,
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
    setWinner(null);
    setLastSeed(null);
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
    previewParticipantsRef.current = participants;
    if (!raceRef.current) renderCanvas();
  }, [participants, renderCanvas]);

  useEffect(() => stopAnimation, [stopAnimation]);

  function validateParticipants(): boolean {
    if (participants.length < ROULETTE_MIN_PARTICIPANTS) {
      setErrorMessage(
        `참가자를 ${ROULETTE_MIN_PARTICIPANTS}명 이상 입력해 주세요.`,
      );
      return false;
    }
    if (participants.length > ROULETTE_MAX_PARTICIPANTS) {
      setErrorMessage(
        `한 번에 최대 ${ROULETTE_MAX_PARTICIPANTS}명까지 참여할 수 있습니다.`,
      );
      return false;
    }
    setErrorMessage(null);
    return true;
  }

  function handleStart() {
    if (!validateParticipants()) return;

    stopAnimation();
    const seed = createBrowserSeed();
    const race = createRouletteRace(participants, seed);
    raceRef.current = race;
    setWinner(null);
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
      accumulator += frameDelta;

      while (
        accumulator >= ROULETTE_FIXED_STEP_SECONDS &&
        !race.done
      ) {
        stepRouletteRace(race, ROULETTE_FIXED_STEP_SECONDS);
        accumulator -= ROULETTE_FIXED_STEP_SECONDS;
      }

      if (race.done) {
        const firstWinner = race.finishOrder[0] ?? null;
        setWinner(firstWinner);
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

  function handleShuffle() {
    if (!validateParticipants()) return;

    const shuffled = shuffleRouletteParticipants(
      participants,
      createBrowserSeed(),
    );
    clearRace();
    setParticipantInput(shuffled.join("\n"));
  }

  function handleParticipantChange(value: string) {
    if (phase !== "ready") clearRace();
    setErrorMessage(null);
    setParticipantInput(value);
  }

  const phaseLabel =
    phase === "running"
      ? "구슬이 내려가는 중"
      : phase === "finished"
        ? "추첨 완료"
        : "출발 준비";

  return (
    <main className={styles.roulette}>
      <header className={styles.roulette__header}>
        <div className={styles.roulette__heading}>
          <Link className={styles.roulette__back} href="/calendar">
            <span aria-hidden="true">←</span> 캘린더
          </Link>
          <div>
            <p className={styles.roulette__eyebrow}>STARGATE RANDOMIZER</p>
            <h1>마블 룰렛</h1>
          </div>
        </div>
        <div className={styles.roulette__account}>
          <span title="현재 로그인 사용자">{currentUserName}</span>
          <ThemeToggle />
        </div>
      </header>

      <section className={styles.roulette__layout}>
        <aside className={styles.roulette__controls}>
          <div className={styles.roulette__control_header}>
            <div>
              <p>참가자</p>
              <strong>
                {participants.length}/{ROULETTE_MAX_PARTICIPANTS}
              </strong>
            </div>
            <span
              className={`${styles.roulette__phase} ${styles[`roulette__phase_${phase}`]}`}
            >
              {phaseLabel}
            </span>
          </div>

          <label className={styles.roulette__label} htmlFor="roulette-names">
            이름을 한 줄에 한 명씩 입력하세요
          </label>
          <textarea
            id="roulette-names"
            className={styles.roulette__textarea}
            value={participantInput}
            onChange={(event) => handleParticipantChange(event.target.value)}
            disabled={phase === "running"}
            spellCheck={false}
            aria-describedby={
              errorMessage ? "roulette-input-error" : "roulette-input-help"
            }
          />
          <p id="roulette-input-help" className={styles.roulette__help}>
            쉼표로도 구분할 수 있으며 이름은 24자까지, 중복 이름도 각각 한
            구슬로 참여합니다.
          </p>

          {errorMessage ? (
            <p
              id="roulette-input-error"
              className={styles.roulette__error}
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className={styles.roulette__actions}>
            <button
              className={styles.roulette__secondary}
              type="button"
              onClick={handleShuffle}
              disabled={phase === "running"}
            >
              순서 섞기
            </button>
            {phase === "ready" ? (
              <button
                className={styles.roulette__primary}
                type="button"
                onClick={handleStart}
              >
                출발
              </button>
            ) : (
              <button
                className={styles.roulette__primary}
                type="button"
                onClick={clearRace}
              >
                {phase === "running" ? "중단" : "다시 하기"}
              </button>
            )}
          </div>

          <dl className={styles.roulette__facts}>
            <div>
              <dt>선정 방식</dt>
              <dd>물리 충돌 후 결승선을 가장 먼저 통과한 구슬</dd>
            </div>
            <div>
              <dt>데이터</dt>
              <dd>현재 화면에서만 사용되며 저장하거나 외부로 전송하지 않음</dd>
            </div>
            {lastSeed !== null ? (
              <div>
                <dt>추첨 ID</dt>
                <dd>{lastSeed.toString(16).padStart(8, "0").toUpperCase()}</dd>
              </div>
            ) : null}
          </dl>
        </aside>

        <div className={styles.roulette__stage_wrap}>
          <div className={styles.roulette__stage}>
            <canvas
              ref={canvasRef}
              className={styles.roulette__canvas}
              aria-label="참가자 구슬이 장애물을 통과해 결승선으로 내려가는 마블 룰렛"
              role="img"
            />

            {winner ? (
              <div className={styles.roulette__winner} role="status">
                <span>WINNER</span>
                <strong>{winner}</strong>
                <p>가장 먼저 결승선을 통과했습니다.</p>
                <button type="button" onClick={clearRace}>
                  다시 추첨하기
                </button>
              </div>
            ) : null}
          </div>
          <p className={styles.roulette__status} aria-live="polite">
            {winner
              ? `당첨자는 ${winner}입니다.`
              : phase === "running"
                ? "구슬 경주가 진행 중입니다."
                : "참가자를 확인하고 출발 버튼을 눌러 주세요."}
          </p>
        </div>
      </section>

      <footer className={styles.roulette__footer}>
        <p>
          이 기능은 LazyGyu의{" "}
          <a
            href="https://github.com/lazygyu/roulette"
            target="_blank"
            rel="noreferrer"
          >
            Marble Roulette
          </a>
          를 참고해 독립 구현했습니다. 광고·분석·외부 이미지 요청은 포함하지
          않습니다.
        </p>
        <a
          href="/assets/licenses/marble-roulette.txt"
          target="_blank"
          rel="noreferrer"
        >
          원 프로젝트 MIT 라이선스 전문
        </a>
      </footer>
    </main>
  );
}
