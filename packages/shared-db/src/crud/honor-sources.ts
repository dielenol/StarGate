import type { Db } from "mongodb";

import { getDb } from "../client.js";
import { buildOperationHonorSourceMaterial } from "../honor-source.js";
import type {
  OperationHonorSourceMaterial,
  SessionReport,
} from "../types/index.js";
import { findHonorCandidateCharactersByCodenames } from "./honors.js";
import {
  normalizeSessionReportMinRole,
  sanitizeSessionReportReferencesForPublicTargets,
} from "./session-reports.js";

type OperationHonorSourceReport = Pick<
  SessionReport,
  | "_id"
  | "sessionId"
  | "minRole"
  | "summary"
  | "highlights"
  | "relatedPersonnelCodenames"
  | "updatedAt"
>;

export interface CurrentOperationHonorSource {
  report: OperationHonorSourceReport;
  source: OperationHonorSourceMaterial;
}

/**
 * 공개 공적의 현재 원본을 한 배치로 재검증한다. sourceHash 입력만 조회하므로
 * 해시에 쓰이지 않는 wiki/catalog 참조를 읽지 않는다. personnel 공개 target,
 * 전체 코드네임 중복, AGENT, ACTIVE owner 판정은 기존 resolver를 그대로 쓴다.
 */
export async function findCurrentOperationHonorSources(
  sourceKeys: readonly string[],
  options: { db?: Db } = {},
): Promise<Map<string, CurrentOperationHonorSource>> {
  const keys = [...new Set(sourceKeys)].filter(Boolean);
  if (keys.length === 0) return new Map();

  const db = options.db ?? await getDb();
  const reports = await db
    .collection<OperationHonorSourceReport>("session_reports")
    .find(
      { sessionId: { $in: keys } },
      {
        projection: {
          _id: 1,
          sessionId: 1,
          minRole: 1,
          summary: 1,
          highlights: 1,
          relatedPersonnelCodenames: 1,
          updatedAt: 1,
        },
      },
    )
    .toArray();

  const sourceCounts = new Map<string, number>();
  for (const report of reports) {
    sourceCounts.set(report.sessionId, (sourceCounts.get(report.sessionId) ?? 0) + 1);
  }
  const publicReports = reports.filter(
    (report) =>
      sourceCounts.get(report.sessionId) === 1 &&
      normalizeSessionReportMinRole(report.minRole) === "U",
  );
  const safeReports = await sanitizeSessionReportReferencesForPublicTargets(
    publicReports,
    { db },
  );
  const characters = await findHonorCandidateCharactersByCodenames(
    safeReports.flatMap((report) => report.relatedPersonnelCodenames ?? []),
    { db },
  );

  const resolved = new Map<string, CurrentOperationHonorSource>();
  for (const report of safeReports) {
    const source = buildOperationHonorSourceMaterial({ report, characters });
    if (source) resolved.set(report.sessionId, { report, source });
  }
  return resolved;
}
