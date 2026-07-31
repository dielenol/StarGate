/**
 * session_reports CRUD
 */

import { ObjectId } from "mongodb";

import type {
  CreateSessionReportInput,
  SessionReport,
} from "../types/index.js";

import { sessionReportsCol } from "../collections.js";

export async function listSessionReports(): Promise<SessionReport[]> {
  const col = await sessionReportsCol();
  return col.find().sort({ createdAt: -1 }).toArray();
}

export async function findReportBySessionId(
  sessionId: string
): Promise<SessionReport | null> {
  const col = await sessionReportsCol();
  return col.findOne({ sessionId });
}

/** 세션 연관 카드 표시용 경량 리포트 행. */
export type SessionReportRefLite = Pick<
  SessionReport,
  "_id" | "sessionId" | "sessionTitle" | "locationLabel" | "createdAt"
>;

/**
 * 여러 sessionId 의 리포트를 연관 표시 필드만으로 일괄 조회.
 *
 * 신원조회(Dossier) 등장 이벤트 카드처럼 sessionId → 제목/장소 매핑만 필요한 경로 전용
 * (`listSessionReports()` 전체 로드 + JS 필터 대체).
 * - 정렬은 `listSessionReports` 와 동일한 `{ createdAt: -1 }` — 목록 대체 시 표시 순서 보존.
 * - 빈 배열 입력은 즉시 short-circuit.
 */
export async function findSessionReportsBySessionIds(
  sessionIds: string[]
): Promise<SessionReportRefLite[]> {
  if (sessionIds.length === 0) return [];
  const col = await sessionReportsCol();
  return col
    .find({ sessionId: { $in: sessionIds } })
    .project<SessionReportRefLite>({
      sessionId: 1,
      sessionTitle: 1,
      locationLabel: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function findReportById(id: string): Promise<SessionReport | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await sessionReportsCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function createSessionReport(
  input: CreateSessionReportInput
): Promise<SessionReport> {
  const col = await sessionReportsCol();
  const now = new Date();
  const doc: SessionReport = { ...input, createdAt: now, updatedAt: now };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

const ALLOWED_REPORT_FIELDS = new Set([
  "sessionTitle",
  "summary",
  "highlights",
  "participants",
  "locationLabel",
  "mapX",
  "mapY",
  "mapPrecision",
]);

export async function updateSessionReport(
  id: string,
  update: Record<string, unknown>,
  expectedUpdatedAt?: Date | null
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const toSet: Record<string, unknown> = {};
  const toUnset: Record<string, ""> = {};
  for (const key of Object.keys(update)) {
    if (!ALLOWED_REPORT_FIELDS.has(key)) continue;
    if (update[key] === null) toUnset[key] = "";
    else toSet[key] = update[key];
  }
  if (Object.keys(toSet).length === 0 && Object.keys(toUnset).length === 0) {
    return false;
  }

  const updateDoc: Record<string, unknown> = {
    $set: { ...toSet, updatedAt: new Date() },
  };
  if (Object.keys(toUnset).length > 0) updateDoc.$unset = toUnset;

  const col = await sessionReportsCol();
  const filter: Record<string, unknown> = { _id: new ObjectId(id) };
  if (expectedUpdatedAt !== undefined) {
    filter.updatedAt = expectedUpdatedAt;
  }
  const result = await col.updateOne(
    filter,
    updateDoc
  );
  return result.matchedCount > 0;
}

export async function deleteSessionReport(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await sessionReportsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
