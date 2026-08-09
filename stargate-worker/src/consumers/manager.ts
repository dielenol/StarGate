import type { WorkerMode } from "../config.js";
import type { WorkerLogger } from "../logger.js";
import type { OperationalAlertReporter } from "../outbox/operational-alerts.js";
import type { DueWorkConsumerPort } from "./port.js";

export class ConsumerManager {
  readonly #controller = new AbortController();
  readonly #loops: Promise<void>[] = [];
  readonly #healthy = new Map<string, boolean>();
  #started = false;
  #ready = false;

  constructor(
    private readonly mode: WorkerMode,
    private readonly intervalMs: number,
    private readonly consumers: DueWorkConsumerPort[],
    private readonly logger: WorkerLogger,
    private readonly onReadinessChange?: (ready: boolean) => void,
    private readonly operationalAlerts?: OperationalAlertReporter,
  ) {}

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;

    for (const consumer of this.consumers) {
      this.#healthy.set(consumer.name, false);
      await this.#tick(consumer);
      this.#loops.push(this.#loop(consumer));
    }
    this.#refreshReadiness();
  }

  async stop(): Promise<void> {
    this.#setReady(false);
    this.#controller.abort();
    await Promise.allSettled(this.#loops);
    this.#loops.length = 0;
  }

  isReady(): boolean {
    return this.#ready;
  }

  isReadyExcluding(consumerName: string): boolean {
    return (
      this.#started &&
      this.consumers
        .filter((consumer) => consumer.name !== consumerName)
        .every((consumer) => this.#healthy.get(consumer.name) === true)
    );
  }

  async #loop(consumer: DueWorkConsumerPort): Promise<void> {
    while (!this.#controller.signal.aborted) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.intervalMs);
        this.#controller.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      if (this.#controller.signal.aborted) return;
      await this.#tick(consumer);
    }
  }

  async #tick(consumer: DueWorkConsumerPort): Promise<void> {
    try {
      const wasHealthy = this.#healthy.get(consumer.name) === true;
      const result = await consumer.tick({
        mode: this.mode,
        signal: this.#controller.signal,
      });
      this.#healthy.set(consumer.name, true);
      this.#refreshReadiness();
      this.logger.info("consumer_tick", {
        mode: this.mode,
        consumer: consumer.name,
        ...result,
      });
      const observedResult = wasHealthy
        ? result
        : { ...result, operationalRecovery: true };
      await this.operationalAlerts?.observe(consumer.name, observedResult).catch((error) => {
        this.logger.error("operational_alert_failed", error, {
          consumer: consumer.name,
        });
      });
    } catch (error) {
      this.#healthy.set(consumer.name, false);
      this.#refreshReadiness();
      this.logger.error("consumer_probe_failed", error, {
        consumer: consumer.name,
      });
      await this.operationalAlerts?.observe(consumer.name, {
        observedDue: 0,
        failed: 1,
        operationalAlert: {
          fingerprint: "consumer-probe-failed",
          severity: "WARNING",
          summary: "consumer poll 실행이 실패했습니다.",
        },
      }).catch((alertError) => {
        this.logger.error("operational_alert_failed", alertError, {
          consumer: consumer.name,
        });
      });
    }
  }

  #refreshReadiness(): void {
    this.#setReady(
      this.#started &&
        this.consumers.every(
          (consumer) => this.#healthy.get(consumer.name) === true,
        ),
    );
  }

  #setReady(ready: boolean): void {
    if (this.#ready === ready) return;
    this.#ready = ready;
    this.onReadinessChange?.(ready);
  }
}
