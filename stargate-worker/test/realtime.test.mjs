import assert from "node:assert/strict";
import test from "node:test";

import { SignJWT } from "jose";

import {
  mapRealtimeChange,
} from "../dist/realtime/resource-mapper.js";
import {
  RealtimeTicketError,
  createRealtimeTicketVerifier,
} from "../dist/realtime/ticket-verifier.js";
import { MongoRealtimeChangeStreamSource } from "../dist/realtime/change-stream-source.js";

const ticketConfig = {
  secret: "0123456789abcdef0123456789abcdef",
  issuer: "stargate-web",
  audience: "stargate-worker",
};

async function signTicket(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    version: 1,
    role: "J",
    status: "ACTIVE",
    ...overrides,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ticketConfig.issuer)
    .setAudience(ticketConfig.audience)
    .setSubject("507f1f77bcf86cd799439011")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(ticketConfig.secret));
}

test("Mongo 컬렉션 변경은 공개 데이터 없이 Query resource로만 매핑된다", () => {
  assert.deepEqual(
    mapRealtimeChange({
      collectionName: "character_inventory",
      operationType: "update",
      documentId: "inventory-id",
      updatedFields: ["quantity"],
    }),
    { resources: ["inventory"] },
  );
  assert.equal(
    mapRealtimeChange({
      collectionName: "unknown_collection",
      operationType: "insert",
      updatedFields: [],
    }),
    null,
  );
});

test("role/status 변경은 해당 사용자의 재인증을 요구한다", () => {
  assert.deepEqual(
    mapRealtimeChange({
      collectionName: "users",
      operationType: "update",
      documentId: "user-id",
      updatedFields: ["status"],
    }),
    {
      resources: ["users", "personnel"],
      disconnectUserId: "user-id",
    },
  );
});

test("서명·issuer·audience·ACTIVE 상태를 만족하는 ticket만 허용한다", async () => {
  const verifier = createRealtimeTicketVerifier(ticketConfig);
  const principal = await verifier.verify(await signTicket());
  assert.equal(principal.userId, "507f1f77bcf86cd799439011");
  assert.equal(principal.role, "J");
  assert.ok(principal.expiresAt > Date.now());
  assert.ok(principal.expiresAt <= Date.now() + 60_000);

  await assert.rejects(
    verifier.verify(await signTicket({ status: "SUSPENDED" })),
    RealtimeTicketError,
  );
  await assert.rejects(
    verifier.verify(
      await new SignJWT({
        version: 1,
        role: "J",
        status: "ACTIVE",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(ticketConfig.issuer)
        .setAudience("wrong-audience")
        .setSubject("507f1f77bcf86cd799439011")
        .setIssuedAt(Math.floor(Date.now() / 1000))
        .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
        .sign(new TextEncoder().encode(ticketConfig.secret)),
    ),
    RealtimeTicketError,
  );
  await assert.rejects(
    verifier.verify(
      await new SignJWT({
        version: 1,
        role: "J",
        status: "ACTIVE",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(ticketConfig.issuer)
        .setAudience(ticketConfig.audience)
        .setSubject("507f1f77bcf86cd799439011")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(new TextEncoder().encode(ticketConfig.secret)),
    ),
    RealtimeTicketError,
  );
});

test("Change Stream 일시 오류 뒤 checkpoint로 재연결하고 readiness를 복구한다", async () => {
  let watchCount = 0;
  let releaseSecondStream;
  const streams = [
    {
      async tryNext() {
        return null;
      },
      async close() {},
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw new Error("transient stream failure");
          },
        };
      },
    },
    {
      async tryNext() {
        return null;
      },
      async close() {
        releaseSecondStream?.();
      },
      [Symbol.asyncIterator]() {
        return {
          next() {
            return new Promise((resolve) => {
              releaseSecondStream = () =>
                resolve({ done: true, value: undefined });
            });
          },
        };
      },
    },
  ];
  const source = new MongoRealtimeChangeStreamSource(
    {
      watch() {
        const stream = streams[Math.min(watchCount, streams.length - 1)];
        watchCount += 1;
        return stream;
      },
    },
    {
      async load() {
        return { token: "checkpoint" };
      },
      async save() {},
      async clear() {},
    },
    {
      info() {},
      warn() {},
      error() {},
    },
    "test.checkpoint",
    1,
  );
  let errors = 0;
  let ready = 0;

  await source.start({
    async onChange() {},
    async onError() {
      errors += 1;
    },
    async onReady() {
      ready += 1;
    },
  });

  const deadline = Date.now() + 500;
  while (ready < 2 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(watchCount, 2);
  assert.equal(errors, 1);
  assert.equal(ready, 2);
  assert.equal(source.isReady(), true);

  await source.stop();
  assert.equal(source.isReady(), false);
});
