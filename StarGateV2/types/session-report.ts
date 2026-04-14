import type { ObjectId } from "mongodb";

export interface SessionReport {
  _id?: ObjectId;
  /** registrar_bot sessions._id 참조 */
  sessionId: string;
  sessionTitle: string;
  summary: string;
  highlights: string[];
  participants: string[];
  gmId: string;
  gmName: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateSessionReportInput = Omit<
  SessionReport,
  "_id" | "createdAt" | "updatedAt"
>;
