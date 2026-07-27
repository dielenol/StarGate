import { REALTIME_RESOURCES } from "@stargate/core";

import {
  SharedDbConnectionAdapter,
  type DatabaseConnectionPort,
} from "./adapters/shared-db-connection.js";
import { SharedDbIntegrationOutboxAdapter } from "./adapters/shared-db-outbox.js";
import type { WorkerConfig } from "./config.js";
import { ConsumerManager } from "./consumers/manager.js";
import type { DueWorkConsumerPort } from "./consumers/port.js";
import { createDefaultDomainConsumers } from "./consumers/factory.js";
import { WorkerLeaseSweeper } from "./consumers/lease-sweeper.js";
import { createShadowDomainConsumers } from "./consumers/shadow-consumers.js";
import { WorkerHttpServer } from "./health/http-server.js";
import { WorkerHealthState } from "./health/state.js";
import { logger as defaultLogger, type WorkerLogger } from "./logger.js";
import { createShadowOutboxConsumer } from "./outbox/shadow-consumer.js";
import { SharedDbIntegrationOutboxConsumer } from "./outbox/active-consumer.js";
import { createDefaultIntegrationOutboxHandlers } from "./outbox/default-handlers.js";
import type { IntegrationOutboxHandlerRegistry } from "./outbox/handler-registry.js";
import type { IntegrationOutboxPort } from "./outbox/port.js";
import {
  SharedDbCheckpointAdapter,
  type ChangeStreamCheckpointPort,
} from "./realtime/checkpoint-port.js";
import {
  MongoRealtimeChangeStreamSource,
  type RealtimeChangeStreamSource,
} from "./realtime/change-stream-source.js";
import { mapRealtimeChange } from "./realtime/resource-mapper.js";

export interface WorkerRuntimeDependencies {
  logger?: WorkerLogger;
  database?: DatabaseConnectionPort;
  checkpoints?: ChangeStreamCheckpointPort;
  consumers?: DueWorkConsumerPort[];
  integrationOutbox?: IntegrationOutboxPort;
  integrationOutboxHandlers?: IntegrationOutboxHandlerRegistry;
}

export class WorkerRuntime {
  readonly #health: WorkerHealthState;
  readonly #logger: WorkerLogger;
  readonly #database: DatabaseConnectionPort;
  readonly #checkpoints: ChangeStreamCheckpointPort;
  readonly #consumers: ConsumerManager;
  readonly #http: WorkerHttpServer;
  #changeStream: RealtimeChangeStreamSource | null = null;
  #stopPromise: Promise<void> | null = null;

  constructor(
    private readonly config: WorkerConfig,
    dependencies: WorkerRuntimeDependencies = {},
  ) {
    this.#logger = dependencies.logger ?? defaultLogger;
    this.#health = new WorkerHealthState(config.mode);
    this.#database =
      dependencies.database ?? new SharedDbConnectionAdapter(config.mongo);
    this.#checkpoints =
      dependencies.checkpoints ?? new SharedDbCheckpointAdapter();
    const integrationOutboxHandlers =
      config.mode === "active"
        ? dependencies.integrationOutboxHandlers ??
          createDefaultIntegrationOutboxHandlers()
        : null;
    const defaultConsumers =
      config.mode === "shadow"
        ? [
            ...createShadowDomainConsumers(),
            createShadowOutboxConsumer(),
          ]
        : [
            new WorkerLeaseSweeper(),
            ...createDefaultDomainConsumers(config.enabledConsumers),
            ...(integrationOutboxHandlers &&
            integrationOutboxHandlers.size > 0
              ? [
                  new SharedDbIntegrationOutboxConsumer(
                    dependencies.integrationOutbox ??
                      new SharedDbIntegrationOutboxAdapter({
                        kinds: integrationOutboxHandlers.kinds,
                      }),
                    integrationOutboxHandlers,
                  ),
                ]
              : []),
          ];
    this.#consumers = new ConsumerManager(
      config.mode,
      config.pollIntervalMs,
      dependencies.consumers ?? defaultConsumers,
      this.#logger,
      (ready) => this.#health.setComponent("consumers", ready),
    );
    this.#http = new WorkerHttpServer(
      this.#health,
      config.realtime,
      this.#logger,
    );
  }

  async start(): Promise<void> {
    try {
      const port = await this.#http.listen(this.config.host, this.config.port);
      this.#logger.info("http_listening", {
        host: this.config.host,
        port,
        mode: this.config.mode,
        replicaCount: this.config.replicaCount,
      });

      await this.#database.connect();
      await this.#database.ping();
      this.#health.setComponent("mongo", true);

      await this.#consumers.start();
      this.#health.setComponent("consumers", this.#consumers.isReady());

      const db = await this.#database.db();
      this.#changeStream = new MongoRealtimeChangeStreamSource(
        db,
        this.#checkpoints,
        this.#logger,
      );
      await this.#changeStream.start({
        onChange: (change) => {
          const mapped = mapRealtimeChange(change);
          if (!mapped) return;
          if (mapped.disconnectUserId) {
            const disconnected = this.#http.realtime.disconnectUser(
              mapped.disconnectUserId,
            );
            this.#logger.info("realtime_user_reauthentication", {
              userId: mapped.disconnectUserId,
              disconnected,
            });
          }
          this.#http.realtime.emitInvalidate(mapped.resources);
        },
        onError: () => {
          this.#health.setComponent("changeStream", false);
          // gap 이후에는 이전 ticket 연결을 재사용하지 않고 HTTP 재조회와
          // 새 ticket 인증을 강제한다.
          this.#http.realtime.emitInvalidate(REALTIME_RESOURCES);
          const disconnected = this.#http.realtime.disconnectAll();
          this.#logger.warn("realtime_change_stream_gap", {
            disconnected,
          });
        },
        onReady: () => {
          this.#health.setComponent("changeStream", true);
        },
      });
      this.#health.setComponent(
        "changeStream",
        this.#changeStream.isReady(),
      );
      this.#health.setProcessState("RUNNING");
      this.#logger.info("worker_started", { mode: this.config.mode });
    } catch (error) {
      this.#logger.error("worker_start_failed", error);
      await this.stop("startup-failure");
      throw error;
    }
  }

  stop(reason = "requested"): Promise<void> {
    if (this.#stopPromise) return this.#stopPromise;
    this.#stopPromise = this.#stop(reason);
    return this.#stopPromise;
  }

  async #stop(reason: string): Promise<void> {
    this.#health.setProcessState("STOPPING");
    this.#logger.info("worker_stopping", { reason });

    this.#health.setComponent("changeStream", false);
    await this.#changeStream?.stop().catch((error) => {
      this.#logger.error("change_stream_stop_failed", error);
    });

    this.#health.setComponent("consumers", false);
    await this.#consumers.stop().catch((error) => {
      this.#logger.error("consumers_stop_failed", error);
    });

    this.#health.setComponent("mongo", false);
    await this.#database.close().catch((error) => {
      this.#logger.error("mongo_close_failed", error);
    });

    this.#health.setProcessState("STOPPED");
    await this.#http.close().catch((error) => {
      this.#logger.error("http_close_failed", error);
    });
    this.#logger.info("worker_stopped", { reason });
  }
}
