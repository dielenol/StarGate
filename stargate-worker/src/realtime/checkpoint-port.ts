/** Change Stream resume token 저장소 경계. */
export interface ChangeStreamCheckpointPort {
  load(key: string): Promise<unknown | null>;
  save(key: string, token: unknown): Promise<void>;
  clear(key: string): Promise<void>;
}

export class MemoryCheckpointAdapter implements ChangeStreamCheckpointPort {
  readonly #values = new Map<string, unknown>();

  async load(key: string): Promise<unknown | null> {
    return this.#values.get(key) ?? null;
  }

  async save(key: string, token: unknown): Promise<void> {
    this.#values.set(key, token);
  }

  async clear(key: string): Promise<void> {
    this.#values.delete(key);
  }
}

export class SharedDbCheckpointAdapter
  implements ChangeStreamCheckpointPort
{
  async load(key: string): Promise<unknown | null> {
    const checkpoint = await getWorkerCheckpoint(key);
    return checkpoint?.resumeToken ?? null;
  }

  async save(key: string, token: unknown): Promise<void> {
    await saveWorkerCheckpoint(key, token);
  }

  async clear(key: string): Promise<void> {
    await clearWorkerCheckpoint(key);
  }
}
import {
  clearWorkerCheckpoint,
  getWorkerCheckpoint,
  saveWorkerCheckpoint,
} from "@stargate/shared-db";
