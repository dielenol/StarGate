import { recoveryLog } from "@/lib/maintenance/recovery";

import styles from "./RecoveryLog.module.css";

const VISIBLE_LINES = 13;

type RecoveryLogProps = {
  startsAt: string;
  endsAt: string;
  now: number;
};

export default function RecoveryLog({ startsAt, endsAt, now }: RecoveryLogProps) {
  const lines = recoveryLog(startsAt, endsAt, now, VISIBLE_LINES);

  return (
    <section className={styles.log} aria-labelledby="recovery-log-title">
      <header className={styles.log__head}>
        <h2 id="recovery-log-title" className={styles.log__title}><span>LIVE LOG</span>실시간 대응 로그</h2>
        <span className={styles.log__rec}><i aria-hidden="true" />REC</span>
      </header>
      <ol className={styles.log__lines}>
        {lines.map((line, index) => (
          <li
            key={line.seq}
            className={[
              styles.log__line,
              styles[`log__line--${line.tone}`],
              index === lines.length - 1 && styles["log__line--latest"],
            ].filter(Boolean).join(" ")}
          >
            <time>{line.time}</time>
            <span className={styles.log__tag}>{line.tag}</span>
            <span className={styles.log__text}>{line.text}</span>
          </li>
        ))}
        <li className={styles.log__prompt} aria-hidden="true">soc@novus-ordo:~$<i /></li>
      </ol>
    </section>
  );
}
