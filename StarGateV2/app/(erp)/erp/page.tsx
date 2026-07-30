import { redirect } from "next/navigation";

import DashboardClient from "./DashboardClient";

import { auth } from "@/lib/auth/config";
import { getErpDashboardResponse } from "@/lib/erp/dashboard";

export default async function ERPDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const initialData = await getErpDashboardResponse({
    userId: session.user.id,
    viewerDiscordId: session.user.discordId ?? null,
  });

  return <DashboardClient initialData={initialData} />;
}
