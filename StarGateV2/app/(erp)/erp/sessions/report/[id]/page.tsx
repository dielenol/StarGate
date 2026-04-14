import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findReportById } from "@/lib/db/session-reports";

import ReportActions from "./ReportActions";

import styles from "./page.module.css";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionReportDetailPage({ params }: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  const report = await findReportById(id);
  if (!report) {
    notFound();
  }

  const isGmOrAbove = hasRole(session.user.role, "GM");
  const isAdmin = hasRole(session.user.role, "ADMIN");

  return (
    <section className={styles.detail}>
      <div className={styles.detail__classification}>
        SESSION REPORT / DETAIL
      </div>

      <Link href="/erp/sessions/report" className={styles.detail__back}>
        &larr; 리포트 목록
      </Link>

      <h1 className={styles.detail__title}>{report.sessionTitle}</h1>

      <div className={styles.detail__meta}>
        <span className={styles.detail__gm}>GM: {report.gmName}</span>
        <span className={styles.detail__date}>
          {new Date(report.createdAt).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </span>
      </div>

      {(isGmOrAbove || isAdmin) && (
        <ReportActions
          reportId={String(report._id)}
          canEdit={isGmOrAbove}
          canDelete={isAdmin}
        />
      )}

      <div className={styles.detail__section}>
        <div className={styles.detail__sectionHeader}>SUMMARY</div>
        <p className={styles.detail__body}>{report.summary}</p>
      </div>

      {report.highlights.length > 0 && (
        <div className={styles.detail__section}>
          <div className={styles.detail__sectionHeader}>HIGHLIGHTS</div>
          <ul className={styles.detail__list}>
            {report.highlights.map((h, i) => (
              <li key={i} className={styles.detail__listItem}>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.participants.length > 0 && (
        <div className={styles.detail__section}>
          <div className={styles.detail__sectionHeader}>PARTICIPANTS</div>
          <div className={styles.detail__participants}>
            {report.participants.map((p, i) => (
              <span key={i} className={styles.detail__participant}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
