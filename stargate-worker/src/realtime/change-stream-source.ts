import type {
  ChangeStream,
  ChangeStreamDocument,
  Db,
  Document,
  ResumeToken,
} from "mongodb";

import type { WorkerLogger } from "../logger.js";
import type { ChangeStreamCheckpointPort } from "./checkpoint-port.js";
import {
  REALTIME_CHANGE_STREAM_COLLECTIONS,
  type RealtimeDatabaseChange,
} from "./resource-mapper.js";

export interface RealtimeChangeStreamCallbacks {
  onChange(change: RealtimeDatabaseChange): Promise<void> | void;
  onError(error: unknown): Promise<void> | void;
  onReady?(): Promise<void> | void;
}

export interface RealtimeChangeStreamSource {
  start(callbacks: RealtimeChangeStreamCallbacks): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
}

function documentId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toHexString" in value) {
    const candidate = value as { toHexString(): string };
    return candidate.toHexString();
  }
  return String(value);
}

export class MongoRealtimeChangeStreamSource
  implements RealtimeChangeStreamSource
{
  #ready = false;
  #stopping = false;
  #stream: ChangeStream<Document, ChangeStreamDocument<Document>> | null = null;
  #consumePromise: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly checkpoints: ChangeStreamCheckpointPort,
    private readonly logger: WorkerLogger,
    private readonly checkpointKey = "realtime.invalidate.v1",
    private readonly reconnectDelayMs = 1_000,
  ) {}

  async start(callbacks: RealtimeChangeStreamCallbacks): Promise<void> {
    if (this.#consumePromise) return;
    this.#stopping = false;

    const pipeline = [
      {
        $match: {
          "ns.coll": { $in: REALTIME_CHANGE_STREAM_COLLECTIONS },
        },
      },
    ];
    try {
      const first = await this.#openWithCheckpoint(pipeline, callbacks);
      this.#ready = true;
      await callbacks.onReady?.();
      this.#consumePromise = this.#run(callbacks, pipeline, first);
    } catch (error) {
      await this.#closeCurrentStream();
      this.#ready = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#ready = false;
    await this.#closeCurrentStream();
    await this.#consumePromise?.catch(() => {});
    this.#consumePromise = null;
  }

  isReady(): boolean {
    return this.#ready;
  }

  async #consume(
    callbacks: RealtimeChangeStreamCallbacks,
    first: ChangeStreamDocument<Document> | null,
  ): Promise<void> {
    if (first) await this.#handle(first, callbacks);
    if (!this.#stream) return;

    for await (const change of this.#stream) {
      await this.#handle(change, callbacks);
    }
  }

  async #run(
    callbacks: RealtimeChangeStreamCallbacks,
    pipeline: Document[],
    first: ChangeStreamDocument<Document> | null,
  ): Promise<void> {
    let initial = first;
    while (!this.#stopping) {
      try {
        await this.#consume(callbacks, initial);
        if (this.#stopping) return;
        throw new Error("Mongo Change Stream이 예기치 않게 종료됐습니다.");
      } catch (error) {
        if (this.#stopping) return;
        this.#ready = false;
        this.logger.error("change_stream_failed", error);
        await callbacks.onError(error);
        await this.#closeCurrentStream();
      }

      await this.#waitBeforeReconnect();
      if (this.#stopping) return;

      try {
        initial = await this.#openWithCheckpoint(pipeline, callbacks);
        this.#ready = true;
        await callbacks.onReady?.();
        this.logger.info("change_stream_reconnected", {
          checkpointKey: this.checkpointKey,
        });
      } catch (error) {
        initial = null;
        this.#ready = false;
        await this.#closeCurrentStream();
        this.logger.error("change_stream_reconnect_failed", error);
        await callbacks.onError(error);
      }
    }
  }

  async #handle(
    change: ChangeStreamDocument<Document>,
    callbacks: RealtimeChangeStreamCallbacks,
  ): Promise<void> {
    const detail = change as ChangeStreamDocument<Document> & {
      ns?: { coll?: string };
      documentKey?: { _id?: unknown };
      updateDescription?: { updatedFields?: Record<string, unknown> };
    };
    const collectionName = detail.ns?.coll;
    if (!collectionName) return;

    await callbacks.onChange({
      collectionName,
      operationType: change.operationType,
      documentId: documentId(detail.documentKey?._id),
      updatedFields: Object.keys(
        detail.updateDescription?.updatedFields ?? {},
      ),
    });
    await this.checkpoints.save(this.checkpointKey, change._id);
  }

  async #open(
    pipeline: Document[],
    resumeAfter: unknown | null,
  ): Promise<ChangeStreamDocument<Document> | null> {
    this.#stream = this.db.watch(pipeline, {
      fullDocument: "updateLookup",
      maxAwaitTimeMS: 1_000,
      ...(resumeAfter ? { resumeAfter: resumeAfter as ResumeToken } : {}),
    });
    return this.#stream.tryNext();
  }

  async #openWithCheckpoint(
    pipeline: Document[],
    callbacks: RealtimeChangeStreamCallbacks,
  ): Promise<ChangeStreamDocument<Document> | null> {
    const resumeAfter = await this.checkpoints.load(this.checkpointKey);
    try {
      return await this.#open(pipeline, resumeAfter);
    } catch (error) {
      await this.#closeCurrentStream();
      if (!resumeAfter) throw error;
      this.logger.warn("change_stream_resume_token_rejected", {
        checkpointKey: this.checkpointKey,
      });
      await this.checkpoints.clear(this.checkpointKey);
      await callbacks.onError(error);
      return this.#open(pipeline, null);
    }
  }

  async #waitBeforeReconnect(): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, this.reconnectDelayMs);
      if (!this.#stopping) return;
      clearTimeout(timer);
      resolve();
    });
  }

  async #closeCurrentStream(): Promise<void> {
    const stream = this.#stream;
    this.#stream = null;
    await stream?.close().catch(() => {});
  }
}
