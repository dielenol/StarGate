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
    [
      "ROUTE_SELECTED",
      "ALREADY_SELECTED",
      "DATA_SYNCED",
      "ROUTE_FAILED",
      "SYNC_FAILED",
      "SWITCHED",
      "ALREADY_ACTIVE",
      "RECOVERY_REQUIRED",
    ].includes(action.result)
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
      action: action.action === "SYNC_DATA"
        ? "Nochichim VTT 데이터 동기화 완료"
        : "Nochichim VTT 공개 경로 선택 완료",
      actor: { ...action.actor, role: "GM" },
      summary: `${action.sourceHost} → ${action.targetHost} · ${action.result}`,
      target: "nochiijjim.com",
      details: [
        { name: "요청 ID", value: action.requestId },
        {
          name: action.action === "SYNC_DATA" ? "데이터 원본" : "이전 공개 경로",
          value: action.sourceHost,
        },
        {
          name: action.action === "SYNC_DATA" ? "데이터 대상" : "선택 공개 경로",
          value: action.targetHost,
        },
        {
          name: "데이터 세대",
          value: action.generation === null
            ? "확인 불가"
            : String(action.generation),
        },
        { name: "소스 커밋", value: action.sourceRevision ?? "확인 불가" },
        {
          name: action.action === "SYNC_DATA" ? "실행 방식" : "안전 조건 우회",
          value: action.action === "SYNC_DATA"
            ? "명시적 수동 동기화"
            : action.force
              ? "구형 요청에서 사용됨"
              : "허용 안 함",
        },
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
