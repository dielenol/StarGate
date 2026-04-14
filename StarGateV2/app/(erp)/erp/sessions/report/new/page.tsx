import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import ReportCreateForm from "./ReportCreateForm";

import styles from "./page.module.css";

export default async function NewReportPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.role, "GM")) {
    redirect("/erp/sessions/report");
  }

  return (
    <section className={styles.newReport}>
      <div className={styles.newReport__classification}>
        SESSION REPORT / NEW
      </div>
      <h1 className={styles.newReport__title}>세션 리포트 작성</h1>
      <ReportCreateForm />
    </section>
  );
}
