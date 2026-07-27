"use client";

import {
  type CSSProperties,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { TowaskiTimedPointerSample } from "@/lib/equipment-shop/license-test-v2";

import type { TowaskiLicenseV2GameProps } from "./TowaskiLicenseV2Game";
import styles from "./TowaskiLicenseV2.module.css";

export function TowaskiHeavyGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV2GameProps) {
  const [aim, setAim] = useState({ x: 0.5, y: 0.62 });
  const [firing, setFiring] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [burstMs, setBurstMs] = useState(0);
  const aimRef = useRef(aim);
  const firingRef = useRef(false);
  const samplesRef = useRef<TowaskiTimedPointerSample[]>([]);
  const startedAtRef = useRef(0);
  const burstStartedAtRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  const scenario =
    challenge.mode === "heavy" && challenge.scenario.mode === "heavy"
      ? challenge.scenario
      : null;
  const progress =
    challenge.progress.mode === "heavy" ? challenge.progress : null;

  const submit = useCallback(() => {
    if (submittedRef.current || !scenario) return;
    submittedRef.current = true;
    const samples =
      samplesRef.current.length > 0
        ? samplesRef.current
        : [{ t: scenario.durationMs, x: aimRef.current.x, y: aimRef.current.y, active: false }];
    onResolve({ mode: "heavy", samples });
  }, [onResolve, scenario]);

  useEffect(() => {
    if (!scenario || disabled) return;
    startedAtRef.current = performance.now();
    samplesRef.current = [];
    submittedRef.current = false;
    firingRef.current = false;
    burstStartedAtRef.current = null;
    const timer = window.setInterval(() => {
      const elapsed = Math.min(
        scenario.durationMs,
        Math.round(performance.now() - startedAtRef.current),
      );
      const point = aimRef.current;
      samplesRef.current.push({
        t: elapsed,
        x: point.x,
        y: point.y,
        active: firingRef.current,
      });
      setElapsedMs(elapsed);
      if (burstStartedAtRef.current !== null) {
        setBurstMs(Math.round(performance.now() - burstStartedAtRef.current));
      }
      if (elapsed >= scenario.durationMs) {
        window.clearInterval(timer);
        submit();
      }
    }, 100);
    return () => {
      window.clearInterval(timer);
      firingRef.current = false;
      burstStartedAtRef.current = null;
    };
  }, [challenge.step, disabled, scenario, submit]);

  if (!scenario || !progress) return null;

  const elapsedRatio = Math.min(1, elapsedMs / scenario.durationMs);
  const effectiveAim = {
    x: aim.x + scenario.recoil.x * elapsedRatio,
    y: aim.y + scenario.recoil.y * elapsedRatio,
  };
  const civilianActive =
    elapsedMs >= scenario.civilianWindow.startMs &&
    elapsedMs <= scenario.civilianWindow.endMs;

  function setAimPoint(next: { x: number; y: number }) {
    aimRef.current = next;
    setAim(next);
  }

  function updateAim(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setAimPoint({
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    });
  }

  function beginFire() {
    firingRef.current = true;
    burstStartedAtRef.current = performance.now();
    setFiring(true);
  }

  function ceaseFire() {
    firingRef.current = false;
    burstStartedAtRef.current = null;
    setFiring(false);
    setBurstMs(0);
  }

  return (
    <div className={`${styles.game} ${styles["game--heavy"]}`}>
      <div className={styles.hud}>
        <span>
          SUPPRESS <strong>{progress.neutralized} / 4</strong>
        </span>
        <span>
          HEAT <strong>{Math.min(100, Math.round((burstMs / 1_800) * 100))}%</strong>
        </span>
        <span>
          NO FIRE <strong>{progress.civilianHits}</strong>
        </span>
        <span>
          WAVE <strong>{challenge.step + 1} / 4</strong>
        </span>
      </div>
      <div
        className={styles.field}
        role="application"
        tabIndex={0}
        aria-label="중화기 반동 및 과열 제어 구역"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateAim(event);
          beginFire();
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateAim(event);
          }
        }}
        onPointerUp={(event) => {
          updateAim(event);
          ceaseFire();
        }}
        onPointerCancel={ceaseFire}
      >
        <div className={styles.grid} aria-hidden />
        <span
          className={`${styles.zone} ${styles["zone--hostile"]}`}
          style={
            {
              "--zone-x": scenario.target.x,
              "--zone-y": scenario.target.y,
              "--zone-radius": scenario.target.radius,
            } as CSSProperties
          }
          aria-hidden
        >
          ARMOR
        </span>
        <span
          className={`${styles.zone} ${styles["zone--civilian"]}`}
          style={
            {
              "--zone-x": scenario.civilianZone.x,
              "--zone-y": scenario.civilianZone.y,
              "--zone-radius": scenario.civilianZone.radius,
              opacity: civilianActive ? 1 : 0.25,
            } as CSSProperties
          }
          aria-hidden
        >
          {civilianActive ? "CROSSING" : "STANDBY"}
        </span>
        <span
          className={styles.reticle}
          style={
            {
              "--aim-x": effectiveAim.x,
              "--aim-y": effectiveAim.y,
            } as CSSProperties
          }
          aria-hidden
        />
      </div>
      <div className={styles.controls}>
        <div className={styles.controlGrid}>
          <label className={styles.control}>
            수평 반동 보정 <strong>{Math.round(aim.x * 100)}</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(aim.x * 100)}
              disabled={disabled}
              onChange={(event) =>
                setAimPoint({ ...aimRef.current, x: Number(event.target.value) / 100 })
              }
            />
          </label>
          <label className={styles.control}>
            수직 반동 보정 <strong>{Math.round(aim.y * 100)}</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(aim.y * 100)}
              disabled={disabled}
              onChange={(event) =>
                setAimPoint({ ...aimRef.current, y: Number(event.target.value) / 100 })
              }
            />
          </label>
          <div className={styles.control}>
            점사 제한 <strong>1.8초</strong>
            <div className={styles.meter} aria-label={`과열 ${Math.round((burstMs / 1_800) * 100)}%`}>
              <span
                style={
                  {
                    "--meter-value": Math.min(
                      100,
                      Math.round((burstMs / 1_800) * 100),
                    ),
                  } as CSSProperties
                }
              />
            </div>
          </div>
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.action}
            disabled={disabled}
            onPointerDown={beginFire}
            onPointerUp={ceaseFire}
            onPointerCancel={ceaseFire}
            aria-pressed={firing}
          >
            {firing ? "점사 중 — 떼서 냉각" : "길게 눌러 점사"}
          </button>
        </div>
      </div>
    </div>
  );
}
