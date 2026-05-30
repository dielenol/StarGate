import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import ReportCreateForm from "./ReportCreateForm";
import styles from "./page.module.css";

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
          { label: "세션", href: "/erp/sessions" },
          { label: "작전 보고서", href: "/erp/sessions/report" },
          { label: "작성" },
        ]}
        title="작전 보고서 작성"
        right={
          <Button as="a" href="/erp/sessions/report">
            ← 작전 보고서
          </Button>
        }
      />
      <Box className={styles.reportPanel}>
        <ReportCreateForm />
      </Box>
    </>
  );
}
