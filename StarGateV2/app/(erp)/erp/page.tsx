import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

import styles from "./page.module.css";

export default async function ERPDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { displayName, role } = session.user;

  return (
    <section className={styles.dashboard}>
      <div className={styles.dashboard__classification}>
        SYSTEM STATUS: OPERATIONAL
      </div>
      <h1 className={styles.dashboard__title}>대시보드</h1>

      <div className={styles.dashboard__card}>
        <p className={styles.dashboard__placeholder}>
          Phase 2에서 구현 예정입니다.
          <br />
          세션 일정, 캐릭터 현황, 최근 활동 등의 요약 정보가 이곳에 표시됩니다.
        </p>

        <div className={styles["dashboard__user-info"]}>
          <div className={styles["dashboard__user-title"]}>
            CURRENT OPERATOR
          </div>
          <div className={styles["dashboard__user-row"]}>
            <span className={styles["dashboard__user-label"]}>이름</span>
            <span className={styles["dashboard__user-value"]}>
              {displayName}
            </span>
          </div>
          <div className={styles["dashboard__user-row"]}>
            <span className={styles["dashboard__user-label"]}>역할</span>
            <span className={styles["dashboard__user-value"]}>{role}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
