/**
 * 작전 보고서 API 입력 가드 (POST /api/erp/session-reports, PATCH /api/erp/session-reports/[id]).
 *
 * highlights / participants 배열에 대해 타입 + 항목 길이 cap 검증.
 * 핸들러는 결과의 error / value 분기로 분기.
 */

import { NextResponse } from "next/server";

export const HIGHLIGHT_ITEM_MAX = 500;
export const PARTICIPANT_ITEM_MAX = 200;
export const HIGHLIGHTS_MAX_COUNT = 50;
export const PARTICIPANTS_MAX_COUNT = 30;
export const LOCATION_LABEL_MAX = 80;

type MapPrecision = "confirmed" | "estimated";

export type SessionReportArrayCheck =
  | { error: NextResponse }
  | { value: { highlights?: string[]; participants?: string[] } };

export type SessionReportMapCheck =
  | { error: NextResponse }
  | {
      value: {
        locationLabel?: string;
        mapX?: number;
        mapY?: number;
        mapPrecision?: MapPrecision;
      };
    };

export function validateSessionReportArrays(body: {
  highlights?: unknown;
  participants?: unknown;
}): SessionReportArrayCheck {
  const value: { highlights?: string[]; participants?: string[] } = {};

  if (body.highlights !== undefined) {
    if (
      !Array.isArray(body.highlights) ||
      body.highlights.length > HIGHLIGHTS_MAX_COUNT ||
      !body.highlights.every(
        (t) => typeof t === "string" && t.length <= HIGHLIGHT_ITEM_MAX,
      )
    ) {
      return badRequest("highlights 형식 오류");
    }
    value.highlights = body.highlights;
  }

  if (body.participants !== undefined) {
    if (
      !Array.isArray(body.participants) ||
      body.participants.length > PARTICIPANTS_MAX_COUNT ||
      !body.participants.every(
        (t) => typeof t === "string" && t.length <= PARTICIPANT_ITEM_MAX,
      )
    ) {
      return badRequest("participants 형식 오류");
    }
    value.participants = body.participants;
  }

  return { value };
}

export function validateSessionReportMap(body: {
  locationLabel?: unknown;
  mapX?: unknown;
  mapY?: unknown;
  mapPrecision?: unknown;
}): SessionReportMapCheck {
  const value: {
    locationLabel?: string;
    mapX?: number;
    mapY?: number;
    mapPrecision?: MapPrecision;
  } = {};

  if (body.locationLabel !== undefined) {
    if (typeof body.locationLabel !== "string") {
      return badRequest("locationLabel 형식 오류");
    }

    const label = body.locationLabel.trim();
    if (label.length > LOCATION_LABEL_MAX) {
      return badRequest("locationLabel 길이 초과");
    }
    if (label) value.locationLabel = label;
  }

  const hasMapX = body.mapX !== undefined;
  const hasMapY = body.mapY !== undefined;
  if (hasMapX !== hasMapY) {
    return badRequest("mapX와 mapY는 함께 입력해야 합니다.");
  }

  if (hasMapX && hasMapY) {
    const mapX = parseCoordinate(body.mapX);
    const mapY = parseCoordinate(body.mapY);

    if (mapX === null || mapY === null) {
      return badRequest("mapX/mapY 형식 오류");
    }

    value.mapX = mapX;
    value.mapY = mapY;
  }

  if (body.mapPrecision !== undefined) {
    if (
      body.mapPrecision !== "confirmed" &&
      body.mapPrecision !== "estimated"
    ) {
      return badRequest("mapPrecision 형식 오류");
    }
    value.mapPrecision = body.mapPrecision;
  } else if (value.mapX !== undefined && value.mapY !== undefined) {
    value.mapPrecision = "estimated";
  }

  return { value };
}

function parseCoordinate(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return Number(numeric.toFixed(2));
}

function badRequest(message: string): { error: NextResponse } {
  return { error: NextResponse.json({ error: message }, { status: 400 }) };
}
