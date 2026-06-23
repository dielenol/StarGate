import type { ObjectId } from "mongodb";

export type SessionReportMapPrecision = "confirmed" | "estimated";

export interface SessionReport {
  _id?: ObjectId;
  /** sessions._id 참조 */
  sessionId: string;
  sessionTitle: string;
  /** 지도/목록에 표시할 고정 보고서 번호. 없으면 날짜순 위치로 계산한다. */
  reportNumber?: string;
  summary: string;
  highlights: string[];
  participants: string[];
  /** 작전 보고서 세계지도 표시명 */
  locationLabel?: string;
  /** 세계지도 이미지 기준 퍼센트 좌표. */
  mapX?: number;
  /** 세계지도 이미지 기준 퍼센트 좌표. */
  mapY?: number;
  /** 지도 핀 좌표 확정도. */
  mapPrecision?: SessionReportMapPrecision;
  gmId: string;
  gmName: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateSessionReportInput = Omit<
  SessionReport,
  "_id" | "createdAt" | "updatedAt"
>;
