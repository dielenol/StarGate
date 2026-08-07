import { redirect } from "next/navigation";

import DashboardClient from "./DashboardClient";

import { getActiveSession } from "@/lib/auth/active-session";
import { getErpDashboardResponse } from "@/lib/erp/dashboard";

export default async function ERPDashboardPage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const initialData = await getErpDashboardResponse({
    userId: session.user.id,
    viewerRole: session.user.role,
    viewerDiscordId: session.user.discordId ?? null,
  });

  return <DashboardClient initialData={initialData} />;
}
