import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import type {
  RealtimeInvalidateV1,
  RealtimeResource,
  RealtimeSessionRefreshV1,
} from "@stargate/core";
import { Server, type Socket } from "socket.io";

import type { WorkerLogger } from "../logger.js";
import type {
  RealtimePrincipal,
  RealtimeTicketVerifier,
} from "./ticket-verifier.js";

interface ServerToClientEvents {
  invalidate: (event: RealtimeInvalidateV1) => void;
  "session-refresh": (event: RealtimeSessionRefreshV1) => void;
}

interface InterServerEvents {}
interface ClientToServerEvents {}

interface SocketData {
  principal: RealtimePrincipal;
  connectionGeneration: number;
}

type ErpSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

function handshakeToken(socket: ErpSocket): string {
  const token = socket.handshake.auth?.token;
  return typeof token === "string" ? token : "";
}

export class RealtimeSocketServer {
  readonly #io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;
  readonly #socketsByUserId = new Map<string, Set<ErpSocket>>();
  readonly #pendingByUserId = new Map<string, number>();
  readonly #reservationBySocketId = new Map<string, string>();
  #pendingConnections = 0;
  #connectionGeneration = 0;

  constructor(
    httpServer: HttpServer,
    options: {
      allowedOrigins: string[];
      maxPayloadBytes: number;
      maxConnections: number;
      maxConnectionsPerUser: number;
      canAcceptConnections?: () => boolean;
      verifier: RealtimeTicketVerifier;
      logger: WorkerLogger;
    },
  ) {
    const allowedOrigins = new Set(options.allowedOrigins);
    this.#io = new Server(httpServer, {
      transports: ["websocket"],
      allowUpgrades: false,
      maxHttpBufferSize: options.maxPayloadBytes,
      cors: {
        origin: options.allowedOrigins,
        methods: ["GET"],
      },
      allowRequest(request, callback) {
        const origin = request.headers.origin;
        callback(null, Boolean(origin && allowedOrigins.has(origin)));
      },
    });

    const namespace = this.#io.of("/erp");
    namespace.use(async (socket: ErpSocket, next) => {
      const connectionGeneration = this.#connectionGeneration;
      try {
        if (options.canAcceptConnections && !options.canAcceptConnections()) {
          next(new Error("not_ready"));
          return;
        }
        socket.data.principal = await options.verifier.verify(
          handshakeToken(socket),
        );
        if (
          connectionGeneration !== this.#connectionGeneration ||
          (options.canAcceptConnections &&
            !options.canAcceptConnections())
        ) {
          next(new Error("not_ready"));
          return;
        }
        socket.data.connectionGeneration = connectionGeneration;
        const userSockets = this.#socketsByUserId.get(
          socket.data.principal.userId,
        );
        if (
          namespace.sockets.size + this.#pendingConnections >=
          options.maxConnections
        ) {
          next(new Error("connection_limit"));
          return;
        }
        const pendingForUser =
          this.#pendingByUserId.get(socket.data.principal.userId) ?? 0;
        if (
          (userSockets?.size ?? 0) + pendingForUser >=
          options.maxConnectionsPerUser
        ) {
          next(new Error("user_connection_limit"));
          return;
        }
        this.#reserveConnection(socket);
        next();
      } catch {
        this.#releaseConnectionReservation(socket.id);
        next(new Error("unauthorized"));
      }
    });
    namespace.on("connection", (socket: ErpSocket) => {
      if (
        socket.data.connectionGeneration !== this.#connectionGeneration ||
        (options.canAcceptConnections &&
          !options.canAcceptConnections())
      ) {
        this.#releaseConnectionReservation(socket.id);
        options.logger.warn("realtime_connection_invalidated", {
          socketId: socket.id,
        });
        socket.disconnect(true);
        return;
      }

      const { userId } = socket.data.principal;
      this.#releaseConnectionReservation(socket.id);
      const sockets = this.#socketsByUserId.get(userId) ?? new Set();
      sockets.add(socket);
      this.#socketsByUserId.set(userId, sockets);
      options.logger.info("realtime_connected", { userId, socketId: socket.id });

      socket.on("disconnect", () => {
        const current = this.#socketsByUserId.get(userId);
        current?.delete(socket);
        if (current?.size === 0) this.#socketsByUserId.delete(userId);
        options.logger.info("realtime_disconnected", {
          userId,
          socketId: socket.id,
        });
      });
    });
  }

  #reserveConnection(socket: ErpSocket): void {
    const { userId } = socket.data.principal;
    this.#pendingConnections += 1;
    this.#pendingByUserId.set(
      userId,
      (this.#pendingByUserId.get(userId) ?? 0) + 1,
    );
    this.#reservationBySocketId.set(socket.id, userId);
    socket.conn.once("close", () => {
      this.#releaseConnectionReservation(socket.id);
    });
  }

  #releaseConnectionReservation(socketId: string): void {
    const userId = this.#reservationBySocketId.get(socketId);
    if (!userId) return;

    this.#reservationBySocketId.delete(socketId);
    this.#pendingConnections = Math.max(0, this.#pendingConnections - 1);
    const remaining = (this.#pendingByUserId.get(userId) ?? 1) - 1;
    if (remaining <= 0) this.#pendingByUserId.delete(userId);
    else this.#pendingByUserId.set(userId, remaining);
  }

  emitInvalidate(
    resources: readonly RealtimeResource[],
    audienceUserIds?: readonly string[],
  ): void {
    const uniqueResources = [...new Set(resources)];
    if (uniqueResources.length === 0) return;

    const event: RealtimeInvalidateV1 = {
      version: 1,
      id: randomUUID(),
      type: "invalidate",
      resources: uniqueResources,
      emittedAt: new Date().toISOString(),
    };
    if (!audienceUserIds) {
      this.#io.of("/erp").emit("invalidate", event);
      return;
    }

    for (const userId of new Set(audienceUserIds)) {
      for (const socket of this.#socketsByUserId.get(userId) ?? []) {
        socket.emit("invalidate", event);
      }
    }
  }

  refreshSessionAndDisconnect(userId: string): number {
    // 활성 socket이 없어도 이전 identity로 검증 중인 handshake를 폐기한다.
    this.#connectionGeneration += 1;
    const sockets = this.#socketsByUserId.get(userId);
    if (!sockets) return 0;

    const event: RealtimeSessionRefreshV1 = {
      version: 1,
      id: randomUUID(),
      type: "session-refresh",
      reason: "identity-changed",
      emittedAt: new Date().toISOString(),
    };
    const count = sockets.size;
    for (const socket of sockets) {
      socket.emit("session-refresh", event);
      socket.disconnect(true);
    }
    this.#socketsByUserId.delete(userId);
    return count;
  }

  disconnectUser(userId: string): number {
    this.#connectionGeneration += 1;
    const sockets = this.#socketsByUserId.get(userId);
    if (!sockets) return 0;

    const count = sockets.size;
    for (const socket of sockets) socket.disconnect(true);
    this.#socketsByUserId.delete(userId);
    return count;
  }

  disconnectAll(): number {
    this.#connectionGeneration += 1;
    const sockets = [...this.#io.of("/erp").sockets.values()];
    for (const socket of sockets) socket.disconnect(true);
    return sockets.length;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.#io.close(() => resolve());
    });
  }
}
