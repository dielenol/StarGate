import type {
  VttHostLastAction,
  VttHostStatus,
} from "@/types/vtt-host-control";

import {
  findMissingGmAdminAuditDedupeKeys,
  scheduleGmAdminAudit,
} from "@/lib/notifications/gm-admin-audit";
import { acknowledgeVttHostAudits } from "@/lib/vtt-runtime/host-control-client";

export type VttHostAuditReconcileResult =
  | { status: "NO_COMPLETED_ACTION" }
  | { status: "ALREADY_RECORDED"; requestIds: string[] }
  | { status: "QUEUED"; requestIds: string[] };

function isAuditableCompletedAction(
  action: VttHostLastAction,
): action is VttHostLastAction & {
  actor: NonNullable<VttHostLastAction["actor"]>;
} {
  return (
    action.actor !== null &&
    (action.result === "SWITCHED" || action.result === "ALREADY_ACTIVE")
  );
}

function completedAuditDedupeKey(requestId: string): string {
  return `vtt-host-completed:${requestId}`;
}

export async function reconcileCompletedVttHostAudit(
  status: VttHostStatus,
): Promise<VttHostAuditReconcileResult> {
  const actions = [
    ...(Array.isArray(status.completedActions) ? status.completedActions : []),
  ].filter(isAuditableCompletedAction).filter(
    (action, index, all) => (
      all.findIndex(candidate => candidate.requestId === action.requestId) === index
    ),
  );
  if (actions.length === 0) {
    return { status: "NO_COMPLETED_ACTION" };
  }

  const missingDedupeKeys = new Set(await findMissingGmAdminAuditDedupeKeys(
    actions.map(action => completedAuditDedupeKey(action.requestId)),
  ));
  const missingActions = actions.filter(action => (
    missingDedupeKeys.has(completedAuditDedupeKey(action.requestId))
  ));
  if (missingActions.length === 0) {
    await acknowledgeVttHostAudits(actions.map(action => action.requestId));
    return {
      status: "ALREADY_RECORDED",
      requestIds: actions.map(action => action.requestId),
    };
  }

  await Promise.all(missingActions.map(action => scheduleGmAdminAudit(
    {
      action: "Nochichim VTT 호스트 전환 완료",
      actor: { ...action.actor, role: "GM" },
      summary: `${action.sourceHost} → ${action.targetHost} · ${action.result}`,
      target: "nochiijjim.com",
      details: [
        { name: "요청 ID", value: action.requestId },
        { name: "이전 호스트", value: action.sourceHost },
        { name: "완료 호스트", value: action.targetHost },
        {
          name: "데이터 세대",
          value: action.generation === null
            ? "확인 불가"
            : String(action.generation),
        },
        { name: "소스 커밋", value: action.sourceRevision ?? "확인 불가" },
        { name: "접속자 재확인", value: action.force ? "예" : "아니오" },
      ],
      timestamp: new Date(action.completedAt),
    },
    { dedupeKey: completedAuditDedupeKey(action.requestId) },
  )));
  await acknowledgeVttHostAudits(actions.map(action => action.requestId));
  return {
    status: "QUEUED",
    requestIds: missingActions.map(action => action.requestId),
  };
}
