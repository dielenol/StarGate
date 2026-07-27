import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { io } from "socket.io-client";

import { RealtimeSocketServer } from "../dist/realtime/socket-server.js";

function principal(userId, expiresInMs = 60_000) {
  return {
    userId,
    role: "J",
    expiresAt: Date.now() + expiresInMs,
  };
}

function connect(url, token, origin = "http://allowed.test") {
  return io(`${url}/erp`, {
    auth: { token },
    transports: ["websocket"],
    upgrade: false,
    reconnection: false,
    forceNew: true,
    extraHeaders: { Origin: origin },
  });
}

function waitForConnect(socket) {
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
}

function waitForConnectError(socket) {
  return new Promise((resolve, reject) => {
    socket.once("connect", () =>
      reject(new Error("연결이 거부되지 않았습니다.")),
    );
    socket.once("connect_error", resolve);
  });
}

test("Socket.IO는 Origin, ticket, 전체/사용자별 연결 제한을 적용한다", async () => {
  const server = createServer();
  const realtime = new RealtimeSocketServer(server, {
    allowedOrigins: ["http://allowed.test"],
    maxPayloadBytes: 4_096,
    maxConnections: 2,
    maxConnectionsPerUser: 1,
    verifier: {
      async verify(token) {
        if (!token.startsWith("user-")) throw new Error("unauthorized");
        return principal(token);
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const sockets = [];

  try {
    const first = connect(url, "user-one");
    sockets.push(first);
    await waitForConnect(first);

    const duplicate = connect(url, "user-one");
    sockets.push(duplicate);
    const duplicateError = await waitForConnectError(duplicate);
    assert.match(duplicateError.message, /user_connection_limit/);

    const disallowed = connect(
      url,
      "user-origin",
      "http://denied.test",
    );
    sockets.push(disallowed);
    await waitForConnectError(disallowed);

    const second = connect(url, "user-two");
    sockets.push(second);
    await waitForConnect(second);

    const overLimit = connect(url, "user-three");
    sockets.push(overLimit);
    const limitError = await waitForConnectError(overLimit);
    assert.match(limitError.message, /connection_limit/);

    assert.equal(realtime.disconnectUser("user-one"), 1);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await realtime.close();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("동시 handshake도 사용자별 연결 제한을 초과하지 않는다", async () => {
  const server = createServer();
  let releaseVerification;
  const verificationGate = new Promise((resolve) => {
    releaseVerification = resolve;
  });
  let verificationCount = 0;
  const realtime = new RealtimeSocketServer(server, {
    allowedOrigins: ["http://allowed.test"],
    maxPayloadBytes: 4_096,
    maxConnections: 10,
    maxConnectionsPerUser: 1,
    verifier: {
      async verify() {
        verificationCount += 1;
        if (verificationCount === 2) releaseVerification();
        await verificationGate;
        return principal("same-user");
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const first = connect(url, "first");
  const second = connect(url, "second");

  const outcome = (socket) =>
    new Promise((resolve) => {
      socket.once("connect", () => resolve("connected"));
      socket.once("connect_error", (error) =>
        resolve(`error:${error.message}`),
      );
    });

  try {
    const results = await Promise.all([outcome(first), outcome(second)]);
    assert.equal(
      results.filter((result) => result === "connected").length,
      1,
    );
    assert.equal(
      results.filter(
        (result) => result === "error:user_connection_limit",
      ).length,
      1,
    );
  } finally {
    first.disconnect();
    second.disconnect();
    await realtime.close();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("worker readiness가 false이면 ticket이 유효해도 연결을 거부한다", async () => {
  const server = createServer();
  const realtime = new RealtimeSocketServer(server, {
    allowedOrigins: ["http://allowed.test"],
    maxPayloadBytes: 4_096,
    maxConnections: 10,
    maxConnectionsPerUser: 2,
    canAcceptConnections: () => false,
    verifier: {
      async verify() {
        return principal("user-one");
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const socket = connect(
    `http://127.0.0.1:${address.port}`,
    "valid-ticket",
  );

  try {
    const error = await waitForConnectError(socket);
    assert.match(error.message, /not_ready/);
  } finally {
    socket.disconnect();
    await realtime.close();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("ticket TTL은 handshake에만 적용하고 정상 socket을 주기 종료하지 않는다", async () => {
  const server = createServer();
  const realtime = new RealtimeSocketServer(server, {
    allowedOrigins: ["http://allowed.test"],
    maxPayloadBytes: 4_096,
    maxConnections: 10,
    maxConnectionsPerUser: 2,
    verifier: {
      async verify() {
        return principal("long-lived-socket", 50);
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const socket = connect(
    `http://127.0.0.1:${address.port}`,
    "short-ticket",
  );

  try {
    await waitForConnect(socket);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(socket.connected, true);
  } finally {
    socket.disconnect();
    await realtime.close();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("verifier 대기 중 readiness가 내려가면 뒤늦은 handshake를 거부한다", async () => {
  const server = createServer();
  let ready = true;
  let releaseVerification;
  const verificationGate = new Promise((resolve) => {
    releaseVerification = resolve;
  });
  let verificationStarted;
  const started = new Promise((resolve) => {
    verificationStarted = resolve;
  });
  const realtime = new RealtimeSocketServer(server, {
    allowedOrigins: ["http://allowed.test"],
    maxPayloadBytes: 4_096,
    maxConnections: 10,
    maxConnectionsPerUser: 2,
    canAcceptConnections: () => ready,
    verifier: {
      async verify() {
        verificationStarted();
        await verificationGate;
        return principal("pending-readiness-user");
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const socket = connect(
    `http://127.0.0.1:${address.port}`,
    "pending-ticket",
  );
  const connectError = waitForConnectError(socket);

  try {
    await started;
    ready = false;
    releaseVerification();
    const error = await connectError;
    assert.match(error.message, /not_ready/);
  } finally {
    socket.disconnect();
    await realtime.close();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("gap 중 대기하던 handshake는 readiness 회복 뒤에도 generation fencing으로 거부한다", async () => {
  const server = createServer();
  let ready = true;
  let releaseVerification;
  const verificationGate = new Promise((resolve) => {
    releaseVerification = resolve;
  });
  let verificationStarted;
  const started = new Promise((resolve) => {
    verificationStarted = resolve;
  });
  const realtime = new RealtimeSocketServer(server, {
    allowedOrigins: ["http://allowed.test"],
    maxPayloadBytes: 4_096,
    maxConnections: 10,
    maxConnectionsPerUser: 2,
    canAcceptConnections: () => ready,
    verifier: {
      async verify() {
        verificationStarted();
        await verificationGate;
        return principal("pending-gap-user");
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const socket = connect(
    `http://127.0.0.1:${address.port}`,
    "pending-gap-ticket",
  );
  const connectError = waitForConnectError(socket);

  try {
    await started;
    ready = false;
    assert.equal(realtime.disconnectAll(), 0);
    ready = true;
    releaseVerification();
    const error = await connectError;
    assert.match(error.message, /not_ready/);
  } finally {
    socket.disconnect();
    await realtime.close();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("Change Stream gap 대응용 disconnectAll은 모든 활성 socket을 끊는다", async () => {
  const server = createServer();
  const realtime = new RealtimeSocketServer(server, {
    allowedOrigins: ["http://allowed.test"],
    maxPayloadBytes: 4_096,
    maxConnections: 10,
    maxConnectionsPerUser: 2,
    verifier: {
      async verify(token) {
        return principal(token);
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const first = connect(url, "gap-user-one");
  const second = connect(url, "gap-user-two");

  try {
    await Promise.all([waitForConnect(first), waitForConnect(second)]);
    const disconnected = Promise.all([
      new Promise((resolve) => first.once("disconnect", resolve)),
      new Promise((resolve) => second.once("disconnect", resolve)),
    ]);
    assert.equal(realtime.disconnectAll(), 2);
    assert.deepEqual(await disconnected, [
      "io server disconnect",
      "io server disconnect",
    ]);
  } finally {
    first.disconnect();
    second.disconnect();
    await realtime.close();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
