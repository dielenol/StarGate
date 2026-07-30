"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import {
  TOWASKI_LICENSE_V3_SONIC_GOOD_MS,
  type TowaskiV3SonicProgress,
  type TowaskiV3SonicScenario,
} from "@/lib/equipment-shop/license-test-v3";

import type { TowaskiLicenseV3GameProps } from "./TowaskiLicenseV3Game";
import { playTowaskiRhythmCue } from "./towaski-license-audio";
import styles from "./TowaskiLicenseV2.module.css";

const WAVEFORM_HEIGHTS = Array.from(
  { length: 32 },
  (_, index) => 18 + ((index * 17) % 64),
);

export function TowaskiSonicGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV3GameProps) {
  const scenario = challenge.scenario as TowaskiV3SonicScenario;
  const progress = challenge.progress as TowaskiV3SonicProgress;
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const tapsRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundedBeatsRef = useRef(new Set<number>());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [taps, setTaps] = useState<number[]>([]);

  const intervalMs = 60_000 / scenario.bpm;
  const finalBeatMs =
    scenario.beatStartMs + intervalMs * (scenario.beatKinds.length - 1);

  useEffect(() => {
    startedAtRef.current = performance.now();
    submittedRef.current = false;
    tapsRef.current = [];
    soundedBeatsRef.current = new Set();
    const timer = window.setInterval(() => {
      const elapsed = Math.round(performance.now() - startedAtRef.current);
      setElapsedMs(elapsed);
      scenario.beatKinds.forEach((kind, index) => {
        const beatMs = scenario.beatStartMs + index * intervalMs;
        if (
          elapsed >= beatMs &&
          !soundedBeatsRef.current.has(index)
        ) {
          soundedBeatsRef.current.add(index);
          const context = audioContextRef.current;
          if (context) playTowaskiRhythmCue(context, kind);
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
  ]);

  useEffect(
    () => () => {
      const context = audioContextRef.current;
      if (context && context.state !== "closed") void context.close();
    },
    [],
  );

  if (challenge.mode !== "sonic" || scenario.mode !== "sonic") return null;

  function tap() {
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
  }

  return (
    <div className={`${styles.game} ${styles["game--sonic"]}`}>
      <div className={styles.hud}>
        <span>STAGE <strong>{challenge.step + 1} / 4</strong></span>
        <span>BPM <strong>{scenario.bpm}</strong></span>
        <span>CLEAR <strong>{progress.successfulStages} / 4</strong></span>
        <span>PROTECTED <strong>{progress.protectedHits}</strong></span>
      </div>
      <div
        className={`${styles.field} ${styles.rhythmField}`}
        role="application"
        tabIndex={0}
        aria-label="음파 8박 리듬 시험"
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            tap();
          }
        }}
      >
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>6 TARGET + 2 PROTECTED</strong>
          TARGET 박자만 Space 또는 아래 패드로 입력하십시오. 보호 박자
          입력은 즉시 안전 위반입니다.
        </div>
        <div className={styles.rhythmTrack}>
          <div className={styles.rhythmWaveform} aria-hidden>
            {WAVEFORM_HEIGHTS.map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          {scenario.beatKinds.map((kind, index) => {
            const beatMs = scenario.beatStartMs + index * intervalMs;
            const delta = beatMs - elapsedMs;
            return (
              <span
                key={`${kind}-${index}`}
                className={[
                  styles.rhythmBeat,
                  styles[`rhythmBeat--${kind}`],
                  Math.abs(delta) <= TOWASKI_LICENSE_V3_SONIC_GOOD_MS
                    ? styles["rhythmBeat--window"]
                    : "",
                  delta < -TOWASKI_LICENSE_V3_SONIC_GOOD_MS
                    ? styles["rhythmBeat--past"]
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
                {kind === "target" ? "TARGET" : "PROTECTED"}
              </span>
            );
          })}
          <span className={styles.rhythmStrikeLine} aria-hidden />
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
            TARGET PULSE / SPACE
          </button>
        </div>
      </div>
    </div>
  );
}
