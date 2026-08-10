import {
  normalizeSessionReportMinRole,
  ROLE_LEVEL_RANK,
  type SessionReportReferenceTargetIssue,
  type SessionReportReferences,
} from "@stargate/shared-db";
import type { Document } from "mongodb";

type ReferenceField = SessionReportReferenceTargetIssue["field"];

interface PlannedReferenceTarget {
  isPublic: boolean;
}

export type PlannedReferenceTargets = Record<
  ReferenceField,
  Map<string, PlannedReferenceTarget>
>;

const REFERENCE_FIELDS: readonly ReferenceField[] = [
  "relatedWikiSlugs",
  "relatedPersonnelCodenames",
  "relatedCatalogSlugs",
];

export function createPlannedReferenceTargets(): PlannedReferenceTargets {
  return {
    relatedWikiSlugs: new Map(),
    relatedPersonnelCodenames: new Map(),
    relatedCatalogSlugs: new Map(),
  };
}

export function recordPlannedReferenceTarget(
  collection: string,
  expectedIdentity: unknown,
  candidate: Document | null,
  planned: PlannedReferenceTargets,
): void {
  if (!candidate) return;

  const target =
    collection === "wiki_pages"
      ? {
          field: "relatedWikiSlugs" as const,
          identity: candidate.slug,
          isPublic: candidate.isPublic === true,
        }
      : collection === "characters"
        ? {
            field: "relatedPersonnelCodenames" as const,
            identity: candidate.codename,
            isPublic: candidate.isPublic !== false,
          }
        : collection === "master_items"
          ? {
              field: "relatedCatalogSlugs" as const,
              identity: candidate.slug,
              isPublic: candidate.isPublic !== false,
            }
          : null;

  if (!target || typeof target.identity !== "string") return;
  if (target.identity !== expectedIdentity) {
    throw new Error(
      `[seed-payload] dry-run planned reference target identity 불일치: ${collection}`,
    );
  }
  planned[target.field].set(target.identity, { isPublic: target.isPublic });
}

function isVisibleToReport(
  field: ReferenceField,
  target: PlannedReferenceTarget,
  reportMinRole: unknown,
): boolean {
  const minRole = normalizeSessionReportMinRole(reportMinRole);
  if (minRole === null) return false;
  if (target.isPublic) return true;
  if (field === "relatedPersonnelCodenames") return minRole === "GM";
  return ROLE_LEVEL_RANK[minRole] >= ROLE_LEVEL_RANK.V;
}

/**
 * DB 조회 결과를 같은 payload 파일에서 앞서 계획된 target 최종 상태로 보정한다.
 * execute는 파일 단위 transaction 안에서 envelope 순서대로 쓰므로, 이 preview도
 * 현재 파일의 앞선 envelope만 반영해야 한다.
 */
export function reconcilePlannedReferenceTargetIssues(
  references: SessionReportReferences,
  reportMinRole: unknown,
  issues: readonly SessionReportReferenceTargetIssue[],
  planned: PlannedReferenceTargets,
): SessionReportReferenceTargetIssue[] {
  const issueByKey = new Map(
    issues.map((issue) => [`${issue.field}\u0000${issue.value}`, issue]),
  );

  for (const field of REFERENCE_FIELDS) {
    for (const value of references[field] ?? []) {
      const target = planned[field].get(value);
      if (!target) continue;
      const key = `${field}\u0000${value}`;
      const existingIssue = issueByKey.get(key);
      if (isVisibleToReport(field, target, reportMinRole)) {
        if (existingIssue?.reason === "missing") issueByKey.delete(key);
      } else if (!existingIssue) {
        issueByKey.set(key, { field, value, reason: "missing" });
      }
    }
  }

  return [...issueByKey.values()];
}
