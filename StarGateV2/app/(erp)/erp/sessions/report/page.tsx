import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listSessionReports } from "@/lib/db/session-reports";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import ReportsClient from "./ReportsClient";

export default async function SessionReportListPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isGmOrAbove = hasRole(session.user.role, "GM");
  const reports = await listSessionReports().catch(() => []);

  return (
    <>
      <PageHead
        breadcrumb="ERP / SESSIONS / REPORTS"
        title="세션 리포트"
        right={
          isGmOrAbove ? (
            <Button as="a" href="/erp/sessions/report/new" variant="primary">
              ＋ 리포트 작성
            </Button>
          ) : null
        }
      />
      <ReportsClient initialReports={reports} />
    </>
  );
}
