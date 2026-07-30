"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
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
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [munition, setMunition] =
    useState<TowaskiExplosiveMunition | null>(null);
  const [impact, setImpact] = useState<{ x: number; y: number } | null>(null);
  const [fuseMs, setFuseMs] = useState<(typeof FUSES)[number] | null>(null);
  const [launchLane, setLaunchLane] =
    useState<TowaskiExplosiveLaunchLane | null>(null);
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
    if (disabled || stage !== 2) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setImpact({
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    });
  }

  function moveImpactWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || stage !== 2) return;
    const amount = event.shiftKey ? 0.08 : 0.04;
    const movement = {
      ArrowLeft: { x: -amount, y: 0 },
      ArrowRight: { x: amount, y: 0 },
      ArrowUp: { x: 0, y: -amount },
      ArrowDown: { x: 0, y: amount },
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    setImpact((current) => {
      const origin = current ?? { x: 0.5, y: 0.5 };
      return {
        x: Math.max(0, Math.min(1, origin.x + movement.x)),
        y: Math.max(0, Math.min(1, origin.y + movement.y)),
      };
    });
  }

  const munitionIntel =
    scenario.requiredMunition === "rocket"
      ? "강화 장갑 · 직사 고폭탄 필요"
      : "상부 개방 · 투척 파편탄 접근 가능";
  const fuseIntel =
    scenario.targetFuseMs === 1_000
      ? "근접 즉응 표적 · 1초 신관"
      : scenario.targetFuseMs === 2_000
        ? "중거리 고정 표적 · 2초 신관"
        : "원거리 엄폐 표적 · 3초 지연 신관";
  const laneIntel = LANES.map((lane) =>
    `${lane.toUpperCase()} ${
      lane === scenario.safeLaunchLane ? "CLEAR" : "BLOCKED"
    }`,
  ).join(" · ");

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
        onKeyDown={moveImpactWithKeyboard}
      >
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>현재 단계 {stage}/3</strong>
          {stage === 1
            ? "현장 정보에 맞는 탄종과 신관을 선택하십시오."
            : stage === 2
              ? "지도를 클릭해 적성 두 명만 점선 폭발 반경 안에 넣으십시오."
              : "후방 감시장치가 CLEAR인 발사선을 선택한 뒤 최종 기폭하십시오."}
        </div>
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
        {impact ? (
          <>
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
          </>
        ) : null}
      </div>
      <div className={styles.controls}>
        <div className={styles.decisionSteps} aria-label="폭발물 판단 단계">
          <span
            className={
              stage === 1
                ? styles["decisionSteps--active"]
                : styles["decisionSteps--done"]
            }
          >
            1 · 탄종 / 신관
          </span>
          <span
            className={
              stage === 2
                ? styles["decisionSteps--active"]
                : stage > 2
                  ? styles["decisionSteps--done"]
                  : ""
            }
          >
            2 · 폭발 반경
          </span>
          <span
            className={stage === 3 ? styles["decisionSteps--active"] : ""}
          >
            3 · 발사선
          </span>
        </div>

        {stage === 1 ? (
          <div className={styles.decisionPanel}>
            <h3>FIELD INTEL / 탄종·신관 판독</h3>
            <p>
              {munitionIntel} · {fuseIntel}
            </p>
            <div className={styles.choiceGrid}>
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
              {FUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.choice}
                  aria-pressed={fuseMs === value}
                  disabled={disabled}
                  onClick={() => setFuseMs(value)}
                >
                  {value / 1_000}초 신관
                </button>
              ))}
            </div>
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.action}
                disabled={disabled || !munition || !fuseMs}
                onClick={() => setStage(2)}
              >
                탄종·신관 확정 → 반경 배치
              </button>
            </div>
          </div>
        ) : stage === 2 ? (
          <div className={styles.decisionPanel}>
            <h3>BLAST MAP / 지도에서 직접 착탄점 지정</h3>
            <p>
              적성 HOSTILE 두 명은 점선 반경 안에, 청색 SAFE는 반경 밖에
              두십시오. 위 지도를 클릭하거나 방향키를 누르면 반경이
              이동합니다.
            </p>
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={disabled}
                onClick={() => setStage(1)}
              >
                이전 단계
              </button>
              <button
                type="button"
                className={styles.action}
                disabled={disabled || !impact}
                onClick={() => setStage(3)}
              >
                착탄점 확정 → 발사선 확인
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.decisionPanel}>
            <h3>BACKBLAST / 후방 감시장치</h3>
            <p>{laneIntel}</p>
            <div className={styles.launchLaneDiagram}>
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
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={disabled}
                onClick={() => setStage(2)}
              >
                착탄점 다시 지정
              </button>
              <button
                type="button"
                className={styles.action}
                disabled={
                  disabled ||
                  !ready ||
                  !munition ||
                  !fuseMs ||
                  !impact ||
                  !launchLane
                }
                onClick={() => {
                  if (!munition || !fuseMs || !impact || !launchLane) return;
                  onResolve({
                    mode: "explosive",
                    munition,
                    impactX: impact.x,
                    impactY: impact.y,
                    fuseMs,
                    launchLane,
                  });
                }}
              >
                3단계 확인 완료 · 기폭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
