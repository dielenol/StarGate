import {
  close as closeSharedDb,
  connect as connectSharedDb,
  getDb,
} from "@stargate/shared-db";
import type { Db } from "mongodb";

export interface DatabaseConnectionPort {
  connect(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<void>;
  db(): Promise<Db>;
}

export class SharedDbConnectionAdapter implements DatabaseConnectionPort {
  #connected = false;

  constructor(
    private readonly config: {
      uri: string;
      dbName: string;
      maxPoolSize: number;
    },
  ) {}

  async connect(): Promise<void> {
    await connectSharedDb({
      uri: this.config.uri,
      dbName: this.config.dbName,
      maxPoolSize: this.config.maxPoolSize,
    });
    this.#connected = true;
  }

  async close(): Promise<void> {
    if (!this.#connected) return;
    await closeSharedDb();
    this.#connected = false;
  }

  async ping(): Promise<void> {
    const db = await this.db();
    await db.command({ ping: 1 });
  }

  async db(): Promise<Db> {
    if (!this.#connected) {
      throw new Error("MongoDB 연결이 아직 준비되지 않았습니다.");
    }
    return getDb();
  }
}
