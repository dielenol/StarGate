import type { CSSProperties } from "react";

import { sectorRows, type SectorState } from "@/lib/maintenance/recovery";

import styles from "./SectorMatrix.module.css";

const STATE_LABELS: Record<SectorState, string> = {
  corrupted: "오염",
  quarantined: "격리",
  recovering: "복구 중",
  restored: "정상",
};

const STATE_ORDER: SectorState[] = ["corrupted", "quarantined", "recovering", "restored"];

export default function SectorMatrix({ progress }: { progress: number }) {
  const rows = sectorRows(progress);
  const totals = Object.fromEntries(STATE_ORDER.map((state) => [
    state,
    rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell === state).length, 0),
  ])) as Record<SectorState, number>;

  return (
    <section className={styles.matrix} aria-labelledby="sector-matrix-title">
      <header className={styles.matrix__head}>
        <h2 id="sector-matrix-title" className={styles.matrix__title}><span>SECTOR MATRIX</span>구역별 복구 현황</h2>
        <ul className={styles.matrix__legend}>
          {STATE_ORDER.map((state) => (
            <li key={state}>
              <i className={`${styles.matrix__swatch} ${styles[`matrix__cell--${state}`]}`} aria-hidden="true" />
              {STATE_LABELS[state]}{" "}<b>{totals[state]}</b>
            </li>
          ))}
        </ul>
      </header>
      <ol className={styles.matrix__rows}>
        {rows.map((row, rowIndex) => {
          const percent = Math.round(row.restored * 100);
          return (
            <li key={row.code} className={styles.matrix__row}>
              <span className={styles.matrix__label}><b>{row.code}</b>{row.label}</span>
              <span className={styles.matrix__cells} aria-hidden="true">
                {row.cells.map((state, column) => (
                  <i
                    key={column}
                    className={`${styles.matrix__cell} ${styles[`matrix__cell--${state}`]}`}
                    style={{ "--delay": `${((rowIndex * 7 + column * 13) % 23) * -0.11}s` } as CSSProperties}
                  />
                ))}
              </span>
              <span className={percent === 100 ? `${styles.matrix__percent} ${styles["matrix__percent--clear"]}` : styles.matrix__percent}>
                {percent}%
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
