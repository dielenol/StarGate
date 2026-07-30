"use client";

import Image from "next/image";
import { type CSSProperties, useEffect, useState } from "react";

import type { TowaskiFirearmScenario } from "@/lib/equipment-shop/license-test-v2";

import type { TowaskiLicenseV2GameProps } from "./TowaskiLicenseV2Game";
import styles from "./TowaskiLicenseV2.module.css";

export function TowaskiFirearmGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV2GameProps) {
  const [identificationReady, setIdentificationReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIdentificationReady(true), 1_200);
    return () => window.clearTimeout(timer);
  }, []);

  if (
    challenge.mode !== "firearm" ||
    challenge.scenario.mode !== "firearm" ||
    challenge.progress.mode !== "firearm"
  ) {
    return null;
  }
  const scenario: TowaskiFirearmScenario = challenge.scenario;

  return (
    <div className={`${styles.game} ${styles["game--firearm"]}`}>
      <div className={styles.hud}>
        <span>
          THREAT <strong>{challenge.progress.hostileHits}</strong>
        </span>
        <span>
          NO FIRE <strong>{challenge.progress.civilianHits}</strong>
        </span>
        <span>
          SHOTS <strong>{challenge.progress.shots}</strong>
        </span>
        <span>
          ROUND <strong>{challenge.step + 1} / 12</strong>
        </span>
      </div>
      <div
        className={styles.field}
        onClick={() =>
          !disabled && onResolve({ mode: "firearm", fired: true, shots: 1 })
        }
        role="application"
        aria-label="기본 화기 안전 식별 시험장"
      >
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>행동</strong>
          THREAT 표적은 직접 클릭해 한 발 사격하고, NO FIRE 표적은 아래
          사격 보류 버튼으로 통과하십시오.
        </div>
        <button
          type="button"
          className={styles.targetButton}
          style={
            {
              "--target-x": scenario.x,
              "--target-y": scenario.y,
            } as CSSProperties
          }
          disabled={disabled || !identificationReady}
          onClick={(event) => {
            event.stopPropagation();
            onResolve({
              mode: "firearm",
              targetId: scenario.id,
              fired: true,
              shots: 1,
            });
          }}
          aria-label={
            scenario.kind === "hostile"
              ? "적성 표적 사격"
              : "민간 표적, 사격 금지"
          }
        >
          <Image
            src="/assets/equipment-shop/training-target.png"
            width={226}
            height={438}
            alt=""
            aria-hidden
            draggable={false}
            unoptimized
          />
          <span>
            {scenario.kind === "hostile" ? "THREAT" : "NO FIRE"}
          </span>
        </button>
      </div>
      <div className={styles.controls}>
        <p className={styles.hint}>
          <strong aria-live="polite">
            {identificationReady ? "식별 완료." : "표적 판독 중…"}
          </strong>{" "}
          민간 표적이면 방아쇠를 당기지 않고 사격 보류를 선택하십시오.
        </p>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={disabled || !identificationReady}
            onClick={() =>
              onResolve({ mode: "firearm", fired: false, shots: 0 })
            }
          >
            사격 보류 / NO FIRE
          </button>
        </div>
      </div>
    </div>
  );
}
