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

export type PlannedReferenceVisibilityMutation =
  | { kind: "preserve" }
  | { kind: "set"; isPublic: boolean }
  | { kind: "set-on-insert"; isPublic: boolean }
  | { kind: "dynamic" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function classifyPlannedReferenceVisibilityMutation(plan: {
  payload?: Record<string, unknown>;
  update?: Record<string, unknown> | Record<string, unknown>[];
}): PlannedReferenceVisibilityMutation {
  if (plan.payload) {
    if (!("isPublic" in plan.payload)) return { kind: "preserve" };
    return typeof plan.payload.isPublic === "boolean"
      ? { kind: "set", isPublic: plan.payload.isPublic }
      : { kind: "dynamic" };
  }
  if (!plan.update) return { kind: "preserve" };

  const stages = Array.isArray(plan.update) ? plan.update : [plan.update];
  let mutation: PlannedReferenceVisibilityMutation = { kind: "preserve" };
  let classicTouches = 0;
  for (const stage of stages) {
    for (const [operator, operand] of Object.entries(stage)) {
      if (!isRecord(operand)) continue;
      const entry = Object.entries(operand).find(
        ([path]) => path.split(".", 1)[0] === "isPublic",
      );
      if (!entry) continue;
      if (!Array.isArray(plan.update)) classicTouches += 1;
      const value = entry[1];
      mutation =
        operator === "$set" && typeof value === "boolean"
          ? { kind: "set", isPublic: value }
          : operator === "$setOnInsert" && typeof value === "boolean"
            ? { kind: "set-on-insert", isPublic: value }
            : { kind: "dynamic" };
    }
  }
  return !Array.isArray(plan.update) && classicTouches > 1
    ? { kind: "dynamic" }
    : mutation;
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
  visibilityMutation: PlannedReferenceVisibilityMutation,
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
  const existing = planned[target.field].get(target.identity);
  if (!existing) {
    planned[target.field].set(target.identity, { isPublic: target.isPublic });
    return;
  }
  if (
    visibilityMutation.kind === "preserve" ||
    visibilityMutation.kind === "set-on-insert"
  ) {
    return;
  }
  if (visibilityMutation.kind === "dynamic") {
    throw new Error(
      `[seed-payload] 같은 파일의 선행 target 상태에 의존하는 동적 isPublic dry-run은 허용하지 않습니다: ${collection}`,
    );
  }
  planned[target.field].set(target.identity, {
    isPublic: visibilityMutation.isPublic,
  });
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
