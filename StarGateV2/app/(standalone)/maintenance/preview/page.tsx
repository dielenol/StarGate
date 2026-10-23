import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MaintenanceNotice from "@/components/maintenance/MaintenanceNotice";
import { ERP_MAINTENANCE_WINDOW } from "@/lib/maintenance/schedule";

export const metadata: Metadata = {
  title: "점검 안내 미리보기 · NOVUS ORDO",
  robots: { index: false, follow: false },
};

/** 실제 접속 차단을 켜지 않고 확정된 일정의 공지를 검토하는 개발 전용 화면. */
export default function MaintenancePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MaintenanceNotice {...ERP_MAINTENANCE_WINDOW} serverNow={Date.parse(ERP_MAINTENANCE_WINDOW.startsAt) + 5 * 60_000} preview />;
}
