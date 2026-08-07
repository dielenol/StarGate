import { redirect } from "next/navigation";

import type {
  ClientSessionReport,
  SessionReport,
} from "@/types/session-report";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { listVisibleSessionReports } from "@/lib/db/session-reports";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import ReportsClient from "./ReportsClient";

function serializeDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeReport(report: SessionReport): ClientSessionReport {
  return {
    ...report,
    _id: report._id?.toString() ?? "",
    createdAt: serializeDate(report.createdAt),
    updatedAt: serializeDate(report.updatedAt),
  };
}

export default async function SessionReportListPage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const isGmOrAbove = hasRole(session.user.role, "V");
  const reports = (
    await listVisibleSessionReports(session.user.role).catch(() => [])
  ).map(serializeReport);

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
      <ReportsClient initialReports={reports} />
    </>
  );
}
