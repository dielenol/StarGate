import "server-only";

import type { ClientSession } from "mongodb";

import type { EquipmentResearchProject } from "@/lib/db/equipment-research";
import { enqueueWorkflowStatusWebhook } from "@/lib/outbox/integration";
import type { WorkflowStatusWebhookPayload } from "@/lib/outbox/contracts";

type ResearchWorkflowProject = Pick<
  EquipmentResearchProject,
  "_id" | "key" | "tier" | "scope" | "targetCharacterIds"
>;

export async function enqueueEquipmentResearchWorkflowStatus(input: {
  project: ResearchWorkflowProject;
  stage: "STARTED" | "RUSHED" | "APPLIED";
  revision: number;
  actor: WorkflowStatusWebhookPayload["actor"];
  summary: string;
  occurredAt: Date;
  dedupeToken: string;
  session: ClientSession;
}): Promise<void> {
  if (!input.project._id) {
    throw new Error("장비 연구 workflow에 프로젝트 ID가 필요합니다.");
  }
  const projectId = String(input.project._id);
  await enqueueWorkflowStatusWebhook(
    {
      workflow: "EQUIPMENT_RESEARCH",
      workflowId: projectId,
      stage: input.stage,
      revision: input.revision,
      actor: input.actor,
      summary: input.summary,
      target: `${input.project.key} · ${input.project.scope === "team" ? "팀" : "개인"} 연구`,
      delegatedTo: ["STARGATE-WORKER"],
      details: [
        { name: "등급", value: `T${input.project.tier}` },
        {
          name: "적용 대상",
          value: `${input.project.targetCharacterIds.length.toLocaleString("ko-KR")}명`,
        },
      ],
      urlPath: "/erp/equipment-shop/lab",
      occurredAt: input.occurredAt,
    },
    `workflow:equipment-research:${projectId}:${input.stage}:${input.dedupeToken}`,
    { session: input.session },
  );
}
