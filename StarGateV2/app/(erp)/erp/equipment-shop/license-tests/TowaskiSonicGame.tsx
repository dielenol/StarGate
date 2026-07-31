"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  TOWASKI_LICENSE_V3_SONIC_GOOD_MS,
  TOWASKI_LICENSE_V3_SONIC_PERFECT_MS,
  type TowaskiV3SonicProgress,
  type TowaskiV3SonicScenario,
} from "@/lib/equipment-shop/license-test-v3";

import type { TowaskiLicenseV3GameProps } from "./TowaskiLicenseV3Game";
import { playTowaskiRhythmCue } from "./towaski-license-audio";
import styles from "./TowaskiLicenseV2.module.css";

type BeatStatus =
  | "pending"
  | "perfect"
  | "good"
  | "missed"
  | "avoided"
  | "protected-hit";
type Judgement = "PERFECT" | "GOOD" | "MISS" | "PROTECTED";

const WAVEFORM_HEIGHTS = Array.from(
  { length: 32 },
  (_, index) => 18 + ((index * 17) % 64),
);

export function TowaskiSonicGame({
  challenge,
  disabled,
  onResolve,
  sonicStageFeedback,
}: TowaskiLicenseV3GameProps) {
  const scenario = challenge.scenario as TowaskiV3SonicScenario;
  const progress = challenge.progress as TowaskiV3SonicProgress;
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const tapsRef = useRef<number[]>([]);
  const beatStatusesRef = useRef<BeatStatus[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundedBeatsRef = useRef(new Set<number>());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [taps, setTaps] = useState<number[]>([]);
  const [beatStatuses, setBeatStatuses] = useState<BeatStatus[]>(() =>
    scenario.beatKinds.map(() => "pending"),
  );
  const [judgement, setJudgement] = useState<Judgement | null>(null);
  const [impactId, setImpactId] = useState(0);

  const intervalMs = 60_000 / scenario.bpm;
  const finalBeatMs =
    scenario.beatStartMs + intervalMs * (scenario.beatKinds.length - 1);

  const setBeatStatus = useCallback((index: number, status: BeatStatus) => {
    beatStatusesRef.current[index] = status;
    setBeatStatuses([...beatStatusesRef.current]);
  }, []);

  useEffect(() => {
    startedAtRef.current = performance.now();
    submittedRef.current = false;
    tapsRef.current = [];
    beatStatusesRef.current = scenario.beatKinds.map(() => "pending");
    soundedBeatsRef.current = new Set();
    const timer = window.setInterval(() => {
      const elapsed = Math.round(performance.now() - startedAtRef.current);
      setElapsedMs(elapsed);
      scenario.beatKinds.forEach((kind, index) => {
        const beatMs = scenario.beatStartMs + index * intervalMs;
        if (elapsed >= beatMs && !soundedBeatsRef.current.has(index)) {
          soundedBeatsRef.current.add(index);
          const context = audioContextRef.current;
          if (context) playTowaskiRhythmCue(context, kind);
        }
        if (
          elapsed > beatMs + TOWASKI_LICENSE_V3_SONIC_GOOD_MS &&
          beatStatusesRef.current[index] === "pending"
        ) {
          setBeatStatus(index, kind === "protected" ? "avoided" : "missed");
        }
      });
      if (
        elapsed >= finalBeatMs + TOWASKI_LICENSE_V3_SONIC_GOOD_MS + 120 &&
        !submittedRef.current
      ) {
        submittedRef.current = true;
        window.clearInterval(timer);
        onResolve({
          mode: "sonic",
          tapsMs: tapsRef.current,
          elapsedMs: elapsed,
        });
      }
    }, 20);
    return () => window.clearInterval(timer);
  }, [
    challenge.step,
    finalBeatMs,
    intervalMs,
    onResolve,
    scenario.beatKinds,
    scenario.beatStartMs,
    setBeatStatus,
  ]);

  useEffect(() => {
    if (!judgement) return;
    const timer = window.setTimeout(() => setJudgement(null), 500);
    return () => window.clearTimeout(timer);
  }, [impactId, judgement]);

  useEffect(
    () => () => {
      const context = audioContextRef.current;
      if (context && context.state !== "closed") void context.close();
    },
    [],
  );

  const tap = useCallback(() => {
    if (disabled || submittedRef.current || tapsRef.current.length >= 8) return;
    const elapsed = Math.round(performance.now() - startedAtRef.current);
    if (!audioContextRef.current) {
      const audioWindow = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextConstructor =
        audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
      if (AudioContextConstructor) {
        try {
          audioContextRef.current = new AudioContextConstructor();
        } catch {
          // Visual rhythm timing remains fully playable without audio.
        }
      }
    }
    tapsRef.current = [...tapsRef.current, elapsed];
    setTaps(tapsRef.current);

    let nearestIndex = -1;
    let nearestDelta = Number.POSITIVE_INFINITY;
    scenario.beatKinds.forEach((_, index) => {
      if (beatStatusesRef.current[index] !== "pending") return;
      const beatMs = scenario.beatStartMs + index * intervalMs;
      const delta = Math.abs(elapsed - beatMs);
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearestIndex = index;
      }
    });
    let nextJudgement: Judgement = "MISS";
    if (nearestIndex >= 0 && nearestDelta <= TOWASKI_LICENSE_V3_SONIC_GOOD_MS) {
      if (scenario.beatKinds[nearestIndex] === "protected") {
        setBeatStatus(nearestIndex, "protected-hit");
        nextJudgement = "PROTECTED";
      } else if (nearestDelta <= TOWASKI_LICENSE_V3_SONIC_PERFECT_MS) {
        setBeatStatus(nearestIndex, "perfect");
        nextJudgement = "PERFECT";
      } else {
        setBeatStatus(nearestIndex, "good");
        nextJudgement = "GOOD";
      }
    }
    setJudgement(nextJudgement);
    setImpactId((value) => value + 1);
  }, [disabled, intervalMs, scenario.beatKinds, scenario.beatStartMs, setBeatStatus]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      tap();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tap]);

  if (challenge.mode !== "sonic" || scenario.mode !== "sonic") return null;

  const targetHitCount = beatStatuses.filter(
    (status, index) =>
      scenario.beatKinds[index] === "target" &&
      (status === "perfect" || status === "good"),
  ).length;

  return (
    <div className={`${styles.game} ${styles["game--sonic"]}`}>
      <div className={styles.hud}>
        <span>STAGE <strong>{challenge.step + 1} / 4</strong></span>
        <span>BPM <strong>{scenario.bpm}</strong></span>
        <span>CLEAR <strong>{progress.successfulStages} / 4</strong></span>
        <span>SAFETY <strong>{progress.protectedHits} HIT</strong></span>
      </div>
      <div
        className={[
          styles.field,
          styles.rhythmField,
          sonicStageFeedback ? styles["rhythmField--withFeedback"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="application"
        tabIndex={0}
        aria-label="음파 8박 리듬 시험장. Space, 시험장 탭 또는 PULSE 버튼으로 TARGET 박자만 입력합니다."
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          tap();
        }}
      >
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>RESONANCE CHAMBER / TARGET ONLY</strong>
          SPACE · 시험장 탭 · PULSE 버튼. 청색 PROTECTED 박자는 입력하지 마십시오.
        </div>
        <div
          className={styles.sonicScoreboard}
          aria-label={`현재 TARGET 적중 ${targetHitCount}개, 필요 5개`}
        >
          <span>TARGET HIT</span>
          <strong>{targetHitCount} / 6</strong>
          <em>NEED 5</em>
        </div>
        {sonicStageFeedback ? (
          <div
            className={[
              styles.sonicStageFeedback,
              sonicStageFeedback.successful
                ? styles["sonicStageFeedback--clear"]
                : styles["sonicStageFeedback--failed"],
            ]
              .filter(Boolean)
              .join(" ")}
            aria-live="assertive"
          >
            <strong>
              <small>PREVIOUS STAGE</small>
              {sonicStageFeedback.successful ? "CLEAR" : "FAILED"}
            </strong>
            <span>
              TARGET {sonicStageFeedback.targetHits} / 6 ·{" "}
              {sonicStageFeedback.protectedHit
                ? "PROTECTED HIT"
                : "SAFETY CLEAR"}
            </span>
          </div>
        ) : null}
        <div className={styles.rhythmTrack} aria-label="8개 박자 상태">
          <div className={styles.rhythmWaveform} aria-hidden>
            {WAVEFORM_HEIGHTS.map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <span
            className={`${styles.rhythmCore} ${
              impactId ? styles["rhythmCore--impact"] : ""
            }`}
            key={`core-${impactId}`}
            aria-hidden
          />
          {scenario.beatKinds.map((kind, index) => {
            const beatMs = scenario.beatStartMs + index * intervalMs;
            const delta = beatMs - elapsedMs;
            const status = beatStatuses[index] ?? "pending";
            return (
              <span
                key={`${kind}-${index}`}
                className={[
                  styles.rhythmBeat,
                  styles[`rhythmBeat--${kind}`],
                  styles[`rhythmBeat--${status}`],
                  Math.abs(delta) <= TOWASKI_LICENSE_V3_SONIC_GOOD_MS
                    ? styles["rhythmBeat--window"]
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  {
                    "--beat-position": Math.max(
                      0,
                      Math.min(100, 50 + delta / 20),
                    ),
                  } as CSSProperties
                }
              >
                <b>{kind === "target" ? "TARGET" : "PROTECTED"}</b>
                <small>
                  {status === "protected-hit"
                    ? "VIOLATION"
                    : status === "avoided"
                      ? "SAFE PASS"
                      : status.toUpperCase()}
                </small>
              </span>
            );
          })}
          <span className={styles.rhythmStrikeLine} aria-hidden />
          {judgement ? (
            <span
              className={[
                styles.rhythmJudgement,
                styles[`rhythmJudgement--${judgement.toLowerCase()}`],
              ]
                .filter(Boolean)
                .join(" ")}
              key={`judgement-${impactId}`}
              aria-live="assertive"
            >
              {judgement}
            </span>
          ) : null}
        </div>
        <span className={styles.statusBanner}>
          PERFECT ±90ms · GOOD ±170ms · INPUT {taps.length}/8
        </span>
      </div>
      <div className={styles.controls}>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.action}
            disabled={disabled}
            onClick={tap}
          >
            PULSE TARGET
          </button>
        </div>
      </div>
    </div>
  );
}
