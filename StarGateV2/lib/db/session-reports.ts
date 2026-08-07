/**
 * session_reports CRUD — shared-db로 이전됨 (shim)
 */

import "./init";

export {
  listSessionReports,
  listVisibleSessionReports,
  listSessionReportRefs,
  listVisibleSessionReportRefs,
  findReportBySessionId,
  findReportById,
  findVisibleReportById,
  findSessionReportsBySessionIds,
  findSessionReportsForPersonnel,
  normalizeSessionReportMinRole,
  isSessionReportVisibleToRole,
  sessionReportVisibilityFilter,
  findSessionReportReferenceTargetIssues,
  validateAndLockSessionReportWrite,
  sanitizeSessionReportReferencesForPublicTargets,
  lockSessionReportReferenceTargets,
  lockAndAssertNoSessionReportInboundReference,
  hasSessionReportInboundReference,
  assertNoSessionReportInboundReference,
  SessionReportReferenceConflictError,
  SessionReportReferenceTargetError,
  SessionReportAlreadyExistsError,
  SessionReportSourceNotFoundError,
  SessionReportInboundReferenceError,
  createSessionReport,
  updateSessionReport,
  deleteSessionReport,
} from "@stargate/shared-db";

export type {
  SessionReportRef,
  SessionReportReferences,
  SessionReportReferenceField,
  SessionReportReferenceTargetIssue,
} from "@stargate/shared-db";
