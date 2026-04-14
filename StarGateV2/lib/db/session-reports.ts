/**
 * session_reports CRUD
 */

import { ObjectId } from "mongodb";

import type {
  CreateSessionReportInput,
  SessionReport,
} from "@/types/session-report";

import { sessionReportsCollection } from "./collections";

export async function listSessionReports(): Promise<SessionReport[]> {
  const col = await sessionReportsCollection();
  return col.find().sort({ createdAt: -1 }).toArray();
}

export async function findReportBySessionId(
  sessionId: string,
): Promise<SessionReport | null> {
  const col = await sessionReportsCollection();
  return col.findOne({ sessionId });
}

export async function findReportById(
  id: string,
): Promise<SessionReport | null> {
  const col = await sessionReportsCollection();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function createSessionReport(
  input: CreateSessionReportInput,
): Promise<SessionReport> {
  const col = await sessionReportsCollection();
  const now = new Date();
  const doc: SessionReport = { ...input, createdAt: now, updatedAt: now };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateSessionReport(
  id: string,
  update: Record<string, unknown>,
): Promise<boolean> {
  const col = await sessionReportsCollection();
  const result = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } as Record<string, unknown> },
  );
  return result.modifiedCount > 0;
}

export async function deleteSessionReport(id: string): Promise<boolean> {
  const col = await sessionReportsCollection();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
