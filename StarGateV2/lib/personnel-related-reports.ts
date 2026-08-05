import type { LoreSheet } from "@/types/character";

import { findSessionReportsForPersonnel } from "@/lib/db/session-reports";

export interface PersonnelRelatedReport {
  id: string;
  sessionId: string;
  sessionTitle: string;
  locationLabel?: string;
  createdAt?: Date | string;
}

/** Dossier 활동·성격 관찰이 참조하는 작전보고서를 sessionId로 좁혀 조회한다. */
export async function findPersonnelRelatedReports(
  lore: LoreSheet,
  codename: string,
): Promise<PersonnelRelatedReport[]> {
  const personalityObservations = Array.isArray(lore.personalityObservations)
    ? lore.personalityObservations
    : [];
  const sessionIds = new Set([
    ...(lore.appearsInEvents ?? []),
    ...(lore.sessionAppearances ?? []).map(
      (appearance) => appearance.sessionId,
    ),
    ...personalityObservations.map(
      (observation) => observation.sessionId,
    ),
  ]);
  const validSessionIds = Array.from(sessionIds).filter(
    (sessionId) =>
      typeof sessionId === "string" && sessionId.trim().length > 0,
  );
  const reports = await findSessionReportsForPersonnel(
    validSessionIds,
    codename,
  );
  return reports
    .map((report) => ({
      id: report._id?.toString() ?? "",
      sessionId: report.sessionId,
      sessionTitle: report.sessionTitle,
      locationLabel: report.locationLabel,
      createdAt: report.createdAt,
    }))
    .filter((report) => report.id.length > 0);
}
