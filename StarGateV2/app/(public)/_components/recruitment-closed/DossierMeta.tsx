import styles from "./closed-state.module.css";

export interface DossierRow {
  k: string;
  v: string;
  /** 상태 행은 danger 색으로 강조 */
  status?: boolean;
}

interface Props {
  rows: DossierRow[];
  note?: React.ReactNode;
}

/** DOSSIER / STATUS / SEALED AT / AUTHORITY 메타데이터 블록 */
export default function DossierMeta({ rows, note }: Props) {
  return (
    <>
      <div className={styles.dossierHead}>
        {rows.map((row) => (
          <div key={row.k} className={styles.dossierRow}>
            <span className={styles.dossierK}>{row.k}</span>
            <span
              className={[
                styles.dossierV,
                row.status ? styles.dossierVStatus : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {row.v}
            </span>
          </div>
        ))}
      </div>
      {note ? <p className={styles.dossierNote}>{note}</p> : null}
    </>
  );
}
