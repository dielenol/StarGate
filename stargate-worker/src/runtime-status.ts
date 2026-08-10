import type { WorkerConfig, WorkerConsumerName } from "./config.js";

export function activeMutationConsumersForConfig(
  config: Pick<
    WorkerConfig,
    "mode" | "enabledConsumers" | "researchLabWorkerEnabled"
  >,
): WorkerConsumerName[] {
  return config.mode === "active" &&
    config.researchLabWorkerEnabled &&
    config.enabledConsumers.includes("research-lab")
    ? ["research-lab"]
    : [];
}
