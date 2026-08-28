import type { WorkerConfig, WorkerConsumerName } from "./config.js";

export function activeMutationConsumersForConfig(
  config: Pick<
    WorkerConfig,
    | "mode"
    | "enabledConsumers"
    | "researchLabWorkerEnabled"
  >,
): WorkerConsumerName[] {
  if (config.mode !== "active") return [];
  const active: WorkerConsumerName[] = [];
  if (
    config.researchLabWorkerEnabled &&
    config.enabledConsumers.includes("research-lab")
  ) {
    active.push("research-lab");
  }
  return active;
}
