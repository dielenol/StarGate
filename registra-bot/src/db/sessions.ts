/**
 * 세션 CRUD — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db에서 직접 import하세요.
 */

export type {
  CreateSessionInput,
  UpdateOpenSessionTimeResult,
  ReminderClaimResult,
} from "@stargate/shared-db";

export {
  createSession,
  findSessionById,
  updateSessionStatus,
  updateSessionMessageId,
  deleteSessionById,
  updateSessionStatusIfCurrent,
  findOpenSessionsPastClose,
  findAllOpenSessions,
  findOpenSessionsByGuild,
  findOpenAndClosedSessionsByGuildOrderByTarget,
  findSessionsByGuildInMonth,
  findSessionsForStartReminder,
  findLatestOpenSessionByGuild,
  findLatestClosedSessionByGuild,
  findSessionByIdInGuild,
  updateSessionCloseDateTime,
  updateSessionTargetDateTime,
  updateSessionTargetAndCloseDateTime,
  setSessionReminderFlags,
  claimSessionStartReminder,
  markSessionStartReminderSent,
  releaseSessionStartReminderClaim,
  extendSessionStartReminderClaimLease,
  beginSessionFinalization,
  markSessionFinalizationAnnouncementDone,
  recordSessionFinalizationResultMessage,
  markSessionFinalizationLogDone,
  completeSessionFinalization,
  findSessionsPendingFinalization,
} from "@stargate/shared-db";
