"use client";

import Image from "next/image";
import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  TowaskiLicenseV3Scenario,
  TowaskiV3RangeProgress,
} from "@/lib/equipment-shop/license-test-v3";

import type { TowaskiLicenseV3GameProps } from "./TowaskiLicenseV3Game";
import styles from "./TowaskiLicenseV2.module.css";

type PrecisionScenario = Extract<
  TowaskiLicenseV3Scenario,
  { mode: "firearm" | "precision" | "heavy" }
>;

function clampAim(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function TowaskiPrecisionGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV3GameProps) {
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const keyboardAimRef = useRef({ x: 0.5, y: 0.5 });
  const [keyboardAim, setKeyboardAim] = useState({
    x: 0.5,
    y: 0.5,
    visible: false,
  });
  const scenario = challenge.scenario as PrecisionScenario;
  const progress = challenge.progress as TowaskiV3RangeProgress;

  useEffect(() => {
    startedAtRef.current = performance.now();
    submittedRef.current = false;
    const timer = window.setTimeout(() => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      onResolve({
        mode: "precision",
        fired: false,
        shots: 0,
        elapsedMs: scenario.windowMs,
      });
    }, scenario.windowMs);
    return () => window.clearTimeout(timer);
  }, [challenge.step, onResolve, scenario.windowMs]);

  if (challenge.mode !== "precision" || scenario.mode !== "precision") {
    return null;
  }

  function fireAt(aimX: number, aimY: number) {
    if (disabled || submittedRef.current) return;
    const elapsedMs = Math.round(performance.now() - startedAtRef.current);
    if (elapsedMs < 120) return;
    submittedRef.current = true;
    onResolve({
      mode: "precision",
      fired: true,
      shots: 1,
      aimX,
      aimY,
      elapsedMs,
    });
  }

  function fire(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    fireAt(
      (event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height,
    );
  }

  function moveKeyboardAim(deltaX: number, deltaY: number) {
    const next = {
      x: clampAim(keyboardAimRef.current.x + deltaX),
      y: clampAim(keyboardAimRef.current.y + deltaY),
    };
    keyboardAimRef.current = next;
    setKeyboardAim({ ...next, visible: true });
  }

  return (
    <div className={`${styles.game} ${styles["game--precision"]}`}>
      <div className={styles.hud}>
        <span>HIT <strong>{progress.hostileHits} / 10</strong></span>
        <span>NO FIRE <strong>{progress.civilianHits}</strong></span>
        <span>ACC <strong>{progress.shots ? Math.round(progress.hostileHits / progress.shots * 100) : 0}%</strong></span>
        <span>ROUND <strong>{challenge.step + 1} / 12</strong></span>
      </div>
      <div
        className={`${styles.field} ${styles.precisionRange}`}
        role="application"
        tabIndex={0}
        aria-label="25퍼센트 정밀 표적 시험장"
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
            moveKeyboardAim(delta[0], delta[1]);
            return;
          }
          if (
            (event.key === " " || event.key === "Enter") &&
            !event.repeat
          ) {
            event.preventDefault();
            fireAt(keyboardAimRef.current.x, keyboardAimRef.current.y);
          }
        }}
      >
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>1.125초</strong>
          기본 사격장의 25% 크기로 축소된 표적입니다. 보이는 원과 서버
          명중 반경은 같은 비율입니다. 방향키로 조준하고 Space로 발사합니다.
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
        {keyboardAim.visible ? (
          <span
            className={styles.reticle}
            style={
              {
                "--aim-x": keyboardAim.x,
                "--aim-y": keyboardAim.y,
              } as CSSProperties
            }
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}
