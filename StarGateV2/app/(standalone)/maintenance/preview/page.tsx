import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MaintenanceNotice from "@/components/maintenance/MaintenanceNotice";
import { ERP_MAINTENANCE_WINDOW } from "@/lib/maintenance/schedule";

export const metadata: Metadata = {
  title: "점검 안내 미리보기 · NOVUS ORDO",
  robots: { index: false, follow: false },
};

type MaintenancePreviewPageProps = {
  searchParams: Promise<{ minutes?: string | string[] }>;
};

/**
 * 실제 접속 차단을 켜지 않고 확정된 일정의 공지를 검토하는 개발 전용 화면.
 * `?minutes=480`처럼 시작 후 경과 분을 주면 그 시점의 복구 상태를 보여 준다(기본 5분).
 */
export default async function MaintenancePreviewPage({ searchParams }: MaintenancePreviewPageProps) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { minutes } = await searchParams;
  const start = Date.parse(ERP_MAINTENANCE_WINDOW.startsAt);
  const end = Date.parse(ERP_MAINTENANCE_WINDOW.endsAt);
  const offset = typeof minutes === "string" && minutes.trim() !== "" ? Number(minutes) : 5;
  const serverNow = Math.min(end - 60_000, start + (Number.isFinite(offset) ? Math.max(0, offset) : 5) * 60_000);
  return <MaintenanceNotice {...ERP_MAINTENANCE_WINDOW} serverNow={serverNow} preview />;
}
