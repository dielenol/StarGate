import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import ReportCreateForm from "./ReportCreateForm";

export default async function NewReportPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.role, "V")) {
    redirect("/erp/sessions/report");
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "SESSIONS", href: "/erp/sessions" },
          { label: "REPORTS", href: "/erp/sessions/report" },
          { label: "NEW" },
        ]}
        title="세션 리포트 작성"
        right={
          <Button as="a" href="/erp/sessions/report">
            ← 목록
          </Button>
        }
      />
      <Box>
        <ReportCreateForm />
      </Box>
    </>
  );
}
