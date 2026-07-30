"use client";

import {
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  TowaskiV3ExplosiveDisposition,
  TowaskiV3ExplosiveProgress,
  TowaskiV3ExplosiveScenario,
} from "@/lib/equipment-shop/license-test-v3";

import type { TowaskiLicenseV3GameProps } from "./TowaskiLicenseV3Game";
import styles from "./TowaskiLicenseV2.module.css";

const DISPOSITIONS = [
  ["release", "RELEASE / 반출"],
  ["service", "SERVICE / 정비"],
  ["quarantine", "QUARANTINE / 격리"],
] as const satisfies ReadonlyArray<
  readonly [TowaskiV3ExplosiveDisposition, string]
>;

export function TowaskiExplosiveGame({
  challenge,
  disabled,
  onResolve,
}: TowaskiLicenseV3GameProps) {
  const scenario = challenge.scenario as TowaskiV3ExplosiveScenario;
  const progress = challenge.progress as TowaskiV3ExplosiveProgress;
  const startedAtRef = useRef(0);
  const submittedRef = useRef(false);
  const decisionsRef = useRef<
    Record<string, TowaskiV3ExplosiveDisposition>
  >({});
  const [decisions, setDecisions] = useState<
    Record<string, TowaskiV3ExplosiveDisposition>
  >({});
  const [remainingSeconds, setRemainingSeconds] = useState(30);

  useEffect(() => {
    startedAtRef.current = performance.now();
    submittedRef.current = false;
    decisionsRef.current = {};
    const timer = window.setInterval(() => {
      const elapsed = Math.round(performance.now() - startedAtRef.current);
      setRemainingSeconds(Math.max(0, Math.ceil((scenario.durationMs - elapsed) / 1_000)));
      if (elapsed >= scenario.durationMs && !submittedRef.current) {
        submittedRef.current = true;
        window.clearInterval(timer);
        onResolve({
          mode: "explosive",
          decisions: scenario.items.map((item) => ({
            itemId: item.id,
            disposition: decisionsRef.current[item.id] ?? "service",
          })),
          elapsedMs: scenario.durationMs,
        });
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [challenge.step, onResolve, scenario]);

  if (challenge.mode !== "explosive" || scenario.mode !== "explosive") {
    return null;
  }

  function classify(
    itemId: string,
    disposition: TowaskiV3ExplosiveDisposition,
  ) {
    const next = { ...decisionsRef.current, [itemId]: disposition };
    decisionsRef.current = next;
    setDecisions(next);
  }

  function dropInto(
    event: DragEvent<HTMLDivElement>,
    disposition: TowaskiV3ExplosiveDisposition,
  ) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain");
    if (scenario.items.some((item) => item.id === itemId)) {
      classify(itemId, disposition);
    }
  }

  function submit() {
    if (
      disabled ||
      submittedRef.current ||
      scenario.items.some((item) => !decisionsRef.current[item.id])
    ) {
      return;
    }
    submittedRef.current = true;
    onResolve({
      mode: "explosive",
      decisions: scenario.items.map((item) => ({
        itemId: item.id,
        disposition: decisionsRef.current[item.id]!,
      })),
      elapsedMs: Math.round(performance.now() - startedAtRef.current),
    });
  }

  return (
    <div className={`${styles.game} ${styles["game--explosive"]}`}>
      <div className={styles.hud}>
        <span>MANIFEST <strong>{challenge.step + 1} / 2</strong></span>
        <span>TYPE <strong>{scenario.munition.toUpperCase()}</strong></span>
        <span>CORRECT <strong>{progress.correctDecisions} / 10</strong></span>
        <span>TIME <strong>{remainingSeconds}s</strong></span>
      </div>
      <div className={`${styles.field} ${styles.manifestField}`}>
        <div className={styles.grid} aria-hidden />
        <div className={styles.coachmark}>
          <strong>3 RELEASE · 1 SERVICE · 1 QUARANTINE</strong>
          안전장치·외피·봉인·점검값을 교차 확인하십시오. 카드를 분류 칸으로
          끌거나 카드의 버튼을 눌러 지정할 수 있습니다. 정상 A값은 반출,
          봉인이 유지된 C값은 정비, BROKEN·RED·X값은 격리입니다.
        </div>
        <div className={styles.manifestBins}>
          {DISPOSITIONS.map(([value, label]) => (
            <div
              key={value}
              className={styles.manifestBin}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropInto(event, value)}
              aria-label={`${label} 드롭 영역`}
            >
              <strong>{label}</strong>
              <span>
                {
                  Object.values(decisions).filter(
                    (decision) => decision === value,
                  ).length
                }
              </span>
            </div>
          ))}
        </div>
        <div className={styles.manifestList}>
          {scenario.items.map((item) => (
            <article
              className={styles.manifestItem}
              key={item.id}
              draggable={!disabled}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", item.id);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <header>
                <strong>{item.serial}</strong>
                <span>
                  {decisions[item.id]
                    ? `분류: ${decisions[item.id].toUpperCase()}`
                    : "미분류"}
                </span>
              </header>
              <dl className={styles.inspectionGrid}>
                <div>
                  <dt>SAFETY</dt>
                  <dd>{item.inspection.safetyDevice}</dd>
                </div>
                <div>
                  <dt>CASING</dt>
                  <dd>{item.inspection.casing}</dd>
                </div>
                <div>
                  <dt>SEAL</dt>
                  <dd>{item.inspection.seal}</dd>
                </div>
                <div>
                  <dt>CHECK</dt>
                  <dd>{item.inspection.inspectionValue}</dd>
                </div>
              </dl>
              <div className={styles.choiceGrid}>
                {DISPOSITIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.choice}
                    aria-pressed={decisions[item.id] === value}
                    disabled={disabled}
                    onClick={() => classify(item.id, value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className={styles.controls}>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.action}
            disabled={
              disabled ||
              scenario.items.some((item) => !decisions[item.id])
            }
            onClick={submit}
          >
            명세서 판정 제출
          </button>
        </div>
      </div>
    </div>
  );
}
