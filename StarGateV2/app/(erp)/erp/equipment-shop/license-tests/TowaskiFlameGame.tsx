"use client";

import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { TowaskiTimedPointerSample } from "@/lib/equipment-shop/license-test-v2";

import type { TowaskiLicenseV2GameProps } from "./TowaskiLicenseV2Game";
import styles from "./TowaskiLicenseV2.module.css";

export function TowaskiFlameGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV2GameProps) {
  const [aim, setAim] = useState({ x: 0.5, y: 0.82 });
  const [samples, setSamples] = useState<TowaskiTimedPointerSample[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef(0);
  const lastSampleAtRef = useRef(-100);

  const scenario =
    challenge.mode === "flame" && challenge.scenario.mode === "flame"
      ? challenge.scenario
      : null;
  const progress =
    challenge.progress.mode === "flame" ? challenge.progress : null;

  useEffect(() => {
    startedAtRef.current = performance.now();
    lastSampleAtRef.current = -100;
    const timer = window.setInterval(() => {
      setElapsedMs(Math.round(performance.now() - startedAtRef.current));
    }, 100);
    return () => window.clearInterval(timer);
  }, [challenge.step]);

  if (!scenario || !progress) return null;

  const durationMs = scenario.durationMs;
  const fuelRemaining = Math.max(0, Math.round(100 - samples.length * 0.7));

  function addSample(point: { x: number; y: number }) {
    const t = Math.min(
      durationMs,
      Math.round(performance.now() - startedAtRef.current),
    );
    if (t - lastSampleAtRef.current < 80) return;
    lastSampleAtRef.current = t;
    setAim(point);
    setSamples((current) =>
      current.length >= 160
        ? current
        : [...current, { t, ...point, active: true }],
    );
  }

  function pointFromEvent(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  return (
    <div className={`${styles.game} ${styles["game--flame"]}`}>
      <div className={styles.hud}>
        <span>
          COVERAGE <strong>{Math.round((progress.coverageTotal / Math.max(1, progress.step)) * 100)}%</strong>
        </span>
        <span>
          FUEL <strong>{fuelRemaining}%</strong>
        </span>
        <span>
          COLLATERAL <strong>{progress.civilianExposures + progress.fuelTankIgnitions}</strong>
        </span>
        <span>
          ZONE <strong>{challenge.step + 1} / 3</strong>
        </span>
      </div>
      <div
        className={styles.field}
        role="application"
        tabIndex={0}
        aria-label="화염 장비 확산 제어 구역"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          addSample(pointFromEvent(event));
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            addSample(pointFromEvent(event));
          }
        }}
        onPointerUp={(event) => addSample(pointFromEvent(event))}
      >
        <div className={styles.grid} aria-hidden />
        <svg
          className={styles.flameCone}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polygon
            points={`50,100 ${Math.max(0, aim.x * 100 - 7)},${aim.y * 100} ${Math.min(100, aim.x * 100 + 7)},${aim.y * 100}`}
          />
        </svg>
        {scenario.hostileZones.map((zone) => (
          <span
            key={zone.id}
            className={`${styles.zone} ${styles["zone--hostile"]}`}
            style={
              {
                "--zone-x": zone.x,
                "--zone-y": zone.y,
                "--zone-radius": zone.radius,
              } as CSSProperties
            }
            aria-hidden
          >
            BURN
          </span>
        ))}
        <span
          className={`${styles.zone} ${styles["zone--civilian"]}`}
          style={
            {
              "--zone-x": scenario.civilianZone.x,
              "--zone-y": scenario.civilianZone.y,
              "--zone-radius": scenario.civilianZone.radius,
            } as CSSProperties
          }
          aria-hidden
        >
          SAFE
        </span>
        <span
          className={`${styles.zone} ${styles["zone--hazard"]}`}
          style={
            {
              "--zone-x": scenario.fuelTankZone.x,
              "--zone-y": scenario.fuelTankZone.y,
              "--zone-radius": scenario.fuelTankZone.radius,
            } as CSSProperties
          }
          aria-hidden
        >
          FUEL
        </span>
        {samples.slice(-48).map((sample, index) => (
          <span
            key={`${sample.t}-${index}`}
            className={styles.trailDot}
            style={
              {
                "--trail-x": sample.x,
                "--trail-y": sample.y,
                opacity: 0.3 + index / 72,
              } as CSSProperties
            }
            aria-hidden
          />
        ))}
      </div>
      <div className={styles.controls}>
        <p className={styles.hint}>
          <strong>적성 구역을 80% 이상 소각</strong>하되 청색 보호 구역과
          점선 연료통을 피하십시오.
        </p>
        <div className={styles.controlGrid}>
          <label className={styles.control}>
            노즐 수평 <strong>{Math.round(aim.x * 100)}</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(aim.x * 100)}
              disabled={disabled}
              onChange={(event) =>
                setAim((value) => ({
                  ...value,
                  x: Number(event.target.value) / 100,
                }))
              }
            />
          </label>
          <label className={styles.control}>
            노즐 수직 <strong>{Math.round(aim.y * 100)}</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(aim.y * 100)}
              disabled={disabled}
              onChange={(event) =>
                setAim((value) => ({
                  ...value,
                  y: Number(event.target.value) / 100,
                }))
              }
            />
          </label>
          <div className={styles.control}>
            경과 시간 <strong>{Math.min(12, Math.floor(elapsedMs / 1_000))}초</strong>
            <button
              type="button"
              className={styles.secondaryAction}
              disabled={disabled || samples.length >= 160}
              onClick={() => addSample(aim)}
            >
              현재 위치 분사
            </button>
          </div>
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.action}
            disabled={disabled || elapsedMs < 1_000 || samples.length === 0}
            onClick={() => onResolve({ mode: "flame", samples })}
          >
            분사 종료 · 판정
          </button>
        </div>
      </div>
    </div>
  );
}
