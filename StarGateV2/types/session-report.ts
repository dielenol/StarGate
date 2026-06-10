/**
 * @deprecated shared-db에서 직접 import하세요.
 */

import type { SessionReport as DbSessionReport } from "@stargate/shared-db/types";

export type {
  SessionReport,
  SessionReportMapPrecision,
  CreateSessionReportInput,
} from "@stargate/shared-db/types";

export type ClientSessionReport = Omit<
  DbSessionReport,
  "_id" | "createdAt" | "updatedAt"
> & {
  _id: string;
  createdAt: string;
  updatedAt: string;
};
