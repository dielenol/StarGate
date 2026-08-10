import "./init";

import { getDb } from "@stargate/shared-db";

import {
  isResearchLabWorkerRuntimeStatusReady,
  type ResearchLabWorkerRuntimeStatus,
} from "../research/research-lab-readiness";

export async function isResearchLabMutationRuntimeReady(
  now?: Date,
): Promise<boolean> {
  if (
    process.env.RESEARCH_LAB_MUTATIONS_ENABLED?.trim().toLowerCase() !== "true"
  ) {
    return false;
  }
  try {
    const status = await (await getDb())
      .collection<ResearchLabWorkerRuntimeStatus>("worker_runtime_status")
      .findOne({ _id: "active" });
    return isResearchLabWorkerRuntimeStatusReady(status, now ?? new Date());
  } catch (error) {
    console.error("[research-lab] worker readiness lookup failed", error);
    return false;
  }
}
