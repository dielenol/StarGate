import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listSessionReports } from "@/lib/db/session-reports";

import type { SessionReport } from "@/types/session-report";

import styles from "./page.module.css";

export default async function SessionReportListPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isGmOrAbove = hasRole(session.user.role, "GM");

  let reports: SessionReport[] = [];

  try {
    reports = await listSessionReports();
  } catch {
    // DB 연결 실패 시 빈 배열 유지
  }

  return (
    <section className={styles.reports}>
      <div className={styles.reports__classification}>
        SESSION REPORTS
      </div>

      <div className={styles.reports__header}>
        <h1 className={styles.reports__title}>세션 리포트</h1>
        {isGmOrAbove && (
          <Link href="/erp/sessions/report/new" className={styles.reports__add}>
            + 리포트 작성
          </Link>
        )}
      </div>

      {reports.length === 0 ? (
        <p className={styles.reports__empty}>
          작성된 세션 리포트가 없습니다.
        </p>
      ) : (
        <div className={styles.reports__grid}>
          {reports.map((report) => (
            <Link
              key={String(report._id)}
              href={`/erp/sessions/report/${String(report._id)}`}
              className={styles.reports__card}
            >
              <div className={styles.reports__cardHeader}>
                {report.sessionTitle}
              </div>
              <p className={styles.reports__cardSummary}>
                {report.summary.length > 100
                  ? `${report.summary.slice(0, 100)}...`
                  : report.summary}
              </p>
              <div className={styles.reports__cardMeta}>
                <span className={styles.reports__cardGm}>
                  GM: {report.gmName}
                </span>
                <span className={styles.reports__cardDate}>
                  {new Date(report.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
