"use client";

import Image from "next/image";
import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  computeTowaskiHeavyImpact,
  type TowaskiLicenseV3Scenario,
  type TowaskiV3RangeProgress,
} from "@/lib/equipment-shop/license-test-v3";

import type { TowaskiLicenseV3GameProps } from "./TowaskiLicenseV3Game";
import styles from "./TowaskiLicenseV2.module.css";

type HeavyScenario = Extract<
  TowaskiLicenseV3Scenario,
  { mode: "firearm" | "precision" | "heavy" }
>;

function clampAim(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function TowaskiHeavyGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV3GameProps) {
  const scenario = challenge.scenario as HeavyScenario;
  const progress = challenge.progress as TowaskiV3RangeProgress;
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const baseAimRef = useRef({ x: 0.5, y: 0.5 });
  const [impact, setImpact] = useState({ x: 0.5, y: 0.5 });
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    startedAtRef.current = performance.now();
    submittedRef.current = false;
    const timer = window.setInterval(() => {
      const elapsed = Math.min(
        scenario.windowMs,
        Math.round(performance.now() - startedAtRef.current),
      );
      setElapsedMs(elapsed);
      setImpact(computeTowaskiHeavyImpact(scenario, baseAimRef.current, elapsed));
      if (elapsed >= scenario.windowMs) {
        window.clearInterval(timer);
        if (!submittedRef.current) {
          submittedRef.current = true;
          onResolve({
            mode: "heavy",
            fired: false,
            shots: 0,
            elapsedMs: scenario.windowMs,
          });
        }
      }
    }, 40);
    return () => window.clearInterval(timer);
  }, [challenge.step, onResolve, scenario]);

  if (challenge.mode !== "heavy" || scenario.mode !== "heavy") return null;

  function pointFromEvent(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function aim(event: PointerEvent<HTMLDivElement>) {
    const base = pointFromEvent(event);
    baseAimRef.current = base;
    const elapsed = Math.round(performance.now() - startedAtRef.current);
    setImpact(computeTowaskiHeavyImpact(scenario, base, elapsed));
  }

  function fire(event: PointerEvent<HTMLDivElement>) {
    if (disabled || submittedRef.current) return;
    const base = pointFromEvent(event);
    const elapsed = Math.round(performance.now() - startedAtRef.current);
    baseAimRef.current = base;
    submittedRef.current = true;
    onResolve({
      mode: "heavy",
      fired: true,
      shots: 1,
      aimX: base.x,
      aimY: base.y,
      elapsedMs: elapsed,
    });
  }

  function fireAtCurrentAim() {
    if (disabled || submittedRef.current) return;
    const elapsed = Math.round(performance.now() - startedAtRef.current);
    submittedRef.current = true;
    onResolve({
      mode: "heavy",
      fired: true,
      shots: 1,
      aimX: baseAimRef.current.x,
      aimY: baseAimRef.current.y,
      elapsedMs: elapsed,
    });
  }

  function moveBaseAim(deltaX: number, deltaY: number) {
    const base = {
      x: clampAim(baseAimRef.current.x + deltaX),
      y: clampAim(baseAimRef.current.y + deltaY),
    };
    const elapsed = Math.round(performance.now() - startedAtRef.current);
    baseAimRef.current = base;
    setImpact(computeTowaskiHeavyImpact(scenario, base, elapsed));
  }

  function noFire() {
    if (disabled || submittedRef.current || elapsedMs < 120) return;
    submittedRef.current = true;
    onResolve({
      mode: "heavy",
      fired: false,
      shots: 0,
      elapsedMs,
    });
  }

  return (
    <div className={`${styles.game} ${styles["game--heavy"]}`}>
      <div className={styles.hud}>
        <span>HIT <strong>{progress.hostileHits} / 10</strong></span>
        <span>NO FIRE <strong>{progress.civilianHits}</strong></span>
        <span>SHOTS <strong>{progress.shots}</strong></span>
        <span>ROUND <strong>{challenge.step + 1} / 12</strong></span>
      </div>
      <div
        className={`${styles.field} ${styles.heavyRange}`}
        role="application"
        tabIndex={0}
        aria-label="결정론적 조준 흔들림 중화기 시험장"
        onPointerMove={aim}
        onPointerDown={fire}
        onKeyDown={(event) => {
          const movement: Partial<Record<string, readonly [number, number]>> = {
            ArrowUp: [0, -0.025],
            ArrowRight: [0.025, 0],
            ArrowDown: [0, 0.025],
            ArrowLeft: [-0.025, 0],
          };
          const delta = movement[event.key];
          if (delta) {
            event.preventDefault();
            moveBaseAim(delta[0], delta[1]);
            return;
          }
          if (
            (event.key === " " || event.key === "Enter") &&
            !event.repeat
          ) {
            event.preventDefault();
            fireAtCurrentAim();
          }
        }}
      >
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>80ms 결정 패턴 / 프레임 보간</strong>
          시스템 커서는 숨겨집니다. 마우스 또는 방향키로 기본 조준점을
          움직이고, 흔들리는 전자 조준점이 THREAT에 닿을 때 단발 사격하십시오.
        </div>
        <span
          className={styles.targetButton}
          style={
            {
              "--target-x": scenario.x,
              "--target-y": scenario.y,
              "--v3-target-scale": scenario.visibleScale,
            } as CSSProperties
          }
          aria-hidden
        >
          <Image
            src="/assets/equipment-shop/training-target.webp"
            width={226}
            height={438}
            alt=""
            draggable={false}
            unoptimized
          />
          <span>{scenario.kind === "hostile" ? "THREAT" : "NO FIRE"}</span>
        </span>
        <span
          className={styles.reticle}
          style={
            {
              "--aim-x": impact.x,
              "--aim-y": impact.y,
            } as CSSProperties
          }
          aria-hidden
        />
        <span className={styles.statusBanner}>
          JITTER ±8% X / ±10% Y · {Math.max(0, 3_000 - elapsedMs)}ms
        </span>
      </div>
      <div className={styles.controls}>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={disabled || elapsedMs < 120}
            onClick={noFire}
          >
            NO FIRE / 사격 보류
          </button>
        </div>
      </div>
    </div>
  );
}
