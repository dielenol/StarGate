"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
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
  const [spraying, setSpraying] = useState(false);
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
  const activeSamples = samples.filter((sample) => sample.active);
  const fuelRemaining = Math.max(
    0,
    Math.round(100 - activeSamples.length * 0.7),
  );
  const visitedZoneIds = new Set(
    scenario.hostileZones
      .filter((zone) =>
        activeSamples.some(
          (sample) =>
            Math.hypot(sample.x - zone.x, sample.y - zone.y) <= zone.radius,
        ),
      )
      .map((zone) => zone.id),
  );
  const protectedRisk = activeSamples.some(
    (sample) =>
      Math.hypot(
        sample.x - scenario.civilianZone.x,
        sample.y - scenario.civilianZone.y,
      ) <= scenario.civilianZone.radius ||
      Math.hypot(
        sample.x - scenario.fuelTankZone.x,
        sample.y - scenario.fuelTankZone.y,
      ) <= scenario.fuelTankZone.radius,
  );

  function addSample(point: { x: number; y: number }) {
    const t = Math.min(
      durationMs,
      Math.round(performance.now() - startedAtRef.current),
    );
    if (t - lastSampleAtRef.current < 100) return;
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
          setSpraying(true);
          addSample(pointFromEvent(event));
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            addSample(pointFromEvent(event));
          }
        }}
        onPointerUp={(event) => {
          addSample(pointFromEvent(event));
          setSpraying(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => setSpraying(false)}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (disabled) return;
          const amount = event.shiftKey ? 0.08 : 0.04;
          if (event.key === " ") {
            event.preventDefault();
            addSample(aim);
            return;
          }
          const movement = {
            ArrowLeft: { x: -amount, y: 0 },
            ArrowRight: { x: amount, y: 0 },
            ArrowUp: { x: 0, y: -amount },
            ArrowDown: { x: 0, y: amount },
          }[event.key];
          if (!movement) return;
          event.preventDefault();
          setAim((current) => ({
            x: Math.max(0, Math.min(1, current.x + movement.x)),
            y: Math.max(0, Math.min(1, current.y + movement.y)),
          }));
        }}
      >
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>분사 경로</strong>
          시험장을 누른 채 적색 BURN 지점을 따라 끌고, 청색 SAFE와 황색
          FUEL 앞에서는 손을 떼어 분사를 끊은 뒤 다른 위치에서 다시
          시작하십시오. 키보드는 방향키로 조준하고 Space로 분사합니다.
        </div>
        {scenario.hostileZones.map((zone) => (
          <span
            key={zone.id}
            className={[
              styles.zone,
              styles["zone--hostile"],
              visitedZoneIds.has(zone.id) ? styles["zone--visited"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              {
                "--zone-x": zone.x,
                "--zone-y": zone.y,
                "--zone-radius": zone.radius,
              } as CSSProperties
            }
            aria-hidden
          >
            {visitedZoneIds.has(zone.id) ? "BURNED" : "BURN"}
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
          aria-live="polite"
        >
          {protectedRisk
            ? "보호 구역 노출 — 경로 실패"
            : spraying
              ? `분사 중 · 소각 ${visitedZoneIds.size}/5`
              : `분사 중지 · 소각 ${visitedZoneIds.size}/5`}
        </span>
      </div>
      <div className={styles.controls}>
        <p className={styles.hint}>
          <strong>적색 소각 지점 5곳 중 4곳 이상</strong>을 경로로
          통과하십시오. 연료는 경로를 그릴 때만 소모되며, 손을 떼면 즉시
          분사가 멈춥니다.
        </p>
        <div className={styles.checklist} aria-label="화염 경로 판정 상태">
          <span
            className={
              visitedZoneIds.size >= 4 ? styles["checklist--ready"] : ""
            }
          >
            소각 지점 {visitedZoneIds.size} / 5
          </span>
          <span
            className={
              fuelRemaining >= 10
                ? styles["checklist--ready"]
                : styles["checklist--danger"]
            }
          >
            연료 {fuelRemaining}%
          </span>
          <span
            className={
              protectedRisk
                ? styles["checklist--danger"]
                : styles["checklist--ready"]
            }
          >
            보호 구역 {protectedRisk ? "노출" : "안전"}
          </span>
          <span>경과 {Math.min(12, Math.floor(elapsedMs / 1_000))}초</span>
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.action}
            disabled={
              disabled ||
              elapsedMs < 1_000 ||
              visitedZoneIds.size < 4 ||
              protectedRisk ||
              fuelRemaining < 10
            }
            onClick={() => onResolve({ mode: "flame", samples })}
          >
            분사 종료 · 판정
          </button>
        </div>
      </div>
    </div>
  );
}
