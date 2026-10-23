import { recoveryUpdates } from "@/lib/maintenance/recovery";

import styles from "./IncidentBulletin.module.css";

const GUIDANCE = [
  "업무망이 재개될 때까지 ERP 접속을 시도하지 마십시오. 재개되면 이 화면이 자동으로 전환됩니다.",
  "보안관제센터를 사칭한 연락이나 출처가 확인되지 않은 링크·파일에 응하지 마십시오.",
  "보안관제센터는 메신저나 외부 링크로 인증 정보를 요구하지 않습니다.",
  "이상 징후를 발견하면 즉시 담당 관리자에게 보고하십시오.",
];

type IncidentBulletinProps = {
  startsAt: string;
  endsAt: string;
  now: number;
};

export default function IncidentBulletin({ startsAt, endsAt, now }: IncidentBulletinProps) {
  const { published, next } = recoveryUpdates(startsAt, endsAt, now);

  return (
    <div className={styles.bulletin}>
      <section className={styles.bulletin__panel} aria-labelledby="incident-updates-title">
        <header className={styles.bulletin__head}>
          <h2 id="incident-updates-title" className={styles.bulletin__title}><span>INCIDENT UPDATES</span>대응 경과 공지</h2>
          {next && <p className={styles.bulletin__next}>다음 공지 <time>{next}</time> 예정</p>}
        </header>
        <ol className={styles.bulletin__updates}>
          {published.map((update, index) => (
            <li
              key={update.minute}
              className={[
                styles.bulletin__update,
                styles[`bulletin__update--${update.tone}`],
                index === 0 && styles["bulletin__update--latest"],
              ].filter(Boolean).join(" ")}
            >
              <time dateTime={new Date(update.at).toISOString()}>{update.time}</time>
              <span className={styles.bulletin__label}>{update.label}</span>
              <p>{update.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className={styles.bulletin__panel} aria-labelledby="incident-guidance-title">
        <h2 id="incident-guidance-title" className={styles.bulletin__title}><span>AGENT GUIDANCE</span>요원 행동 지침</h2>
        <ol className={styles.bulletin__guidance}>
          {GUIDANCE.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>
    </div>
  );
}
