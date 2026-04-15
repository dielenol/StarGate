import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listSessionReports } from "@/lib/db/session-reports";

import ReportsClient from "./ReportsClient";

export default async function SessionReportListPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isGmOrAbove = hasRole(session.user.role, "GM");
  const reports = await listSessionReports().catch(() => []);

  return (
    <ReportsClient initialReports={reports} isGmOrAbove={isGmOrAbove} />
  );
}
