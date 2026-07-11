"use client";

import Image from "next/image";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useCompleteTowaskiLicenseTest } from "@/hooks/mutations/useEquipmentShopMutation";
import { DialogueBeepEngine } from "@/lib/audio/dialogue-beep-engine";
import {
  getTowaskiLicenseTestRules,
  resolveTowaskiDebugLicenseTest,
  startTowaskiDebugLicenseTest,
  TOWASKI_LICENSE_TEST_DIFFICULTIES,
  TOWASKI_LICENSE_TARGET_LAYOUTS,
  type TowaskiBasicLicenseTestEvaluation,
  type TowaskiDebugLicenseSession,
  type TowaskiLicenseTestDifficulty,
  type TowaskiLicenseTarget,
  type TowaskiLicenseTestRequest,
  type TowaskiLicenseTestResponse,
  type TowaskiLicenseTestStats,
} from "@/lib/equipment-shop/license-test";
import type { TowaskiQualificationDialogueEvent } from "@/lib/equipment-shop/towaski-dialogue";

import styles from "./TowaskiLicenseTest.module.css";

type TestPhase =
  | "briefing"
  | "countdown"
  | "starting"
  | "active"
  | "resolving"
  | "failed";
type ActiveChallenge = Extract<TowaskiLicenseTestResponse, { status: "active" }>;

interface TowaskiLicenseTestProps {
  characterCodename: string;
  debugSandbox?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onDialogueEvent?: (event: TowaskiQualificationDialogueEvent) => void;
  onGranted: (licenseName: string) => void;
}

interface TestSubmissionCallbacks {
  onSuccess: (response: TowaskiLicenseTestResponse) => void;
  onError: (error: Error) => void;
}

const DIFFICULTY_ORDER: readonly TowaskiLicenseTestDifficulty[] = [
  "basic",
  "standard",
  "expert",
];
const EMPTY_STATS: TowaskiLicenseTestStats = {
  hostileHits: 0,
  civilianHits: 0,
  shots: 0,
};

function formatAccuracy(hostileHits: number, shots: number): string {
  if (shots === 0) return "0%";
  return `${Math.round((hostileHits / shots) * 100)}%`;
}

function failureMessage(
  evaluation: TowaskiBasicLicenseTestEvaluation | null,
  requiredHostileHits: number,
): string {
  if (!evaluation) return "사격 기록 전송이 중단됐다. 다시 시험선을 잡아.";
  if (evaluation.reasons.includes("civilian_hit")) {
    return "민간 표적을 건드렸군. 방아쇠보다 식별이 먼저다. 다시.";
  }
  if (evaluation.reasons.includes("hostile_hits")) {
    return `표적을 너무 많이 흘렸다. 적어도 ${requiredHostileHits}개는 맞혀야 총을 내준다.`;
  }
  return "탄을 뿌리는 건 사격이 아니야. 명중률부터 다시 맞춰.";
}

export default function TowaskiLicenseTest({
  characterCodename,
  debugSandbox = false,
  onBusyChange,
  onDialogueEvent,
  onGranted,
}: TowaskiLicenseTestProps) {
  const { mutate: submitLiveTest } = useCompleteTowaskiLicenseTest();
  const [phase, setPhase] = useState<TestPhase>("briefing");
  const [difficulty, setDifficulty] =
    useState<TowaskiLicenseTestDifficulty>("basic");
  const [countdown, setCountdown] = useState(3);
  const [challenge, setChallenge] = useState<ActiveChallenge | null>(null);
  const [stats, setStats] = useState<TowaskiLicenseTestStats>(EMPTY_STATS);
  const [roundShots, setRoundShots] = useState(0);
  const [targetResolved, setTargetResolved] = useState(false);
  const [lastEvaluation, setLastEvaluation] =
    useState<TowaskiBasicLicenseTestEvaluation | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [reticle, setReticle] = useState({ x: 50, y: 50, visible: false });

  const audioRef = useRef<DialogueBeepEngine | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugSessionRef = useRef<TowaskiDebugLicenseSession | null>(null);
  const roundShotsRef = useRef(0);
  const resolvingRef = useRef(false);
  const attemptRef = useRef(0);

  const rules = getTowaskiLicenseTestRules(difficulty);
  const hitAdvanceMs =
    Math.ceil(rules.minDurationMs / TOWASKI_LICENSE_TARGET_LAYOUTS.length) +
    20;
  const currentTarget = challenge?.target ?? null;
  const displayedShots = stats.shots + roundShots;
  const liveAccuracy = formatAccuracy(stats.hostileHits, displayedShots);
  const completedRounds = challenge?.round ?? 0;
  const isTestBusy = phase !== "briefing" && phase !== "failed";

  useEffect(() => {
    onBusyChange?.(isTestBusy);
    return () => onBusyChange?.(false);
  }, [isTestBusy, onBusyChange]);

  useEffect(() => {
    audioRef.current = new DialogueBeepEngine({
      preset: "operator",
      volume: 0.42,
    });
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (debugTimerRef.current) clearTimeout(debugTimerRef.current);
      void audioRef.current?.destroy();
      audioRef.current = null;
    };
  }, []);

  const resetTest = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (debugTimerRef.current) clearTimeout(debugTimerRef.current);
    debugSessionRef.current = null;
    setChallenge(null);
    setStats(EMPTY_STATS);
    setRoundShots(0);
    setTargetResolved(false);
    setLastEvaluation(null);
    setSubmissionError(null);
    roundShotsRef.current = 0;
    resolvingRef.current = false;
  }, []);

  const handleResponse = useCallback(
    (response: TowaskiLicenseTestResponse) => {
      resolvingRef.current = false;
      if (response.status === "active") {
        setDifficulty(response.difficulty);
        setChallenge(response);
        setStats(response.stats);
        setRoundShots(0);
        setTargetResolved(false);
        roundShotsRef.current = 0;
        setPhase("active");
        return;
      }
      if (response.status === "failed") {
        setStats(response.stats);
        setLastEvaluation(response.evaluation);
        setPhase("failed");
        onDialogueEvent?.({
          type: "failed",
          difficulty: response.difficulty,
          attempt: attemptRef.current,
          reasons: response.evaluation.reasons,
        });
        return;
      }
      onGranted(response.license.name);
    },
    [onDialogueEvent, onGranted],
  );

  const handleMutationError = useCallback(
    (error: Error) => {
      resolvingRef.current = false;
      setSubmissionError(error.message);
      setPhase("failed");
      onDialogueEvent?.({
        type: "failed",
        difficulty,
        attempt: attemptRef.current,
        reasons: ["invalid"],
      });
    },
    [difficulty, onDialogueEvent],
  );

  const submitTest = useCallback(
    (input: TowaskiLicenseTestRequest, callbacks: TestSubmissionCallbacks) => {
      if (!debugSandbox) {
        submitLiveTest(input, {
          onSuccess: (response) => callbacks.onSuccess(response),
          onError: (error) => callbacks.onError(error),
        });
        return;
      }

      if (debugTimerRef.current) clearTimeout(debugTimerRef.current);
      debugTimerRef.current = setTimeout(() => {
        try {
          if (input.action === "start") {
            const result = startTowaskiDebugLicenseTest(input.difficulty);
            debugSessionRef.current = result.session;
            callbacks.onSuccess(result.response);
            return;
          }
          if (!debugSessionRef.current) {
            throw new Error("DEBUG_LICENSE_SESSION_MISSING");
          }
          const result = resolveTowaskiDebugLicenseTest(
            debugSessionRef.current,
            input,
          );
          debugSessionRef.current = result.session;
          callbacks.onSuccess(result.response);
        } catch (error) {
          callbacks.onError(
            error instanceof Error ? error : new Error("DEBUG_LICENSE_FAILED"),
          );
        }
      }, 80);
    },
    [debugSandbox, submitLiveTest],
  );

  const startChallenge = useCallback(() => {
    setPhase("starting");
    submitTest(
      { action: "start", difficulty },
      {
        onSuccess: handleResponse,
        onError: handleMutationError,
      },
    );
  }, [difficulty, handleMutationError, handleResponse, submitTest]);

  const beginTest = useCallback(() => {
    attemptRef.current += 1;
    resetTest();
    setCountdown(3);
    setPhase("countdown");
    onDialogueEvent?.({
      type: "start",
      difficulty,
      attempt: attemptRef.current,
    });
    void audioRef.current?.prime();
  }, [difficulty, onDialogueEvent, resetTest]);

  const returnToBriefing = useCallback(() => {
    resetTest();
    setPhase("briefing");
    onDialogueEvent?.({
      type: "briefing",
      difficulty,
      attempt: attemptRef.current,
    });
  }, [difficulty, onDialogueEvent, resetTest]);

  useEffect(() => {
    if (phase !== "countdown") return;

    void audioRef.current?.beep("R", countdown, {
      pitch: countdown === 1 ? 880 : 620,
      wave: "square",
      duration: 0.055,
      volume: 0.48,
      frequencyVariance: 0,
      wobble: 0,
    });
    const timer = setTimeout(() => {
      if (countdown === 1) {
        startChallenge();
        return;
      }
      setCountdown((value) => value - 1);
    }, 650);
    return () => clearTimeout(timer);
  }, [countdown, phase, startChallenge]);

  const resolveRound = useCallback(
    (hit: boolean, shots: number) => {
      if (!challenge || resolvingRef.current) return;
      resolvingRef.current = true;
      setTargetResolved(true);
      setPhase("resolving");
      submitTest(
        {
          action: "resolve",
          challengeId: challenge.challengeId,
          round: challenge.round,
          hit,
          shots,
        },
        {
          onSuccess: handleResponse,
          onError: handleMutationError,
        },
      );
    },
    [challenge, handleMutationError, handleResponse, submitTest],
  );

  useEffect(() => {
    if (phase !== "active" || !challenge) return;
    const timer = setTimeout(() => {
      resolveRound(false, roundShotsRef.current);
    }, rules.targetWindowMs);
    return () => clearTimeout(timer);
  }, [challenge, phase, resolveRound, rules.targetWindowMs]);

  const handleRangePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      setReticle({
        x: ((event.clientX - bounds.left) / bounds.width) * 100,
        y: ((event.clientY - bounds.top) / bounds.height) * 100,
        visible: event.pointerType !== "touch",
      });
    },
    [],
  );

  const playShot = useCallback(
    (pitch: number) => {
      void audioRef.current?.beep("F", displayedShots, {
        pitch,
        wave: "square",
        duration: 0.06,
        volume: 0.52,
        frequencyVariance: 0,
        wobble: 0,
      });
    },
    [displayedShots],
  );

  const registerShot = useCallback(() => {
    if (
      phase !== "active" ||
      roundShotsRef.current >= rules.maxShotsPerRound
    ) {
      return;
    }
    const nextShots = roundShotsRef.current + 1;
    roundShotsRef.current = nextShots;
    setRoundShots(nextShots);
    playShot(150);
  }, [phase, playShot, rules.maxShotsPerRound]);

  const handleTargetHit = useCallback(
    (target: TowaskiLicenseTarget) => {
      if (
        phase !== "active" ||
        resolvingRef.current ||
        roundShotsRef.current >= rules.maxShotsPerRound
      ) {
        return;
      }
      const nextShots = roundShotsRef.current + 1;
      roundShotsRef.current = nextShots;
      setRoundShots(nextShots);
      setTargetResolved(true);
      playShot(target.kind === "hostile" ? 220 : 92);

      advanceTimerRef.current = setTimeout(() => {
        resolveRound(true, nextShots);
      }, hitAdvanceMs);
    }, [hitAdvanceMs, phase, playShot, resolveRound, rules.maxShotsPerRound]);

  const resultStats = useMemo(
    () => [
      { label: "적성 적중", value: `${stats.hostileHits} / ${rules.hostileTargets}` },
      { label: "민간 오사", value: `${stats.civilianHits}` },
      { label: "명중률", value: formatAccuracy(stats.hostileHits, stats.shots) },
    ],
    [rules.hostileTargets, stats],
  );

  return (
    <section className={styles.licenseTest} aria-label="토와스키 기본 화기 자격시험">
      <header className={styles.testHeader}>
        <div>
          <span>TOWASKI RANGE CONTROL / B-01</span>
          <h2>기본 화기 자격시험</h2>
        </div>
        <div className={styles.candidate}>
          <span>응시 요원</span>
          <strong>{characterCodename}</strong>
        </div>
      </header>

      {phase === "briefing" ? (
        <div className={styles.briefing}>
          <div className={styles.instructorPortrait}>
            <Image
              src="/assets/npcs/Towaski-blocked.webp?v=cutout-1"
              alt="사격 시험을 제지하며 설명하는 립 토와스키"
              fill
              sizes="(max-width: 720px) 100vw, 360px"
              priority
            />
          </div>
          <div className={styles.briefingCopy}>
            <span className={styles.statusLine}>
              LICENSE STATUS / NOT ISSUED / {rules.label}
            </span>
            <h3>“기본 자격도 없이 진열장부터 보려고?”</h3>
            <p>
              사격선에 서. 적성 표적은 확실히 끊고, 민간 표적에는 손가락도
              걸지 마. 그 정도 식별도 안 되면 총은 못 내준다.
            </p>
            <div
              className={styles.difficultySelector}
              role="group"
              aria-label="사격시험 난이도"
            >
              {DIFFICULTY_ORDER.map((value) => {
                const option = TOWASKI_LICENSE_TEST_DIFFICULTIES[value];
                return (
                  <button
                    key={value}
                    type="button"
                    data-active={difficulty === value}
                    aria-pressed={difficulty === value}
                    onClick={() => setDifficulty(value)}
                  >
                    <strong>{option.label}</strong>
                    <span>
                      {(option.targetWindowMs / 1_000).toFixed(2)}초 · 적중{" "}
                      {option.requiredHostileHits}/10
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={styles.criteria} aria-label="합격 기준">
              <span>
                적성 적중 <strong>{rules.requiredHostileHits} / {rules.hostileTargets}</strong>
              </span>
              <span>
                민간 오사 <strong>{rules.maxCivilianHits}</strong>
              </span>
              <span>
                최소 명중률 <strong>{Math.round(rules.minAccuracy * 100)}%</strong>
              </span>
            </div>
            <button type="button" className={styles.startButton} onClick={beginTest}>
              사격장 진입
            </button>
          </div>
        </div>
      ) : phase === "failed" ? (
        <div className={styles.resultPanel}>
          <span className={styles.resultCode}>QUALIFICATION / FAILED</span>
          <h3>반출 자격 미달</h3>
          <p>
            {submissionError ??
              failureMessage(lastEvaluation, rules.requiredHostileHits)}
          </p>
          <div className={styles.resultStats}>
            {resultStats.map((stat) => (
              <span key={stat.label}>
                {stat.label}<strong>{stat.value}</strong>
              </span>
            ))}
          </div>
          <div className={styles.resultActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={returnToBriefing}
            >
              난이도 변경
            </button>
            <button
              type="button"
              className={styles.retryButton}
              onClick={beginTest}
            >
              같은 난이도로 재시험
            </button>
          </div>
        </div>
      ) : (
        <div
          className={[styles.range, styles[`range--${difficulty}`]].join(" ")}
          style={
            {
              "--difficulty-target-scale": rules.targetScale,
            } as CSSProperties
          }
          onPointerMove={handleRangePointerMove}
          onPointerLeave={() => setReticle((value) => ({ ...value, visible: false }))}
          onPointerDown={registerShot}
          role="application"
          aria-label="사격 시험장"
        >
          <div className={styles.rangeHud}>
            <span>HIT <strong>{stats.hostileHits}</strong></span>
            <span>NO FIRE <strong>{stats.civilianHits}</strong></span>
            <span>ACC <strong>{liveAccuracy}</strong></span>
            <span>ROUND <strong>{Math.min(completedRounds + 1, TOWASKI_LICENSE_TARGET_LAYOUTS.length)} / {TOWASKI_LICENSE_TARGET_LAYOUTS.length}</strong></span>
          </div>

          <div className={styles.skyline} aria-hidden>
            <span /><span /><span /><span /><span />
          </div>
          <div className={styles.rangeFloor} aria-hidden />

          {phase === "countdown" ? (
            <div className={styles.countdown} aria-live="assertive">
              <span>STANDBY</span>
              <strong>{countdown}</strong>
            </div>
          ) : null}

          {phase === "starting" ? (
            <div className={styles.transmitting} role="status">
              <span>RANGE CONTROL</span>
              <strong>시험 세션 발급 중</strong>
            </div>
          ) : null}

          {(phase === "active" || phase === "resolving") && currentTarget ? (
            <button
              type="button"
              className={[
                styles.target,
                styles[`target--${currentTarget.kind}`],
                styles[`target--${currentTarget.lane}`],
                targetResolved ? styles["target--resolved"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ left: `${currentTarget.x}%`, top: `${currentTarget.y}%` }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => handleTargetHit(currentTarget)}
              disabled={phase !== "active" || targetResolved}
              aria-label={
                currentTarget.kind === "hostile"
                  ? "적성 표적 사격"
                  : "민간 표적, 사격 금지"
              }
            >
              <span className={styles.targetHead} />
              <span className={styles.targetBody} />
              <span className={styles.targetLabel}>
                {currentTarget.kind === "hostile" ? "THREAT" : "NO FIRE"}
              </span>
              {targetResolved ? <span className={styles.hitMark}>X</span> : null}
            </button>
          ) : null}

          <div
            className={[styles.reticle, reticle.visible ? styles["reticle--visible"] : ""]
              .filter(Boolean)
              .join(" ")}
            style={{ left: `${reticle.x}%`, top: `${reticle.y}%` }}
            aria-hidden
          />

          <div className={styles.progressRail} aria-hidden>
            {TOWASKI_LICENSE_TARGET_LAYOUTS.map((target, index) => (
              <span
                key={`${target.lane}-${target.x}-${index}`}
                className={index < completedRounds ? styles["progressRail--done"] : ""}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
