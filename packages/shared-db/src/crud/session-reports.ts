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
]);

export async function updateSessionReport(
  id: string,
  update: Record<string, unknown>
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(update)) {
    if (ALLOWED_REPORT_FIELDS.has(key)) sanitized[key] = update[key];
  }
  if (Object.keys(sanitized).length === 0) return false;

  const col = await sessionReportsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...sanitized, updatedAt: new Date() } as Record<string, unknown> }
  );
  return result.modifiedCount > 0;
}

export async function deleteSessionReport(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await sessionReportsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
