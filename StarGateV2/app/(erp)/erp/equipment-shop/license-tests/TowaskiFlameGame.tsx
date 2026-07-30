"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  evaluateTowaskiFlamePlacement,
  type TowaskiV3FlameDirection,
  type TowaskiV3FlameProgress,
  type TowaskiV3FlameScenario,
  type TowaskiV3GridPoint,
} from "@/lib/equipment-shop/license-test-v3";

import type { TowaskiLicenseV3GameProps } from "./TowaskiLicenseV3Game";
import styles from "./TowaskiLicenseV2.module.css";

const DIRECTIONS = [
  ["up", "↑ 위"],
  ["right", "→ 오른쪽"],
  ["down", "↓ 아래"],
  ["left", "← 왼쪽"],
] as const satisfies ReadonlyArray<
  readonly [TowaskiV3FlameDirection, string]
>;

function samePoint(first: TowaskiV3GridPoint, second: TowaskiV3GridPoint) {
  return first.x === second.x && first.y === second.y;
}

export function TowaskiFlameGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV3GameProps) {
  const scenario = challenge.scenario as TowaskiV3FlameScenario;
  const progress = challenge.progress as TowaskiV3FlameProgress;
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const startRef = useRef<TowaskiV3GridPoint | null>(null);
  const directionRef = useRef<TowaskiV3FlameDirection>("right");
  const [start, setStart] = useState<TowaskiV3GridPoint | null>(null);
  const [hoveredStart, setHoveredStart] =
    useState<TowaskiV3GridPoint | null>(null);
  const [direction, setDirection] =
    useState<TowaskiV3FlameDirection>("right");
  const [remainingSeconds, setRemainingSeconds] = useState(18);

  const previewStart = hoveredStart ?? start;
  const placement = useMemo(
    () =>
      previewStart
        ? evaluateTowaskiFlamePlacement(scenario, previewStart, direction)
        : null,
    [direction, previewStart, scenario],
  );
  const route = placement?.cells ?? null;
  const safePlacement = Boolean(
    route &&
      placement &&
      placement.hostilesBlocked >= 2 &&
      !placement.allyHit &&
      !placement.fuelHit &&
      !placement.retreatHit,
  );

  useEffect(() => {
    startedAtRef.current = performance.now();
    submittedRef.current = false;
    startRef.current = null;
    directionRef.current = "right";
    const timer = window.setInterval(() => {
      const elapsed = Math.round(performance.now() - startedAtRef.current);
      setRemainingSeconds(
        Math.max(0, Math.ceil((scenario.durationMs - elapsed) / 1_000)),
      );
      if (elapsed >= scenario.durationMs && !submittedRef.current) {
        submittedRef.current = true;
        window.clearInterval(timer);
        onResolve({
          mode: "flame",
          start: startRef.current ?? { x: 0, y: 0 },
          direction: startRef.current ? directionRef.current : "left",
          elapsedMs: scenario.durationMs,
        });
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [challenge.step, onResolve, scenario.durationMs]);

  if (challenge.mode !== "flame" || scenario.mode !== "flame") return null;

  function selectCell(point: TowaskiV3GridPoint) {
    if (disabled) return;
    startRef.current = point;
    setStart(point);
    setHoveredStart(null);
  }

  function selectDirection(nextDirection: TowaskiV3FlameDirection) {
    if (disabled) return;
    directionRef.current = nextDirection;
    setDirection(nextDirection);
  }

  function submit() {
    if (!start || !route || disabled || submittedRef.current) return;
    submittedRef.current = true;
    onResolve({
      mode: "flame",
      start,
      direction,
      elapsedMs: Math.round(performance.now() - startedAtRef.current),
    });
  }

  return (
    <div className={`${styles.game} ${styles["game--flame"]}`}>
      <div className={styles.hud}>
        <span>MAP <strong>{challenge.step + 1} / 3</strong></span>
        <span>CLEAR <strong>{progress.successfulRoutes} / 3</strong></span>
        <span>BLOCK <strong>{progress.hostilesBlocked}</strong></span>
        <span>TIME <strong>{remainingSeconds}s</strong></span>
      </div>
      <div className={`${styles.field} ${styles.flameGridField}`}>
        <div className={styles.coachmark}>
          <strong>향후 3라운드 경로 / 정확히 3칸</strong>
          시작 칸과 상하좌우 방향을 정하십시오. 서로 다른 적성 경로 2개를
          막고 ALLY·FUEL·EXIT 경로는 모두 피해야 합니다.
        </div>
        <div
          className={styles.flameGrid}
          role="grid"
          aria-label="7열 5행, 향후 3라운드 화염 차단 격자"
          onPointerLeave={() => setHoveredStart(null)}
        >
          {Array.from(
            { length: scenario.height * scenario.width },
            (_, index) => {
              const point = {
                x: index % scenario.width,
                y: Math.floor(index / scenario.width),
              };
              const hostileMarkers = scenario.hostilePaths.flatMap((path) =>
                path.cells.flatMap((value, round) =>
                  samePoint(value, point) ? [`${path.id}·R${round + 1}`] : [],
                ),
              );
              const allyMarkers = scenario.allyPath.cells.flatMap(
                (value, round) =>
                  samePoint(value, point) ? [`ALLY·R${round + 1}`] : [],
              );
              const retreatMarkers = scenario.retreatPath.cells.flatMap(
                (value, round) =>
                  samePoint(value, point) ? [`EXIT·R${round + 1}`] : [],
              );
              const fuel = samePoint(scenario.fuel, point);
              const selected = Boolean(
                route?.some((value) => samePoint(value, point)),
              );
              const markers = [
                ...hostileMarkers,
                ...allyMarkers,
                ...(fuel ? ["FUEL"] : []),
                ...retreatMarkers,
              ];
              const cellKind = allyMarkers.length
                ? "ally"
                : fuel
                  ? "fuel"
                  : retreatMarkers.length
                    ? "retreat"
                    : hostileMarkers.length
                      ? "hostile"
                      : "clear";
              return (
                <button
                  key={`${point.x}-${point.y}`}
                  type="button"
                  role="gridcell"
                  className={[
                    styles.flameCell,
                    styles[`flameCell--${cellKind}`],
                    selected ? styles["flameCell--selected"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={disabled}
                  onClick={() => selectCell(point)}
                  onFocus={() => setHoveredStart(point)}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== "touch") setHoveredStart(point);
                  }}
                  onKeyDown={(event) => {
                    const keyDirection: Partial<
                      Record<string, TowaskiV3FlameDirection>
                    > = {
                      ArrowUp: "up",
                      ArrowRight: "right",
                      ArrowDown: "down",
                      ArrowLeft: "left",
                    };
                    const nextDirection = keyDirection[event.key];
                    if (nextDirection) {
                      event.preventDefault();
                      selectCell(point);
                      selectDirection(nextDirection);
                    }
                  }}
                  aria-label={`${point.x + 1}열 ${point.y + 1}행 ${
                    markers.join(", ") || "CLEAR"
                  }`}
                >
                  <span>{markers.join(" ") || "·"}</span>
                </button>
              );
            },
          )}
        </div>
        <div className={styles.flamePreview} aria-live="polite">
          <span>
            3칸 {route ? "VALID" : "OUT OF GRID"}
          </span>
          <span>적성 경로 {placement?.hostilesBlocked ?? 0} / 2</span>
          <span>
            안전 충돌{" "}
            {placement
              ? Number(placement.allyHit) +
                Number(placement.fuelHit) +
                Number(placement.retreatHit)
              : 0}
          </span>
          <strong>{safePlacement ? "배치 안전" : "충돌 결과 확인 필요"}</strong>
        </div>
      </div>
      <div className={styles.controls}>
        <div className={styles.directionGrid} aria-label="소이선 방향">
          {DIRECTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={styles.choice}
              aria-pressed={direction === value}
              disabled={disabled}
              onClick={() => selectDirection(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={disabled}
            onClick={() => {
              startRef.current = null;
              setStart(null);
              setHoveredStart(null);
            }}
          >
            시작 칸 초기화
          </button>
          <button
            type="button"
            className={styles.action}
            disabled={disabled || !start || !route}
            onClick={submit}
          >
            3칸 소이선 확정
          </button>
        </div>
      </div>
    </div>
  );
}
