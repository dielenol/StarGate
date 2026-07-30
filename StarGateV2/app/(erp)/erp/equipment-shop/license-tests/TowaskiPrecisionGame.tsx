"use client";

import {
  type CSSProperties,
  type PointerEvent,
  useRef,
  useState,
} from "react";

import {
  TOWASKI_PRECISION_SCORING_RADIUS,
} from "@/lib/equipment-shop/license-test-v2";

import type { TowaskiLicenseV2GameProps } from "./TowaskiLicenseV2Game";
import styles from "./TowaskiLicenseV2.module.css";

export function TowaskiPrecisionGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV2GameProps) {
  const [aim, setAim] = useState({ x: 0.5, y: 0.5 });
  const [holdMs, setHoldMs] = useState(0);
  const holdStartedAt = useRef<number | null>(null);

  if (
    challenge.mode !== "precision" ||
    challenge.scenario.mode !== "precision" ||
    challenge.progress.mode !== "precision"
  ) {
    return null;
  }
  const scenario = challenge.scenario;
  const predictedImpact = {
    x: aim.x + scenario.wind.x,
    y: aim.y + scenario.wind.y,
  };
  const targetDistance = Math.hypot(
    predictedImpact.x - scenario.target.x,
    predictedImpact.y - scenario.target.y,
  );
  const protectedDistance = Math.hypot(
    predictedImpact.x - scenario.protectedZone.x,
    predictedImpact.y - scenario.protectedZone.y,
  );
  const onTarget = targetDistance <= TOWASKI_PRECISION_SCORING_RADIUS;
  const protectedRisk = protectedDistance <= scenario.protectedZone.radius;

  function updateAim(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setAim({
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    });
  }

  function startHold() {
    holdStartedAt.current = performance.now();
    setHoldMs(0);
  }

  function finishHold() {
    if (holdStartedAt.current === null) return;
    setHoldMs(Math.round(performance.now() - holdStartedAt.current));
    holdStartedAt.current = null;
  }

  return (
    <div className={`${styles.game} ${styles["game--precision"]}`}>
      <div className={styles.hud}>
        <span>
          SCORE <strong>{challenge.progress.score} / 12</strong>
        </span>
        <span>
          STABLE <strong>{challenge.progress.stableShots}</strong>
        </span>
        <span>
          RANGE <strong>{scenario.distanceMeters}M</strong>
        </span>
        <span>
          SHOT <strong>{challenge.step + 1} / 6</strong>
        </span>
      </div>
      <div
        className={styles.field}
        role="application"
        tabIndex={0}
        aria-label="정밀 사격 조준 구역"
        onPointerDown={updateAim}
      >
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>행동</strong>
          화면을 클릭하거나 슬라이더로 조준점을 옮기십시오. 적색 소형 원이
          목표이며 청색 SAFE 원은 탄착 금지입니다.
        </div>
        <span
          className={`${styles.zone} ${styles["zone--hostile"]}`}
          style={
            {
              "--zone-x": scenario.target.x,
              "--zone-y": scenario.target.y,
              "--zone-radius": TOWASKI_PRECISION_SCORING_RADIUS,
            } as CSSProperties
          }
          aria-hidden
        >
          TARGET
        </span>
        <span
          className={`${styles.zone} ${styles["zone--civilian"]}`}
          style={
            {
              "--zone-x": scenario.protectedZone.x,
              "--zone-y": scenario.protectedZone.y,
              "--zone-radius": scenario.protectedZone.radius,
            } as CSSProperties
          }
          aria-hidden
        >
          SAFE
        </span>
        <span
          className={styles.reticle}
          style={
            {
              "--aim-x": aim.x,
              "--aim-y": aim.y,
            } as CSSProperties
          }
          aria-hidden
        />
        <span
          className={[
            styles.statusBanner,
            protectedRisk ? styles["statusBanner--danger"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {protectedRisk
            ? "보호 구역 탄착 위험"
            : onTarget
              ? "예상 탄착: TARGET"
              : "예상 탄착: 표적 밖"}
        </span>
      </div>
      <div className={styles.controls}>
        <p className={styles.hint}>
          풍향 보정{" "}
          <strong>
            X {scenario.wind.x > 0 ? "+" : ""}
            {scenario.wind.x.toFixed(2)} · Y{" "}
            {scenario.wind.y > 0 ? "+" : ""}
            {scenario.wind.y.toFixed(2)}
          </strong>
          . 바람과 반대 방향으로 조준한 뒤 0.5초 이상 호흡을 고정하십시오.
        </p>
        <div className={styles.controlGrid}>
          <label className={styles.control}>
            수평 조준 <strong>{Math.round(aim.x * 100)}</strong>
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
            수직 조준 <strong>{Math.round(aim.y * 100)}</strong>
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
            호흡 안정 <strong>{holdMs}ms / 500ms</strong>
            <button
              type="button"
              className={styles.secondaryAction}
              disabled={disabled}
              onPointerDown={startHold}
              onPointerUp={finishHold}
              onPointerCancel={finishHold}
              onKeyDown={(event) => {
                if (event.key === " " && !event.repeat) startHold();
              }}
              onKeyUp={(event) => {
                if (event.key === " ") finishHold();
              }}
            >
              길게 눌러 호흡 고정
            </button>
          </div>
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.action}
            disabled={disabled || holdMs < 500}
            onClick={() =>
              onResolve({
                mode: "precision",
                aimX: aim.x,
                aimY: aim.y,
                holdMs,
              })
            }
          >
            단발 발사
          </button>
        </div>
      </div>
    </div>
  );
}
