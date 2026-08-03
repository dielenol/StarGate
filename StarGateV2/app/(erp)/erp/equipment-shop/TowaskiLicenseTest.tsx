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
  getTowaskiLicenseTargetRemainingMs,
  getTowaskiLicenseTestProgram,
  getTowaskiLicenseTestRules,
  TOWASKI_LICENSE_TARGET_LAYOUTS,
  type TowaskiLicenseTestEvaluation,
  type TowaskiLicenseTestRequest,
  type TowaskiLicenseTestResponse,
  type TowaskiLicenseTestStats,
} from "@/lib/equipment-shop/license-test";
import type { TowaskiLicenseTestMode } from "@/lib/equipment-shop/license-test-v2";
import type {
  TowaskiV3SonicProgress,
  TowaskiLicenseV3StepInput,
} from "@/lib/equipment-shop/license-test-v3";
import {
  TOWASKI_LICENSE_DEFINITIONS,
  type TowaskiLicenseSlug,
} from "@/lib/equipment-shop/licenses";
import type { TowaskiQualificationDialogueEvent } from "@/lib/equipment-shop/towaski-dialogue";

import { TowaskiExplosiveGame } from "./license-tests/TowaskiExplosiveGame";
import { TowaskiFirearmGame } from "./license-tests/TowaskiFirearmGame";
import { TowaskiFlameGame } from "./license-tests/TowaskiFlameGame";
import { TowaskiHeavyGame } from "./license-tests/TowaskiHeavyGame";
import { TowaskiPrecisionGame } from "./license-tests/TowaskiPrecisionGame";
import { TowaskiSonicGame } from "./license-tests/TowaskiSonicGame";
import type {
  TowaskiLicenseV3ActiveResponse,
  TowaskiLicenseV3GameProps,
} from "./license-tests/TowaskiLicenseV3Game";
import { playTowaskiLicenseModeSound } from "./license-tests/towaski-license-audio";
import styles from "./TowaskiLicenseTest.module.css";

type TestPhase =
  | "briefing"
  | "countdown"
  | "starting"
  | "active"
  | "resolving"
  | "passed"
  | "failed";
type ActiveChallenge = Extract<TowaskiLicenseTestResponse, { status: "active" }>;
type LegacyActiveChallenge = Extract<ActiveChallenge, { round: number }>;

interface TowaskiLicenseTestProps {
  characterCodename: string;
  licenseSlug: TowaskiLicenseSlug;
  debugSandbox?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onDialogueEvent?: (event: TowaskiQualificationDialogueEvent) => void;
  onCancel?: () => void;
  onGranted: (license: Extract<
    TowaskiLicenseTestResponse,
    { status: "granted" | "already_owned" }
  >["license"]) => void;
}

interface TestSubmissionCallbacks {
  onSuccess: (response: TowaskiLicenseTestResponse) => void;
  onError: (error: Error) => void;
}

interface DebugLicenseTestApiResponse {
  session: unknown;
  response: TowaskiLicenseTestResponse;
}

const EMPTY_STATS: TowaskiLicenseTestStats = {
  hostileHits: 0,
  civilianHits: 0,
  shots: 0,
};

function isV3ActiveChallenge(
  challenge: ActiveChallenge | null,
): challenge is TowaskiLicenseV3ActiveResponse {
  return Boolean(
    challenge &&
      "step" in challenge &&
      "scenario" in challenge &&
      challenge.programVersion === 3,
  );
}

function isLegacyActiveChallenge(
  challenge: ActiveChallenge | null,
): challenge is LegacyActiveChallenge {
  return Boolean(challenge && "round" in challenge && "target" in challenge);
}

function formatAccuracy(hostileHits: number, shots: number): string {
  if (shots === 0) return "0%";
  return `${Math.round((hostileHits / shots) * 100)}%`;
}

function qualificationCriteria(mode: TowaskiLicenseTestMode): string[] {
  switch (mode) {
    case "firearm":
      return ["적성 7 / 10 이상", "민간 오사 0", "명중률 65% 이상"];
    case "precision":
      return ["적성 8 / 10 이상", "명중률 60% 이상", "민간 오사 0"];
    case "heavy":
      return ["적성 7 / 10 이상", "명중률 65% 이상", "민간 오사 0"];
    case "flame":
      return ["3칸 직선 경로", "적성 2명 차단", "3회 중 2회 · 안전 침범 0"];
    case "sonic":
      return ["단계당 TARGET 5 / 6", "최종 3 / 4 단계", "보호 박자 입력 0"];
    case "explosive":
      return ["명세 9 / 10 이상", "위험품 반출 0", "격리 누락 0"];
  }
}

function qualificationSafetyHint(mode: TowaskiLicenseTestMode): string {
  switch (mode) {
    case "firearm":
      return "민간 표적은 사격하지 않고 NO FIRE로 통과하십시오.";
    case "precision":
      return "1.125초 축소 표적에서 NO FIRE 식별을 우선하십시오.";
    case "heavy":
      return "숨겨진 시스템 커서 대신 80ms 전자 조준점만 확인하십시오.";
    case "flame":
      return "ALLY·FUEL·RETREAT 셀을 경로에서 모두 제외하십시오.";
    case "sonic":
      return "청색 보호 박자는 소리가 나도 절대 입력하지 마십시오.";
    case "explosive":
      return "RELEASE 전에 정비·격리 표식을 한 번 더 확인하십시오.";
  }
}

function qualificationCoachSteps(
  mode: TowaskiLicenseTestMode,
): Array<{ label: string; instruction: string }> {
  switch (mode) {
    case "firearm":
      return [
        { label: "1 · 식별", instruction: "표적의 THREAT / NO FIRE 표시를 확인" },
        { label: "2 · 조작", instruction: "THREAT는 표적 클릭, 민간은 사격 보류" },
        { label: "3 · 주의", instruction: "빈 공간 오발 없이 한 발씩 처리" },
      ];
    case "precision":
      return [
        { label: "1 · 식별", instruction: "25% 축소 THREAT / NO FIRE 확인" },
        { label: "2 · 조준", instruction: "보이는 축소 표적 안을 직접 조준" },
        { label: "3 · 발사", instruction: "1.125초 안에 한 발 또는 보류" },
      ];
    case "heavy":
      return [
        { label: "1 · 추적", instruction: "80ms 간격 전자 조준점 확인" },
        { label: "2 · 보정", instruction: "X ±8% · Y ±10% 흔들림 추적" },
        { label: "3 · 발사", instruction: "THREAT에만 단발 · NO FIRE 보류" },
      ];
    case "flame":
      return [
        { label: "1 · 시작", instruction: "7×5 격자의 시작 셀 선택" },
        { label: "2 · 방향", instruction: "상하좌우 중 정확히 3칸 방향 선택" },
        { label: "3 · 차단", instruction: "3라운드 적성 경로 2개 · 안전 경로 0 확인" },
      ];
    case "sonic":
      return [
        { label: "1 · 판독", instruction: "8박 중 TARGET 6 · PROTECTED 2 확인" },
        { label: "2 · 입력", instruction: "TARGET만 ±170ms 안에 Space 입력" },
        { label: "3 · 통과", instruction: "단계당 5개 이상 · 총 3단계" },
      ];
    case "explosive":
      return [
        { label: "1 · 판독", instruction: "수류탄·로켓 상태 기록 확인" },
        { label: "2 · 분류", instruction: "각 명세 3 반출 · 1 정비 · 1 격리" },
        { label: "3 · 안전", instruction: "위험품 반출·격리 누락 없이 제출" },
      ];
  }
}

function modeStandbyCopy(mode: TowaskiLicenseTestMode): {
  eyebrow: string;
  title: string;
  instruction: string;
} {
  switch (mode) {
    case "firearm":
      return {
        eyebrow: "IDENTIFICATION RANGE",
        title: "표적 식별 장비 준비",
        instruction: "THREAT는 사격 · NO FIRE는 보류",
      };
    case "precision":
      return {
        eyebrow: "MICRO TARGET RANGE",
        title: "25% 축소 표적 투영",
        instruction: "THREAT 직접 조준 · 1.125초 · NO FIRE 식별",
      };
    case "heavy":
      return {
        eyebrow: "JITTER RANGE",
        title: "전자 조준점 반동 패턴 동기화",
        instruction: "80ms 패턴 보간 · 방향키/마우스 조준 · 단발",
      };
    case "flame":
      return {
        eyebrow: "INCENDIARY LINE",
        title: "3라운드 전술 경로 투영",
        instruction: "시작 칸 + 방향 · 정확히 3칸 · 안전 경로 회피",
      };
    case "sonic":
      return {
        eyebrow: "RESONANCE RHYTHM",
        title: "실시간 공진 박자 동기화",
        instruction: "시작 즉시 Space·시험장 탭·PULSE로 TARGET만 입력 · PROTECTED 보류",
      };
    case "explosive":
      return {
        eyebrow: "ORDNANCE INSPECTION",
        title: "병기 검수 명세서 수신",
        instruction: "안전장치·외피·봉인·점검값 → 3분류",
      };
  }
}

function TowaskiModeStandby({
  mode,
  phase,
  countdown,
}: {
  mode: TowaskiLicenseTestMode;
  phase: Extract<TestPhase, "countdown" | "starting">;
  countdown: number;
}) {
  const copy = modeStandbyCopy(mode);
  return (
    <div
      className={[
        styles.modeStandby,
        styles[`modeStandby--${mode}`],
      ].join(" ")}
      aria-live="assertive"
    >
      <div className={styles.modeStandbyHud}>
        <span>{copy.eyebrow}</span>
        <strong>{mode.toUpperCase()} / STANDBY</strong>
      </div>
      <div className={styles.modeStandbyField} aria-hidden>
        <span className={styles.modeStandbyGrid} />
        <span className={styles.modeStandbyPrimary} />
        <span className={styles.modeStandbySafe} />
        <span className={styles.modeStandbyReticle} />
      </div>
      <div className={styles.modeStandbyOverlay}>
        <span>{phase === "countdown" ? "시험 모드 고정" : "시험 세션 발급 중"}</span>
        <strong>{phase === "countdown" ? countdown : "LINK"}</strong>
        <h3>{copy.title}</h3>
        <p>{copy.instruction}</p>
      </div>
    </div>
  );
}

function failureMessage(
  mode: TowaskiLicenseTestMode,
  evaluation: TowaskiLicenseTestEvaluation | null,
): string {
  if (!evaluation) return "시험 기록 전송이 중단됐다. 장비를 초기화하고 다시.";
  const reasons = evaluation.reasons;
  if (
    reasons.some((reason) =>
      ["civilian_hit", "civilian_exposure", "protected_hit", "protected_exposure"].includes(
        reason,
      ),
    )
  ) {
    return "보호 대상을 위험 범위에 넣었군. 출력보다 안전 확인이 먼저다.";
  }
  if (
    reasons.some((reason) =>
      ["ally_hit", "fuel_hit", "retreat_blocked"].includes(reason),
    )
  ) {
    return "화염 차단선이 안전 표식을 침범했다. 세 칸의 경로를 다시 계산해.";
  }
  if (
    reasons.some((reason) =>
      ["unsafe_release", "quarantine_breach"].includes(reason),
    )
  ) {
    return "위험품 반출 또는 격리 누락이다. 이 기록은 즉시 탈락 처리한다.";
  }
  if (reasons.includes("overheat")) {
    return "총열 과열이다. 길게 누르는 건 제압이 아니라 장비 파손이야.";
  }
  if (reasons.includes("fuel_tank") || reasons.includes("fuel")) {
    return "연료와 확산 범위를 놓쳤다. 분사선을 더 짧게 끊어.";
  }
  if (
    reasons.includes("resonance") ||
    reasons.includes("frequency_deviation") ||
    reasons.includes("overload")
  ) {
    return "공진과 출력 봉인이 맞지 않는다. 파형을 먼저 안정시켜.";
  }
  if (reasons.includes("backblast")) {
    return "후폭풍 구역을 비우지 않았다. 발사선부터 다시 확인해.";
  }
  if (mode === "precision") {
    return "축소 표적 명중률이 기준을 벗어났다. 보이는 면적 안에서 한 발씩 처리해.";
  }
  if (mode === "flame") {
    return "차단한 적성 이동 경로가 부족하다. 세 라운드 경로를 겹쳐 다시 읽어.";
  }
  if (mode === "explosive") {
    return "명세 분류 정확도가 기준에 미달했다. 상태 기록을 다시 읽어.";
  }
  return "자격 기준에 미달했다. 계기를 확인하고 같은 절차로 다시.";
}

function resultStats(
  evaluation: TowaskiLicenseTestEvaluation | null,
  fallback: TowaskiLicenseTestStats,
): Array<{ label: string; value: string }> {
  if (!evaluation || !("metrics" in evaluation)) {
    return [
      { label: "적성 적중", value: String(fallback.hostileHits) },
      { label: "민간 오사", value: String(fallback.civilianHits) },
      {
        label: "명중률",
        value: formatAccuracy(fallback.hostileHits, fallback.shots),
      },
    ];
  }
  switch (evaluation.mode) {
    case "firearm":
      return [
        {
          label: "적성 적중",
          value: `${evaluation.metrics.hostileHits} / 10`,
        },
        {
          label: "민간 오사",
          value: String(evaluation.metrics.civilianHits),
        },
        {
          label: "명중률",
          value: `${Math.round(evaluation.metrics.accuracy * 100)}%`,
        },
      ];
    case "precision":
      if ("hostileHits" in evaluation.metrics) {
        return [
          { label: "적성 적중", value: `${evaluation.metrics.hostileHits} / 10` },
          { label: "민간 오사", value: String(evaluation.metrics.civilianHits) },
          { label: "명중률", value: `${Math.round(evaluation.metrics.accuracy * 100)}%` },
        ];
      }
      return [
        { label: "탄착 점수", value: `${evaluation.metrics.score} / 12` },
        {
          label: "안정 사격",
          value: `${evaluation.metrics.stableShots} / 6`,
        },
        {
          label: "보호 구역",
          value: String(evaluation.metrics.protectedHits),
        },
      ];
    case "heavy":
      if ("hostileHits" in evaluation.metrics) {
        return [
          { label: "적성 적중", value: `${evaluation.metrics.hostileHits} / 10` },
          { label: "민간 오사", value: String(evaluation.metrics.civilianHits) },
          { label: "명중률", value: `${Math.round(evaluation.metrics.accuracy * 100)}%` },
        ];
      }
      return [
        {
          label: "제압 성공",
          value: `${evaluation.metrics.neutralized} / 4`,
        },
        { label: "과열", value: String(evaluation.metrics.overheats) },
        {
          label: "민간 오사",
          value: String(evaluation.metrics.civilianHits),
        },
      ];
    case "flame":
      if ("successfulRoutes" in evaluation.metrics) {
        return [
          { label: "경로 성공", value: `${evaluation.metrics.successfulRoutes} / 3` },
          { label: "적성 차단", value: String(evaluation.metrics.hostilesBlocked) },
          {
            label: "안전 침범",
            value: String(
              evaluation.metrics.allyHits +
                evaluation.metrics.fuelHits +
                evaluation.metrics.retreatHits,
            ),
          },
        ];
      }
      return [
        {
          label: "처리율",
          value: `${Math.round(evaluation.metrics.averageCoverage * 100)}%`,
        },
        {
          label: "연료 잔량",
          value: `${Math.round(evaluation.metrics.minimumFuelRemaining)}%`,
        },
        {
          label: "부수 피해",
          value: String(
            evaluation.metrics.civilianExposures +
              evaluation.metrics.fuelTankIgnitions,
          ),
        },
      ];
    case "sonic":
      if ("successfulStages" in evaluation.metrics) {
        return [
          { label: "리듬 통과", value: `${evaluation.metrics.successfulStages} / 4` },
          { label: "TARGET", value: String(evaluation.metrics.targetHits) },
          { label: "보호 입력", value: String(evaluation.metrics.protectedHits) },
        ];
      }
      return [
        {
          label: "공진 성공",
          value: `${evaluation.metrics.successes} / 4`,
        },
        {
          label: "평균 편차",
          value: `${Math.round(evaluation.metrics.averageFrequencyDeviation * 100)}%`,
        },
        {
          label: "안전 위반",
          value: String(
            evaluation.metrics.protectedExposures +
              evaluation.metrics.overloads,
          ),
        },
      ];
    case "explosive":
      if ("correctDecisions" in evaluation.metrics) {
        return [
          { label: "정확 분류", value: `${evaluation.metrics.correctDecisions} / 10` },
          { label: "위험 반출", value: String(evaluation.metrics.unsafeReleases) },
          { label: "격리 누락", value: String(evaluation.metrics.quarantineBreaches) },
        ];
      }
      return [
        {
          label: "제압 성공",
          value: `${evaluation.metrics.successes} / 5`,
        },
        {
          label: "민간 피해",
          value: String(evaluation.metrics.civilianHits),
        },
        {
          label: "후폭풍 위반",
          value: String(evaluation.metrics.backblastViolations),
        },
      ];
  }
}

function renderV3Game(args: {
  challenge: TowaskiLicenseV3ActiveResponse;
  disabled: boolean;
  onResolve: (input: TowaskiLicenseV3StepInput) => void;
  sonicStageFeedback?: TowaskiLicenseV3GameProps["sonicStageFeedback"];
}) {
  const props = args;
  switch (args.challenge.mode) {
    case "firearm":
      return <TowaskiFirearmGame key={args.challenge.step} {...props} />;
    case "precision":
      return <TowaskiPrecisionGame key={args.challenge.step} {...props} />;
    case "heavy":
      return <TowaskiHeavyGame key={args.challenge.step} {...props} />;
    case "flame":
      return <TowaskiFlameGame key={args.challenge.step} {...props} />;
    case "sonic":
      return <TowaskiSonicGame key={args.challenge.step} {...props} />;
    case "explosive":
      return <TowaskiExplosiveGame key={args.challenge.step} {...props} />;
  }
}

export default function TowaskiLicenseTest({
  characterCodename,
  licenseSlug,
  debugSandbox = false,
  onBusyChange,
  onDialogueEvent,
  onCancel,
  onGranted,
}: TowaskiLicenseTestProps) {
  const { mutate: submitLiveTest } = useCompleteTowaskiLicenseTest();
  const [phase, setPhase] = useState<TestPhase>("briefing");
  const [countdown, setCountdown] = useState(3);
  const [challenge, setChallenge] = useState<ActiveChallenge | null>(null);
  const [stats, setStats] = useState<TowaskiLicenseTestStats>(EMPTY_STATS);
  const [roundShots, setRoundShots] = useState(0);
  const [targetResolved, setTargetResolved] = useState(false);
  const [lastEvaluation, setLastEvaluation] =
    useState<TowaskiLicenseTestEvaluation | null>(null);
  const [grantedLicense, setGrantedLicense] = useState<Extract<
    TowaskiLicenseTestResponse,
    { status: "granted" | "already_owned" }
  >["license"] | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [reticle, setReticle] = useState({ x: 50, y: 50, visible: false });
  const [sonicStageFeedback, setSonicStageFeedback] = useState<
    TowaskiLicenseV3GameProps["sonicStageFeedback"]
  >(null);

  const audioRef = useRef<DialogueBeepEngine | null>(null);
  const modeAudioContextRef = useRef<AudioContext | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugSessionRef = useRef<unknown | null>(null);
  const roundShotsRef = useRef(0);
  const resolvingRef = useRef(false);
  const attemptRef = useRef(0);

  const program = getTowaskiLicenseTestProgram(licenseSlug);
  const license = TOWASKI_LICENSE_DEFINITIONS[licenseSlug];
  const difficulty = program.difficulty;
  const rules = getTowaskiLicenseTestRules(program.difficulty);
  const hitAdvanceMs =
    Math.ceil(rules.minDurationMs / TOWASKI_LICENSE_TARGET_LAYOUTS.length) + 20;
  const legacyChallenge = isLegacyActiveChallenge(challenge) ? challenge : null;
  const v3Challenge = isV3ActiveChallenge(challenge) ? challenge : null;
  const currentTarget = legacyChallenge?.target ?? null;
  const displayedShots = stats.shots + roundShots;
  const liveAccuracy = formatAccuracy(stats.hostileHits, displayedShots);
  const completedRounds = legacyChallenge?.round ?? 0;
  const isTestBusy = phase !== "briefing" && phase !== "failed";
  const displayedResultStats = useMemo(
    () => resultStats(lastEvaluation, stats),
    [lastEvaluation, stats],
  );

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
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
      void audioRef.current?.destroy();
      audioRef.current = null;
      const context = modeAudioContextRef.current;
      modeAudioContextRef.current = null;
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
    };
  }, []);

  const playModeSound = useCallback((mode: TowaskiLicenseTestMode) => {
    try {
      const audioWindow = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextConstructor =
        audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context =
        modeAudioContextRef.current ?? new AudioContextConstructor();
      modeAudioContextRef.current = context;
      const play = () => playTowaskiLicenseModeSound(context, mode);
      if (context.state === "suspended") {
        void context.resume().then(play).catch(() => undefined);
      } else {
        play();
      }
    } catch {
      // Browser audio policy and unsupported Web Audio are non-blocking.
    }
  }, []);

  const resetTest = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    debugSessionRef.current = null;
    setChallenge(null);
    setStats(EMPTY_STATS);
    setRoundShots(0);
    setTargetResolved(false);
    setLastEvaluation(null);
    setGrantedLicense(null);
    setSubmissionError(null);
    setSonicStageFeedback(null);
    roundShotsRef.current = 0;
    resolvingRef.current = false;
  }, []);

  const handleResponse = useCallback(
    (response: TowaskiLicenseTestResponse) => {
      resolvingRef.current = false;
      if (response.status === "processing") {
        setPhase("resolving");
        return;
      }
      if (response.status === "active") {
        if (
          program.mode === "sonic" &&
          isV3ActiveChallenge(challenge) &&
          challenge.mode === "sonic" &&
          response.mode === "sonic"
        ) {
          const previousProgress = challenge.progress as TowaskiV3SonicProgress;
          const nextProgress = response.progress as TowaskiV3SonicProgress;
          setSonicStageFeedback({
            successful:
              nextProgress.successfulStages > previousProgress.successfulStages,
            targetHits: nextProgress.targetHits - previousProgress.targetHits,
            protectedHit:
              nextProgress.protectedHits > previousProgress.protectedHits,
          });
        } else {
          setSonicStageFeedback(null);
        }
        setChallenge(response);
        if ("stats" in response) setStats(response.stats);
        setRoundShots(0);
        setTargetResolved(false);
        roundShotsRef.current = 0;
        setPhase("active");
        return;
      }
      if (response.status === "failed") {
        if ("stats" in response) setStats(response.stats);
        setLastEvaluation(response.evaluation);
        setPhase("failed");
        onDialogueEvent?.({
          type: "failed",
          difficulty: response.difficulty,
          mode: program.mode,
          attempt: attemptRef.current,
          reasons: response.evaluation.reasons,
        });
        return;
      }
      setLastEvaluation(response.evaluation ?? null);
      setGrantedLicense(response.license);
      setPhase("passed");
    },
    [challenge, onDialogueEvent, program.mode],
  );

  const handleMutationError = useCallback(
    (error: Error) => {
      resolvingRef.current = false;
      setSubmissionError(error.message);
      setPhase("failed");
      onDialogueEvent?.({
        type: "failed",
        difficulty,
        mode: program.mode,
        attempt: attemptRef.current,
        reasons: ["invalid"],
      });
    },
    [difficulty, onDialogueEvent, program.mode],
  );

  const submitTest = useCallback(
    (input: TowaskiLicenseTestRequest, callbacks: TestSubmissionCallbacks) => {
      if (!debugSandbox) {
        submitLiveTest(input, {
          onSuccess: callbacks.onSuccess,
          onError: callbacks.onError,
        });
        return;
      }
      void (async () => {
        try {
          if (input.action !== "start" && !debugSessionRef.current) {
            throw new Error("DEBUG_LICENSE_SESSION_MISSING");
          }
          const response = await fetch(
            "/api/erp/equipment-shop/license-test/debug",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                request: input,
                session:
                  input.action === "start" ? null : debugSessionRef.current,
              }),
            },
          );
          const result = (await response.json().catch(() => null)) as
            | (DebugLicenseTestApiResponse & { error?: string })
            | null;
          if (!response.ok || !result?.response) {
            throw new Error(
              result?.error ?? "디버그 자격시험 판정에 실패했습니다.",
            );
          }
          debugSessionRef.current = result.session;
          callbacks.onSuccess(result.response);
        } catch (error) {
          callbacks.onError(
            error instanceof Error ? error : new Error("DEBUG_LICENSE_FAILED"),
          );
        }
      })();
    },
    [debugSandbox, submitLiveTest],
  );

  const startChallenge = useCallback(() => {
    setPhase("starting");
    submitTest(
      { action: "start", licenseSlug },
      { onSuccess: handleResponse, onError: handleMutationError },
    );
  }, [handleMutationError, handleResponse, licenseSlug, submitTest]);

  const beginTest = useCallback(() => {
    attemptRef.current += 1;
    resetTest();
    setCountdown(3);
    setPhase("countdown");
    onDialogueEvent?.({
      type: "start",
      difficulty,
      mode: program.mode,
      attempt: attemptRef.current,
    });
    void audioRef.current?.prime();
  }, [difficulty, onDialogueEvent, program.mode, resetTest]);

  const returnToBriefing = useCallback(() => {
    resetTest();
    setPhase("briefing");
    onDialogueEvent?.({
      type: "briefing",
      difficulty,
      mode: program.mode,
      attempt: attemptRef.current,
    });
  }, [difficulty, onDialogueEvent, program.mode, resetTest]);

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
      } else {
        setCountdown((value) => value - 1);
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [countdown, phase, startChallenge]);

  const resolveLegacyRound = useCallback(
    (hit: boolean, shots: number) => {
      if (!legacyChallenge || resolvingRef.current) return;
      resolvingRef.current = true;
      setTargetResolved(true);
      setPhase("resolving");
      submitTest(
        {
          action: "resolve",
          challengeId: legacyChallenge.challengeId,
          round: legacyChallenge.round,
          hit,
          shots,
        },
        { onSuccess: handleResponse, onError: handleMutationError },
      );
    },
    [handleMutationError, handleResponse, legacyChallenge, submitTest],
  );

  const resolveV3Step = useCallback(
    (input: TowaskiLicenseV3StepInput) => {
      if (!v3Challenge || resolvingRef.current) return;
      resolvingRef.current = true;
      playModeSound(input.mode);
      setPhase("resolving");
      submitTest(
        {
          action: "resolve",
          challengeId: v3Challenge.challengeId,
          step: v3Challenge.step,
          input,
        },
        { onSuccess: handleResponse, onError: handleMutationError },
      );
    },
    [
      handleMutationError,
      handleResponse,
      playModeSound,
      submitTest,
      v3Challenge,
    ],
  );

  useEffect(() => {
    if (phase !== "active" || !legacyChallenge) return;
    const remainingMs = getTowaskiLicenseTargetRemainingMs(
      legacyChallenge.roundDeadlineAt,
      rules.targetWindowMs,
    );
    const timer = setTimeout(() => {
      resolveLegacyRound(false, roundShotsRef.current);
    }, remainingMs);
    deadlineTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (deadlineTimerRef.current === timer) deadlineTimerRef.current = null;
    };
  }, [legacyChallenge, phase, resolveLegacyRound, rules.targetWindowMs]);

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

  const registerLegacyShot = useCallback(() => {
    if (
      phase !== "active" ||
      !legacyChallenge ||
      roundShotsRef.current >= rules.maxShotsPerRound
    ) {
      return;
    }
    const nextShots = roundShotsRef.current + 1;
    roundShotsRef.current = nextShots;
    setRoundShots(nextShots);
    playModeSound("firearm");
  }, [legacyChallenge, phase, playModeSound, rules.maxShotsPerRound]);

  const handleLegacyTargetHit = useCallback(
    () => {
      if (
        phase !== "active" ||
        resolvingRef.current ||
        roundShotsRef.current >= rules.maxShotsPerRound
      ) {
        return;
      }
      const nextShots = roundShotsRef.current + 1;
      if (deadlineTimerRef.current) {
        clearTimeout(deadlineTimerRef.current);
        deadlineTimerRef.current = null;
      }
      roundShotsRef.current = nextShots;
      setRoundShots(nextShots);
      setTargetResolved(true);
      playModeSound("firearm");
      advanceTimerRef.current = setTimeout(() => {
        resolveLegacyRound(true, nextShots);
      }, hitAdvanceMs);
    },
    [
      hitAdvanceMs,
      phase,
      playModeSound,
      resolveLegacyRound,
      rules.maxShotsPerRound,
    ],
  );

  return (
    <section
      className={styles.licenseTest}
      aria-label={`토와스키 ${program.title}`}
    >
      <header className={styles.testHeader}>
        <div>
          <span>TOWASKI QUALIFICATION / {program.testCode}</span>
          <h2>{program.title}</h2>
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
              alt="자격시험 절차를 설명하는 립 토와스키"
              fill
              sizes="(max-width: 720px) 100vw, 360px"
              priority
            />
          </div>
          <div className={styles.briefingCopy}>
            <span className={styles.statusLine}>
              {program.tierLabel.toUpperCase()} QUALIFICATION / {license.label} /
              V{program.programVersion}
            </span>
            <h3>“{license.label} 운용 기준을 확인해.”</h3>
            <p>{program.briefing}</p>
            <p className={styles.noFireHint}>
              <strong>SAFETY</strong> {qualificationSafetyHint(program.mode)}
            </p>
            <div className={styles.coachSteps} aria-label="시험 조작 순서">
              {qualificationCoachSteps(program.mode).map((step) => (
                <span key={step.label}>
                  <strong>{step.label}</strong>
                  {step.instruction}
                </span>
              ))}
            </div>
            {program.mode === "sonic" ? (
              <div className={styles.sonicBriefing} aria-label="음파 시험 상세 안내">
                <div className={styles.sonicBriefing__headline}>
                  <span>SONIC V3 / RESONANCE PROTOCOL</span>
                  <strong>파형의 TARGET만 동기화하고 보호 공진은 침묵으로 통과하십시오.</strong>
                </div>
                <div className={styles.sonicBriefing__legend}>
                  <span className={styles["sonicBriefing__legend--target"]}>TARGET · 입력</span>
                  <span className={styles["sonicBriefing__legend--protected"]}>PROTECTED · 입력 금지</span>
                </div>
                <div className={styles.sonicBriefing__grid}>
                  <span><strong>조작</strong>SPACE · 시험장 탭 · PULSE 버튼</span>
                  <span><strong>판정</strong>PERFECT ±90ms · GOOD ±170ms</span>
                  <span><strong>합격</strong>매 stage 5 / 6 · 최종 3 / 4 · 보호 입력 0</span>
                </div>
              </div>
            ) : null}
            <div className={styles.criteria} aria-label="합격 기준">
              {qualificationCriteria(program.mode).map((criterion) => (
                <span key={criterion}>
                  <strong>{criterion}</strong>
                </span>
              ))}
            </div>
            <div className={styles.resultActions}>
              {onCancel ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={onCancel}
                >
                  건샵으로 돌아가기
                </button>
              ) : null}
              <button
                type="button"
                className={styles.startButton}
                onClick={beginTest}
              >
                {license.label} 시험 시작
              </button>
            </div>
          </div>
        </div>
      ) : phase === "passed" ? (
        <div className={styles.resultPanel}>
          <span className={styles.resultCode}>QUALIFICATION / PASSED</span>
          <h3>{license.label} 자격 승인</h3>
          <p>
            {debugSandbox
              ? "서버와 동일한 판정기로 합격했습니다. 디버그 샌드박스이므로 자격 장부와 운영 DB는 변경하지 않았습니다."
              : "서버 판정과 안전 기록을 확인했습니다. 자격 장부 반영이 완료되었습니다."}
          </p>
          {lastEvaluation ? (
            <div className={styles.resultStats}>
              {displayedResultStats.map((stat) => (
                <span key={stat.label}>
                  {stat.label}
                  <strong>{stat.value}</strong>
                </span>
              ))}
            </div>
          ) : null}
          <div className={styles.resultActions}>
            <button
              type="button"
              className={styles.startButton}
              onClick={() => {
                if (grantedLicense) onGranted(grantedLicense);
              }}
              disabled={!grantedLicense}
            >
              {debugSandbox ? "디버그 결과 확인" : "자격 장부 확인"}
            </button>
          </div>
        </div>
      ) : phase === "failed" ? (
        <div className={styles.resultPanel}>
          <span className={styles.resultCode}>QUALIFICATION / FAILED</span>
          <h3>반출 자격 미달</h3>
          <p>
            {submissionError ?? failureMessage(program.mode, lastEvaluation)}
          </p>
          <div className={styles.resultStats}>
            {displayedResultStats.map((stat) => (
              <span key={stat.label}>
                {stat.label}
                <strong>{stat.value}</strong>
              </span>
            ))}
          </div>
          <div className={styles.resultActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={returnToBriefing}
            >
              시험 안내
            </button>
            <button
              type="button"
              className={styles.retryButton}
              onClick={beginTest}
            >
              같은 자격 재시험
            </button>
          </div>
        </div>
      ) : phase === "countdown" || phase === "starting" ? (
        <TowaskiModeStandby
          mode={program.mode}
          phase={phase}
          countdown={countdown}
        />
      ) : v3Challenge ? (
        renderV3Game({
          challenge: v3Challenge,
          disabled: phase !== "active",
          onResolve: resolveV3Step,
          sonicStageFeedback,
        })
      ) : (
        <div
          className={[styles.range, styles[`range--${difficulty}`]].join(" ")}
          style={
            {
              "--difficulty-target-scale": rules.targetScale,
            } as CSSProperties
          }
          onPointerMove={handleRangePointerMove}
          onPointerLeave={() =>
            setReticle((value) => ({ ...value, visible: false }))
          }
          onPointerDown={registerLegacyShot}
          role="application"
          aria-label="기존 사격 시험 세션"
        >
          <div className={styles.rangeHud}>
            <span>
              HIT <strong>{stats.hostileHits}</strong>
            </span>
            <span>
              NO FIRE <strong>{stats.civilianHits}</strong>
            </span>
            <span>
              ACC <strong>{liveAccuracy}</strong>
            </span>
            <span>
              ROUND{" "}
              <strong>
                {Math.min(
                  completedRounds + 1,
                  TOWASKI_LICENSE_TARGET_LAYOUTS.length,
                )}{" "}
                / {TOWASKI_LICENSE_TARGET_LAYOUTS.length}
              </strong>
            </span>
          </div>
          <div className={styles.skyline} aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className={styles.rangeFloor} aria-hidden />
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
              style={{
                left: `${currentTarget.x}%`,
                top: `${currentTarget.y}%`,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleLegacyTargetHit}
              disabled={phase !== "active" || targetResolved}
              aria-label={
                currentTarget.kind === "hostile"
                  ? "적성 표적 사격"
                  : "민간 표적, 사격 금지"
              }
            >
              <Image
                className={styles.targetImage}
                src="/assets/equipment-shop/training-target.webp"
                width={226}
                height={438}
                alt=""
                aria-hidden
                draggable={false}
                unoptimized
              />
              <span className={styles.targetLabel}>
                {currentTarget.kind === "hostile" ? "THREAT" : "NO FIRE"}
              </span>
              {targetResolved ? <span className={styles.hitMark}>X</span> : null}
            </button>
          ) : null}
          <div
            className={[
              styles.reticle,
              reticle.visible ? styles["reticle--visible"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ left: `${reticle.x}%`, top: `${reticle.y}%` }}
            aria-hidden
          />
          <div className={styles.progressRail} aria-hidden>
            {TOWASKI_LICENSE_TARGET_LAYOUTS.map((target, index) => (
              <span
                key={`${target.lane}-${target.x}-${index}`}
                className={
                  index < completedRounds ? styles["progressRail--done"] : ""
                }
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
