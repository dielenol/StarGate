"use client";

import Link from "next/link";
import { type CSSProperties, useMemo } from "react";

import type { ClientSessionReport } from "@/types/session-report";

import { useSessionReports } from "@/hooks/queries/useSessionReportsQuery";

import { formatDate } from "@/lib/format/date";
import {
  formatOperationReportTitle,
  formatShortReporterName,
} from "@/lib/format/session-report";

import Box from "@/components/ui/Box/Box";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import { IconReportDocument } from "@/components/icons";

import styles from "./page.module.css";

interface Props {
  initialReports: ClientSessionReport[];
}

interface MapPoint {
  x: number;
  y: number;
  label: string;
  precision: "confirmed" | "estimated";
}

const REPORT_PIN_OFFSETS: Record<string, { x: string; y: string }> = {
  "02": { x: "-34px", y: "-22px" },
  "04": { x: "34px", y: "22px" },
};

function normalizeReportText(report: ClientSessionReport): string {
  return [
    report.sessionId,
    report.sessionTitle,
    report.summary,
    ...report.highlights,
  ]
    .join(" ")
    .toLowerCase();
}

function getReportNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function getCoordinate(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function getReportMapPoint(
  report: ClientSessionReport,
  index: number,
): MapPoint {
  const text = normalizeReportText(report);

  if (
    typeof report.mapX === "number" &&
    typeof report.mapY === "number" &&
    Number.isFinite(report.mapX) &&
    Number.isFinite(report.mapY)
  ) {
    return {
      x: getCoordinate(report.mapX),
      y: getCoordinate(report.mapY),
      label: report.locationLabel?.trim() || "위치 미분류",
      precision: report.mapPrecision ?? "estimated",
    };
  }

  if (
    report.sessionId === "NOSB-S1E1-ORDER" ||
    text.includes("한반도") ||
    text.includes("한국") ||
    text.includes("korea")
  ) {
    return {
      x: 81.55,
      y: 42.0,
      label: "한반도 남부",
      precision: "confirmed",
    };
  }

  if (
    text.includes("맨해튼") ||
    text.includes("new york") ||
    text.includes("manhattan")
  ) {
    return {
      x: 27.5,
      y: 40.4,
      label: "미국 맨해튼",
      precision: "confirmed",
    };
  }

  return {
    x: 18 + ((index * 17) % 62),
    y: 58 + ((index * 7) % 16),
    label: "위치 미분류",
    precision: "estimated",
  };
}

export default function ReportsClient({ initialReports }: Props) {
  const { data: reports = [] } = useSessionReports({
    initialData: initialReports,
  });

  const orderedReports = useMemo(
    () =>
      [...reports].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [reports],
  );

  return (
    <Box className={styles.mapBox}>
      <PanelTitle
        right={<span className={styles.mono}>{orderedReports.length} 건</span>}
      >
        OPERATION REPORT MAP
      </PanelTitle>

      {orderedReports.length === 0 ? (
        <div className={styles.empty}>작성된 작전 보고서가 없습니다.</div>
      ) : (
        <div className={styles.mapStage} role="list">
          <div className={styles.mapOverlay} aria-hidden />
          {orderedReports.map((report, index) => {
            const id = String(report._id);
            const point = getReportMapPoint(report, index);
            const reportNumber = getReportNumber(index);
            const offset = REPORT_PIN_OFFSETS[reportNumber];
            const reporterName = formatShortReporterName(report.gmName);
            const displayTitle = formatOperationReportTitle(
              report.sessionTitle,
            );
            const style = {
              "--x": `${point.x}%`,
              "--y": `${point.y}%`,
              "--pin-offset-x": offset?.x ?? "0px",
              "--pin-offset-y": offset?.y ?? "0px",
            } as CSSProperties;

            return (
              <Link
                key={id}
                href={`/erp/sessions/report/${id}`}
                className={[
                  styles.mapPin,
                  point.precision === "estimated"
                    ? styles["mapPin--estimated"]
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={style}
                role="listitem"
                aria-label={`${point.label} ${formatDate(report.createdAt, "padded")} ${displayTitle} 열기`}
              >
                <span className={styles.mapPin__report}>
                  <IconReportDocument
                    className={styles.reportIcon}
                    aria-hidden
                  />
                  <span className={styles.mapPin__number}>
                    {reportNumber}
                  </span>
                </span>
                <span className={styles.mapPin__stem} aria-hidden />
                <span className={styles.mapPin__dot} aria-hidden />
                <span className={styles.mapPin__label}>
                  <span className={styles.mapPin__date}>
                    {formatDate(report.createdAt, "padded")}
                  </span>
                  <span className={styles.mapPin__title}>
                    {displayTitle}
                  </span>
                  <span className={styles.mapPin__place}>{point.label}</span>
                  <span className={styles.mapPin__reporter}>
                    보고자 - {reporterName}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Box>
  );
}
