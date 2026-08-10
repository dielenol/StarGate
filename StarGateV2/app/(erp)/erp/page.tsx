import { redirect } from "next/navigation";

import DashboardClient from "./DashboardClient";

import { getActiveSession } from "@/lib/auth/active-session";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { getErpDashboardResponse } from "@/lib/erp/dashboard";

export default async function ERPDashboardPage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const initialData = await getErpDashboardResponse({
    userId: getOwnedDataViewerId(session.user),
    viewerRole: session.user.role,
    viewerDiscordId: session.user.discordId ?? null,
  });

  return <DashboardClient initialData={initialData} />;
}
