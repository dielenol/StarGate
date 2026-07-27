"use client";

import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useState,
} from "react";

import type {
  TowaskiExplosiveLaunchLane,
  TowaskiExplosiveMunition,
} from "@/lib/equipment-shop/license-test-v2";

import type { TowaskiLicenseV2GameProps } from "./TowaskiLicenseV2Game";
import styles from "./TowaskiLicenseV2.module.css";

const FUSES = [1_000, 2_000, 3_000] as const;
const LANES: TowaskiExplosiveLaunchLane[] = ["left", "center", "right"];

export function TowaskiExplosiveGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV2GameProps) {
  const [munition, setMunition] =
    useState<TowaskiExplosiveMunition>("grenade");
  const [impact, setImpact] = useState({ x: 0.5, y: 0.5 });
  const [fuseMs, setFuseMs] = useState<(typeof FUSES)[number]>(2_000);
  const [launchLane, setLaunchLane] =
    useState<TowaskiExplosiveLaunchLane>("center");
  const [ready, setReady] = useState(false);

  const scenario =
    challenge.mode === "explosive" &&
    challenge.scenario.mode === "explosive"
      ? challenge.scenario
      : null;
  const progress =
    challenge.progress.mode === "explosive" ? challenge.progress : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 500);
    return () => window.clearTimeout(timer);
  }, [challenge.step]);

  if (!scenario || !progress) return null;

  function updateImpact(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setImpact({
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    });
  }

  return (
    <div className={`${styles.game} ${styles["game--explosive"]}`}>
      <div className={styles.hud}>
        <span>
          CLEAR <strong>{progress.successes} / 5</strong>
        </span>
        <span>
          CIVILIAN <strong>{progress.civilianHits}</strong>
        </span>
        <span>
          BACKBLAST <strong>{progress.backblastViolations}</strong>
        </span>
        <span>
          SCENE <strong>{challenge.step + 1} / 5</strong>
        </span>
      </div>
      <div
        className={styles.field}
        role="application"
        tabIndex={0}
        aria-label="폭발물 착탄 및 안전거리 계산 구역"
        onPointerDown={updateImpact}
      >
        <div className={styles.grid} aria-hidden />
        {scenario.hostileZones.map((zone) => (
          <span
            key={zone.id}
            className={`${styles.zone} ${styles["zone--hostile"]}`}
            style={
              {
                "--zone-x": zone.x,
                "--zone-y": zone.y,
                "--zone-radius": 0.06,
              } as CSSProperties
            }
            aria-hidden
          >
            HOSTILE
          </span>
        ))}
        {scenario.civilianZones.map((zone) => (
          <span
            key={zone.id}
            className={`${styles.zone} ${styles["zone--civilian"]}`}
            style={
              {
                "--zone-x": zone.x,
                "--zone-y": zone.y,
                "--zone-radius": 0.08,
              } as CSSProperties
            }
            aria-hidden
          >
            SAFE
          </span>
        ))}
        <span
          className={`${styles.zone} ${styles["zone--hazard"]}`}
          style={
            {
              "--zone-x": impact.x,
              "--zone-y": impact.y,
              "--zone-radius": scenario.blastRadius,
            } as CSSProperties
          }
          aria-hidden
        >
          BLAST
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
      </div>
      <div className={styles.controls}>
        <p className={styles.hint}>
          상황 판독: <strong>{scenario.requiredMunition === "rocket" ? "직사 고폭탄" : "투척 파편탄"}</strong>{" "}
          · 예상 신관 {scenario.targetFuseMs / 1_000}초 · 후방 장애물이 없는 발사선은{" "}
          {scenario.safeLaunchLane.toUpperCase()}입니다.
        </p>
        <div className={styles.controlGrid}>
          <div className={styles.control}>
            탄종 <strong>{munition.toUpperCase()}</strong>
            <div className={styles.actionRow}>
              {(["grenade", "rocket"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.choice}
                  aria-pressed={munition === value}
                  disabled={disabled}
                  onClick={() => setMunition(value)}
                >
                  {value === "grenade" ? "수류탄" : "로켓"}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.control}>
            신관 <strong>{fuseMs / 1_000}초</strong>
            <div className={styles.actionRow}>
              {FUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.choice}
                  aria-pressed={fuseMs === value}
                  disabled={disabled}
                  onClick={() => setFuseMs(value)}
                >
                  {value / 1_000}S
                </button>
              ))}
            </div>
          </div>
          <div className={styles.control}>
            발사선 <strong>{launchLane.toUpperCase()}</strong>
            <div className={styles.actionRow}>
              {LANES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.choice}
                  aria-pressed={launchLane === value}
                  disabled={disabled}
                  onClick={() => setLaunchLane(value)}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.action}
            disabled={disabled || !ready}
            onClick={() =>
              onResolve({
                mode: "explosive",
                munition,
                impactX: impact.x,
                impactY: impact.y,
                fuseMs,
                launchLane,
              })
            }
          >
            안전거리 확인 · 기폭
          </button>
        </div>
      </div>
    </div>
  );
}
