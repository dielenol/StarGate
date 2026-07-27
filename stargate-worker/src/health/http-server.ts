import { createServer, type Server } from "node:http";

import type { RealtimeTicketConfig } from "../config.js";
import type { WorkerLogger } from "../logger.js";
import {
  createRealtimeTicketVerifier,
  type RealtimeTicketVerifier,
} from "../realtime/ticket-verifier.js";
import { RealtimeSocketServer } from "../realtime/socket-server.js";
import type { WorkerHealthState } from "./state.js";

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

export class WorkerHttpServer {
  readonly #server: Server;
  readonly realtime: RealtimeSocketServer;

  constructor(
    private readonly health: WorkerHealthState,
    realtimeConfig: RealtimeTicketConfig,
    logger: WorkerLogger,
    verifier: RealtimeTicketVerifier = createRealtimeTicketVerifier(
      realtimeConfig,
    ),
  ) {
    this.#server = createServer((request, response) => {
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "Method Not Allowed" });
        return;
      }
      if (request.url === "/healthz") {
        const snapshot = this.health.health();
        sendJson(response, snapshot.state === "STOPPED" ? 503 : 200, snapshot);
        return;
      }
      if (request.url === "/readyz") {
        const snapshot = this.health.readiness();
        sendJson(response, snapshot.ready ? 200 : 503, snapshot);
        return;
      }
      sendJson(response, 404, { error: "Not Found" });
    });
    this.realtime = new RealtimeSocketServer(this.#server, {
      allowedOrigins: realtimeConfig.allowedOrigins,
      maxPayloadBytes: realtimeConfig.maxPayloadBytes,
      maxConnections: realtimeConfig.maxConnections,
      maxConnectionsPerUser: realtimeConfig.maxConnectionsPerUser,
      canAcceptConnections: () => this.health.readiness().ready,
      verifier,
      logger,
    });
  }

  async listen(host: string, port: number): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.#server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.#server.off("error", onError);
        resolve();
      };
      this.#server.once("error", onError);
      this.#server.once("listening", onListening);
      this.#server.listen(port, host);
    });

    const address = this.#server.address();
    if (!address || typeof address === "string") {
      throw new Error("worker HTTP listen 주소를 확인할 수 없습니다.");
    }
    return address.port;
  }

  async close(): Promise<void> {
    await this.realtime.close();
    if (!this.#server.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
