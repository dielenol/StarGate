"use client";

import {
  type CSSProperties,
  useMemo,
  useRef,
  useState,
} from "react";

import type { TowaskiLicenseV2GameProps } from "./TowaskiLicenseV2Game";
import styles from "./TowaskiLicenseV2.module.css";

export function TowaskiSonicGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV2GameProps) {
  const [frequencyHz, setFrequencyHz] = useState(350);
  const [output, setOutput] = useState(0.5);
  const [width, setWidth] = useState(0.4);
  const [pulseMs, setPulseMs] = useState(0);
  const pulseStartedAtRef = useRef<number | null>(null);

  const scenario =
    challenge.mode === "sonic" && challenge.scenario.mode === "sonic"
      ? challenge.scenario
      : null;
  const progress =
    challenge.progress.mode === "sonic" ? challenge.progress : null;

  const alignment = useMemo(() => {
    if (!scenario) return 0;
    return Math.max(
      0,
      1 -
        Math.abs(frequencyHz - scenario.targetFrequencyHz) /
          scenario.targetFrequencyHz,
    );
  }, [frequencyHz, scenario]);

  if (!scenario || !progress) return null;

  const exposure = output * width;
  const frequencyDeviation =
    Math.abs(frequencyHz - scenario.targetFrequencyHz) /
    scenario.targetFrequencyHz;
  const frequencyReady = frequencyDeviation <= 0.05;
  const outputReady =
    output >= scenario.outputBand.min && output <= scenario.outputBand.max;
  const widthReady =
    width >= scenario.widthBand.min && width <= scenario.widthBand.max;
  const loadSafe = exposure <= scenario.protectionThreshold;
  const pulseReady = pulseMs >= 600 && pulseMs <= 1_500;

  function startPulse() {
    pulseStartedAtRef.current = performance.now();
    setPulseMs(0);
  }

  function finishPulse() {
    if (pulseStartedAtRef.current === null) return;
    setPulseMs(Math.round(performance.now() - pulseStartedAtRef.current));
    pulseStartedAtRef.current = null;
  }

  return (
    <div className={`${styles.game} ${styles["game--sonic"]}`}>
      <div className={styles.hud}>
        <span>
          RESONANCE <strong>{progress.successes} / 4</strong>
        </span>
        <span>
          ALIGN <strong>{Math.round(alignment * 100)}%</strong>
        </span>
        <span>
          EXPOSURE <strong>{Math.round(exposure * 100)}</strong>
        </span>
        <span>
          PULSE <strong>{challenge.step + 1} / 4</strong>
        </span>
      </div>
      <div className={styles.field} aria-label="음파 공진 보정 화면">
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>맞출 것</strong>
          사람이나 표적을 쏘는 시험이 아닙니다. 아래 세 슬라이더를 제시된
          숫자 구간에 맞추고 안전 부하를 초록으로 만든 뒤 펄스를 방출하십시오.
        </div>
        <div className={styles.wave} aria-hidden>
          {Array.from({ length: 7 }, (_, index) => (
            <span
              key={index}
              style={
                {
                  "--wave-strength": Math.max(
                    0.08,
                    alignment - Math.abs(index - 3) * 0.08,
                  ),
                } as CSSProperties
              }
            />
          ))}
        </div>
        <span
          className={`${styles.zone} ${styles["zone--civilian"]}`}
          style={
            {
              "--zone-x": 0.82,
              "--zone-y": 0.7,
              "--zone-radius": 0.11,
              opacity:
                exposure > scenario.protectionThreshold ? 1 : 0.35,
            } as CSSProperties
          }
          aria-hidden
        >
          SAFE
        </span>
      </div>
      <div className={styles.controls}>
        <p className={styles.hint}>
          기준 공진 <strong>{scenario.targetFrequencyHz}Hz</strong> · 출력{" "}
          {Math.round(scenario.outputBand.min * 100)}–
          {Math.round(scenario.outputBand.max * 100)} · 파동 폭{" "}
          {Math.round(scenario.widthBand.min * 100)}–
          {Math.round(scenario.widthBand.max * 100)}
        </p>
        <div className={styles.checklist} aria-label="음파 방출 준비 조건">
          <span className={frequencyReady ? styles["checklist--ready"] : ""}>
            ① 주파수 ±5% {frequencyReady ? "✓" : ""}
          </span>
          <span className={outputReady ? styles["checklist--ready"] : ""}>
            ② 출력 허용 구간 {outputReady ? "✓" : ""}
          </span>
          <span className={widthReady ? styles["checklist--ready"] : ""}>
            ③ 파동 폭 허용 구간 {widthReady ? "✓" : ""}
          </span>
          <span
            className={
              loadSafe
                ? styles["checklist--ready"]
                : styles["checklist--danger"]
            }
          >
            ④ 안전 부하 {Math.round(exposure * 100)} /{" "}
            {Math.round(scenario.protectionThreshold * 100)}
          </span>
        </div>
        <div className={styles.controlGrid}>
          <label className={styles.control}>
            주파수 <strong>{frequencyHz}Hz</strong>
            <input
              type="range"
              min="80"
              max="1200"
              step="5"
              value={frequencyHz}
              disabled={disabled}
              onChange={(event) => setFrequencyHz(Number(event.target.value))}
            />
          </label>
          <label className={styles.control}>
            출력 <strong>{Math.round(output * 100)}</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(output * 100)}
              disabled={disabled}
              onChange={(event) => setOutput(Number(event.target.value) / 100)}
            />
          </label>
          <label className={styles.control}>
            파동 폭 <strong>{Math.round(width * 100)}</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(width * 100)}
              disabled={disabled}
              onChange={(event) => setWidth(Number(event.target.value) / 100)}
            />
          </label>
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={disabled}
            onPointerDown={startPulse}
            onPointerUp={finishPulse}
            onPointerCancel={finishPulse}
            onKeyDown={(event) => {
              if (event.key === " " && !event.repeat) startPulse();
            }}
            onKeyUp={(event) => {
              if (event.key === " ") finishPulse();
            }}
          >
            길게 눌러 출력 충전
          </button>
          <button
            type="button"
            className={styles.action}
            disabled={
              disabled ||
              !frequencyReady ||
              !outputReady ||
              !widthReady ||
              !loadSafe ||
              !pulseReady
            }
            onClick={() =>
              onResolve({
                mode: "sonic",
                frequencyHz,
                output,
                width,
                pulseMs,
              })
            }
          >
            펄스 방출 · {pulseMs}ms / 600–1500ms
          </button>
        </div>
      </div>
    </div>
  );
}
