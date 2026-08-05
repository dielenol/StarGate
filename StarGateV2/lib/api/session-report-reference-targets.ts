import type { SessionReportReferenceTargetIssue } from "@/lib/db/session-reports";

const FIELD_LABELS: Record<
  SessionReportReferenceTargetIssue["field"],
  string
> = {
  relatedCatalogSlugs: "카탈로그 slug",
  relatedPersonnelCodenames: "인물 codename",
  relatedWikiSlugs: "위키 slug",
};

export function describeSessionReportReferenceTargetIssues(
  issues: SessionReportReferenceTargetIssue[],
): { error: string; status: 400 | 409 } {
  const ambiguous = issues.some((issue) => issue.reason === "ambiguous");
  const details = issues
    .map(
      (issue) =>
        `${FIELD_LABELS[issue.field]} '${issue.value}' (${issue.reason === "missing" ? "미존재" : "중복"})`,
    )
    .join(", ");
  return {
    error: `구조화 로어 링크를 확인할 수 없습니다: ${details}`,
    status: ambiguous ? 409 : 400,
  };
}
