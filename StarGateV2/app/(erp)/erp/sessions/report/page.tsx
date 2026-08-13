import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { isMemberErpViewer } from "@/lib/auth/guest";
import { hasRole } from "@/lib/auth/rbac";
import { listVisibleSessionReports } from "@/lib/db/session-reports";
import {
  buildClientSessionReportList,
  type ClientSessionReportListItem,
} from "@/lib/format/session-report-list";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import ReportsClient from "./ReportsClient";

export default async function SessionReportListPage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const isGmOrAbove = hasRole(session.user.role, "V");
  let reports: ClientSessionReportListItem[] = [];
  let initialReportsUpdatedAt: number | undefined;
  if (isMemberErpViewer(session.user)) {
    try {
      reports = buildClientSessionReportList(
        await listVisibleSessionReports(session.user.role),
      );
    } catch {
      initialReportsUpdatedAt = 0;
    }
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "세션", href: "/erp/sessions" },
          { label: "작전 보고서" },
        ]}
        title="작전 보고서"
        right={
          isGmOrAbove ? (
            <Button as="a" href="/erp/sessions/report/new" variant="primary">
              ＋ 작전 보고서 작성
            </Button>
          ) : null
        }
      />
      <ReportsClient
        initialReports={reports}
        initialReportsUpdatedAt={initialReportsUpdatedAt}
      />
    </>
  );
}
