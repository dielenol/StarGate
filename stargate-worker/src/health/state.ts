import { readFileSync } from "node:fs";

import type { WorkerMode } from "../config.js";

export type WorkerProcessState =
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "STOPPED";

export type ReadinessComponent = "mongo" | "consumers" | "changeStream";

export interface HealthSnapshot {
  service: "stargate-worker";
  sourceRevision: string;
  state: WorkerProcessState;
  uptimeSeconds: number;
}

export interface ReadinessSnapshot extends HealthSnapshot {
  mode: WorkerMode;
  ready: boolean;
  components: Record<ReadinessComponent, boolean>;
}

function loadSourceRevision(): string {
  try {
    return readFileSync(
      new URL("../source-revision", import.meta.url),
      "utf8",
    ).trim();
  } catch {
    return "development";
  }
}

export const WORKER_SOURCE_REVISION = loadSourceRevision();

export class WorkerHealthState {
  readonly #startedAt = Date.now();
  readonly #components: Record<ReadinessComponent, boolean> = {
    mongo: false,
    consumers: false,
    changeStream: false,
  };
  #state: WorkerProcessState = "STARTING";

  constructor(
    readonly mode: WorkerMode,
    readonly sourceRevision: string = WORKER_SOURCE_REVISION,
  ) {}

  setProcessState(state: WorkerProcessState): void {
    this.#state = state;
  }

  setComponent(component: ReadinessComponent, ready: boolean): void {
    this.#components[component] = ready;
  }

  health(): HealthSnapshot {
    return {
      service: "stargate-worker",
      sourceRevision: this.sourceRevision,
      state: this.#state,
      uptimeSeconds: Math.max(
        0,
        Math.floor((Date.now() - this.#startedAt) / 1_000),
      ),
    };
  }

  readiness(): ReadinessSnapshot {
    const components = { ...this.#components };
    return {
      ...this.health(),
      mode: this.mode,
      ready:
        this.#state === "RUNNING" &&
        Object.values(components).every(Boolean),
      components,
    };
  }
}
