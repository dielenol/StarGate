import { notFound, redirect } from "next/navigation";

import type {
  ClientSessionReport,
  SessionReport,
} from "@/types/session-report";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findReportById } from "@/lib/db/session-reports";
import { isValidObjectId } from "@/lib/db/utils";
import { formatOperationReportTitle } from "@/lib/format/session-report";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import ReportEditForm from "./ReportEditForm";
import styles from "../../new/page.module.css";

interface Props {
  params: Promise<{ id: string }>;
}

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

export default async function EditReportPage({ params }: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.role, "V")) {
    redirect("/erp/sessions/report");
  }

  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const report = await findReportById(id);
  if (!report) {
    notFound();
  }

  const reportId = report._id?.toString() ?? id;
  const title = formatOperationReportTitle(report.sessionTitle);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "세션", href: "/erp/sessions" },
          { label: "작전 보고서", href: "/erp/sessions/report" },
          { label: title, href: `/erp/sessions/report/${reportId}` },
          { label: "수정" },
        ]}
        title="작전 보고서 수정"
        right={
          <Button as="a" href={`/erp/sessions/report/${reportId}`}>
            ← 보고서 상세
          </Button>
        }
      />
      <Box className={styles.reportPanel}>
        <ReportEditForm report={serializeReport(report)} />
      </Box>
    </>
  );
}
