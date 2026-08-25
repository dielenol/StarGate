import type { WorkerConfig, WorkerConsumerName } from "./config.js";

export function activeMutationConsumersForConfig(
  config: Pick<
    WorkerConfig,
    | "mode"
    | "enabledConsumers"
    | "researchLabWorkerEnabled"
    | "hallOfFameV2WritesEnabled"
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
  if (
    config.hallOfFameV2WritesEnabled &&
    config.enabledConsumers.includes("honor-analysis")
  ) {
    active.push("honor-analysis");
  }
  return active;
}
