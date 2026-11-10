import type { Metadata } from "next";
import { redirect } from "next/navigation";
import MaintenanceNotice from "@/components/maintenance/MaintenanceNotice";
import { getMaintenanceState } from "@/lib/maintenance/schedule";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "사이트 전체 긴급 보안 점검 안내 · NOVUS ORDO",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  const state = getMaintenanceState();
  if (state.phase !== "active" || !state.startsAt || !state.endsAt) {
    redirect("/");
  }
  return <MaintenanceNotice startsAt={state.startsAt} endsAt={state.endsAt} serverNow={state.serverNow} />;
}
