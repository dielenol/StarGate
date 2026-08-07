import type { ObjectId } from "mongodb";

import type { RoleLevel } from "./character.js";

export type SessionReportMapPrecision = "confirmed" | "estimated";

export interface SessionReport {
  _id?: ObjectId;
  /** sessions._id 참조 */
  sessionId: string;
  /** repository seed가 이 historical report에 적용한 immutable source ledger. */
  provenanceSourceIds?: string[];
  sessionTitle: string;
  /** 지도/목록에 표시할 고정 보고서 번호. 없으면 날짜순 위치로 계산한다. */
  reportNumber?: string;
  /** 보고서 본문·역링크·검색 결과를 열람할 수 있는 최소 ERP 역할. 미설정 legacy 행은 U로 본다. */
  minRole?: RoleLevel;
  summary: string;
  highlights: string[];
  participants: string[];
  /** 명시적 graph link: catalog slug 목록. */
  relatedCatalogSlugs?: string[];
  /** 명시적 graph link: personnel codename 목록. */
  relatedPersonnelCodenames?: string[];
  /** 명시적 graph link: wiki slug 목록. */
  relatedWikiSlugs?: string[];
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
  | "_id"
  | "sessionTitle"
  | "provenanceSourceIds"
  | "createdAt"
  | "updatedAt"
>;
