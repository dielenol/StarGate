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

export type SessionReportMapUpdateCheck =
  | { error: NextResponse }
  | {
      value: {
        locationLabel?: string | null;
        mapX?: number | null;
        mapY?: number | null;
        mapPrecision?: MapPrecision | null;
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
  return validateMapFields(body, false) as SessionReportMapCheck;
}

export function validateSessionReportMapUpdate(body: {
  locationLabel?: unknown;
  mapX?: unknown;
  mapY?: unknown;
  mapPrecision?: unknown;
}): SessionReportMapUpdateCheck {
  return validateMapFields(body, true);
}

function validateMapFields(
  body: {
    locationLabel?: unknown;
    mapX?: unknown;
    mapY?: unknown;
    mapPrecision?: unknown;
  },
  allowClear: boolean,
): SessionReportMapUpdateCheck {
  const value: {
    locationLabel?: string | null;
    mapX?: number | null;
    mapY?: number | null;
    mapPrecision?: MapPrecision | null;
  } = {};

  if (body.locationLabel !== undefined) {
    if (allowClear && body.locationLabel === null) {
      value.locationLabel = null;
    } else if (typeof body.locationLabel !== "string") {
      return badRequest("locationLabel 형식 오류");
    } else {
      const label = body.locationLabel.trim();
      if (label.length > LOCATION_LABEL_MAX) {
        return badRequest("locationLabel 길이 초과");
      }
      if (label) value.locationLabel = label;
      else if (allowClear) value.locationLabel = null;
    }
  }

  const hasMapX = body.mapX !== undefined;
  const hasMapY = body.mapY !== undefined;
  if (hasMapX !== hasMapY) {
    return badRequest("mapX와 mapY는 함께 입력해야 합니다.");
  }

  if (hasMapX && hasMapY) {
    if (allowClear && isClearValue(body.mapX) && isClearValue(body.mapY)) {
      value.mapX = null;
      value.mapY = null;
    } else {
      const mapX = parseCoordinate(body.mapX);
      const mapY = parseCoordinate(body.mapY);

      if (mapX === null || mapY === null) {
        return badRequest("mapX/mapY 형식 오류");
      }

      value.mapX = mapX;
      value.mapY = mapY;
    }
  }

  if (body.mapPrecision !== undefined) {
    if (allowClear && body.mapPrecision === null) {
      value.mapPrecision = null;
      return { value };
    }
    if (
      body.mapPrecision !== "confirmed" &&
      body.mapPrecision !== "estimated"
    ) {
      return badRequest("mapPrecision 형식 오류");
    }
    value.mapPrecision = body.mapPrecision;
  } else if (typeof value.mapX === "number" && typeof value.mapY === "number") {
    value.mapPrecision = "estimated";
  }

  return { value };
}

function isClearValue(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.trim() === "");
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
