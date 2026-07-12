"use client";

import Link from "next/link";
import { type CSSProperties, useMemo } from "react";

import type { ClientSessionReport } from "@/types/session-report";

import { useSessionReports } from "@/hooks/queries/useSessionReportsQuery";

import { formatDate } from "@/lib/format/date";
import {
  buildOperationReportNumbering,
  formatOperationReportTitle,
  formatShortReporterName,
} from "@/lib/format/session-report";

import Box from "@/components/ui/Box/Box";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import { IconReportDocument, IconReportMini } from "@/components/icons";
import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";

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

interface PinCardLayout {
  x: number;
  y: number;
  labelX?: number;
}

const REPORT_CARD_SIZE = 66;
const DEFAULT_PIN_CARD_LAYOUT: PinCardLayout = { x: 0, y: -106 };
const REPORT_PIN_CARD_LAYOUTS: Record<string, PinCardLayout> = {
  "01.5": { x: -82, y: -112 },
  "02": { x: 86, y: -112 },
  "02.5": { x: 88, y: -92 },
  "04": { x: -86, y: -112, labelX: -132 },
  "04.5": { x: 86, y: -96, labelX: 132 },
  MINI01: { x: -92, y: -112 },
  MINI02: { x: 0, y: -94 },
  MINI03: { x: 0, y: -112 },
  MINI04: { x: -92, y: -94 },
};

function getPinCardLayout(reportNumber: string): PinCardLayout {
  return REPORT_PIN_CARD_LAYOUTS[reportNumber] ?? DEFAULT_PIN_CARD_LAYOUT;
}

function getPinLineStyle(layout: PinCardLayout) {
  const lineX = layout.x;
  const lineY = layout.y + REPORT_CARD_SIZE;
  const length = Math.max(18, Math.hypot(lineX, lineY));
  const angle = Math.atan2(lineX, -lineY) * (180 / Math.PI);

  return {
    "--pin-card-x": `${layout.x}px`,
    "--pin-card-y": `${layout.y}px`,
    "--pin-line-length": `${length.toFixed(4)}px`,
    "--pin-line-angle": `${angle.toFixed(4)}deg`,
    "--pin-label-x": `${Math.round(layout.labelX ?? layout.x / 2)}px`,
  };
}

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

  const numberedReports = useMemo(
    () => buildOperationReportNumbering(reports),
    [reports],
  );

  return (
    <Box className={styles.mapBox} data-pixel-font="ui">
      <PanelTitle
        right={<span className={styles.mono}>{numberedReports.length} 건</span>}
      >
        OPERATION REPORT MAP
      </PanelTitle>

      {numberedReports.length === 0 ? (
        <div className={styles.empty}>작성된 작전 보고서가 없습니다.</div>
      ) : (
        <div className={styles.mapStage} role="list">
          <div className={styles.mapOverlay} aria-hidden />
          {numberedReports.map(({ report, series, number }, index) => {
            const id = String(report._id);
            const point = getReportMapPoint(report, index);
            const reportNumber = number;
            const pinLayout = getPinCardLayout(reportNumber);
            const reporterName = formatShortReporterName(report.gmName);
            const displayTitle = formatOperationReportTitle(
              report.sessionTitle,
            );
            const ReportIcon =
              series === "mini" ? IconReportMini : IconReportDocument;
            const style = {
              "--x": `${point.x}%`,
              "--y": `${point.y}%`,
              ...getPinLineStyle(pinLayout),
            } as CSSProperties;

            return (
              <Link
                key={id}
                href={`/erp/sessions/report/${id}`}
                className={[
                  styles.mapPin,
                  reportNumber.length > 2 ? styles["mapPin--wideNumber"] : "",
                  series === "mini" ? styles["mapPin--mini"] : "",
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
                <LinkPendingProbe />
                <span className={styles.mapPin__report}>
                  <ReportIcon className={styles.reportIcon} aria-hidden />
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
