import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findSessionsByMonth } from "@/lib/db/registrar-read";

import SessionCalendar from "./SessionCalendar";
import styles from "./page.module.css";

export default async function SessionsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const guildId = process.env.GUILD_ID ?? "";

  let initialSessions: Awaited<ReturnType<typeof findSessionsByMonth>> = [];

  if (guildId) {
    try {
      initialSessions = await findSessionsByMonth(guildId, year, month);
    } catch {
      // registrar_bot DB 연결 실패 시 빈 배열 유지
    }
  }

  const serializedSessions = initialSessions.map((s) => ({
    ...s,
    _id: s._id?.toString() ?? "",
    targetDateTime: new Date(s.targetDateTime).toISOString(),
    closeDateTime: new Date(s.closeDateTime).toISOString(),
    createdAt: new Date(s.createdAt).toISOString(),
    updatedAt: new Date(s.updatedAt).toISOString(),
  }));

  return (
    <section className={styles.sessions}>
      <div className={styles.sessions__classification}>
        SESSION MANAGEMENT
      </div>
      <h1 className={styles.sessions__title}>세션 캘린더</h1>

      <div className={styles.legend}>
        <div className={styles.legend__item}>
          <span className={`${styles.legend__dot} ${styles["legend__dot--open"]}`} />
          OPEN
        </div>
        <div className={styles.legend__item}>
          <span className={`${styles.legend__dot} ${styles["legend__dot--closing"]}`} />
          CLOSING
        </div>
        <div className={styles.legend__item}>
          <span className={`${styles.legend__dot} ${styles["legend__dot--closed"]}`} />
          CLOSED
        </div>
        <div className={styles.legend__item}>
          <span className={`${styles.legend__dot} ${styles["legend__dot--canceled"]}`} />
          CANCELED
        </div>
      </div>

      {!guildId ? (
        <p className={styles.sessions__empty}>
          GUILD_ID 환경변수가 설정되지 않았습니다.
        </p>
      ) : (
        <SessionCalendar
          initialSessions={serializedSessions}
          initialYear={year}
          initialMonth={month}
          guildId={guildId}
        />
      )}
    </section>
  );
}
