import type {
  SessionReport,
  SessionReportMapPrecision,
} from "@stargate/shared-db/types";

import {
  buildOperationReportNumbering,
  type OperationReportSeries,
} from "./session-report.ts";

export interface SessionReportMapPoint {
  x: number;
  y: number;
  label: string;
  precision: SessionReportMapPrecision;
}

export interface ClientSessionReportListItem {
  _id: string;
  sessionTitle: string;
  gmName: string;
  createdAt: string;
  number: string;
  series: OperationReportSeries;
  mapPoint: SessionReportMapPoint;
}

type SessionReportListSource = Pick<
  SessionReport,
  | "_id"
  | "sessionId"
  | "sessionTitle"
  | "reportNumber"
  | "summary"
  | "highlights"
  | "locationLabel"
  | "mapX"
  | "mapY"
  | "mapPrecision"
  | "gmName"
  | "createdAt"
>;

function normalizeReportText(report: SessionReportListSource): string {
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

export function getSessionReportMapPoint(
  report: SessionReportListSource,
  index: number,
): SessionReportMapPoint {
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
      y: 42,
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

export function buildClientSessionReportList(
  reports: readonly SessionReportListSource[],
): ClientSessionReportListItem[] {
  return buildOperationReportNumbering(reports).map(
    ({ report, number, series }, index) => ({
      _id: report._id?.toString() ?? "",
      sessionTitle: report.sessionTitle,
      gmName: report.gmName,
      createdAt:
        report.createdAt instanceof Date
          ? report.createdAt.toISOString()
          : report.createdAt,
      number,
      series,
      mapPoint: getSessionReportMapPoint(report, index),
    }),
  );
}
