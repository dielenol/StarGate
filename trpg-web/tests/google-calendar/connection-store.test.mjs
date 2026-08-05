import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
const FIRST_GENERATION = "11111111-1111-4111-8111-111111111111";
const SECOND_GENERATION = "22222222-2222-4222-8222-222222222222";
const documents = new Map();
let findFailure = null;

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => document?.[key] === value);
}

const collection = {
  async findOne(filter) {
    if (findFailure) throw findFailure;
    return documents.get(filter._id) ?? null;
  },
  async updateOne(filter, update, options = {}) {
    const current = documents.get(filter._id);
    if (current && matches(current, filter)) {
      documents.set(filter._id, { ...current, ...update.$set });
      return { matchedCount: 1 };
    }
    if (!current && options.upsert) {
      documents.set(filter._id, {
        _id: filter._id,
        ...update.$setOnInsert,
        ...update.$set,
      });
    }
    return { matchedCount: 0 };
  },
  async deleteOne(filter) {
    const current = documents.get(filter._id);
    if (!current || !matches(current, filter)) return { deletedCount: 0 };
    documents.delete(filter._id);
    return { deletedCount: 1 };
  },
};

mock.module("@/lib/db/init", { namedExports: {} });
mock.module("@stargate/shared-db", {
  namedExports: {
    getDb: async () => ({ collection: () => collection }),
  },
});
mock.module("@/lib/env", {
  namedExports: { TRPG_GUILD_ID: "guild-1" },
});
mock.module("@/lib/google-calendar/config", {
  namedExports: {
    getGoogleCalendarConfig: () => ({ encryptionKey: ENCRYPTION_KEY }),
  },
});

const {
  deleteGoogleCalendarConnection,
  findGoogleCalendarConnection,
  getGoogleCalendarConnectionView,
  markGoogleCalendarReconnectRequired,
  updateGoogleCalendarConnection,
  upsertGoogleCalendarConnection,
} = await import("../../lib/db/google-calendar-connections.ts");

function payload(selectedCalendarIds = ["primary"]) {
  return {
    refreshToken: "refresh-secret",
    accessToken: "access-secret",
    accessTokenExpiresAt: Date.now() + 60_000,
    selectedCalendarIds,
    grantedScopes: ["scope-1"],
  };
}

beforeEach(() => {
  documents.clear();
  findFailure = null;
});

test("conditional updates cannot recreate a deleted connection", async () => {
  await upsertGoogleCalendarConnection("user-1", payload(), FIRST_GENERATION);
  const connection = await findGoogleCalendarConnection("user-1");
  assert.ok(connection);

  assert.equal(
    await deleteGoogleCalendarConnection("user-1", FIRST_GENERATION),
    true,
  );
  assert.equal(
    await updateGoogleCalendarConnection(
      "user-1",
      connection.identity,
      payload(["team-calendar"]),
    ),
    null,
  );
  assert.equal(await findGoogleCalendarConnection("user-1"), null);
});

test("revision CAS rejects stale writes and generation protects reconnects", async () => {
  await upsertGoogleCalendarConnection("user-1", payload(), FIRST_GENERATION);
  const first = await findGoogleCalendarConnection("user-1");
  assert.ok(first);

  const nextIdentity = await updateGoogleCalendarConnection(
    "user-1",
    first.identity,
    payload(["team-calendar"]),
  );
  assert.ok(nextIdentity);
  assert.equal(
    await updateGoogleCalendarConnection("user-1", first.identity, payload()),
    null,
  );

  await upsertGoogleCalendarConnection("user-1", payload(), SECOND_GENERATION);
  assert.equal(
    await deleteGoogleCalendarConnection("user-1", FIRST_GENERATION),
    false,
  );
  const reconnected = await findGoogleCalendarConnection("user-1");
  assert.equal(reconnected?.identity.generation, SECOND_GENERATION);
});

test("reconnect markers invalidate in-flight writes from the old revision", async () => {
  await upsertGoogleCalendarConnection("user-1", payload(), FIRST_GENERATION);
  const connection = await findGoogleCalendarConnection("user-1");
  assert.ok(connection);

  assert.ok(
    await markGoogleCalendarReconnectRequired(
      "user-1",
      connection.identity,
    ),
  );
  assert.equal(
    await updateGoogleCalendarConnection(
      "user-1",
      connection.identity,
      payload(["team-calendar"]),
    ),
    null,
  );
  assert.equal(
    (await findGoogleCalendarConnection("user-1"))?.reconnectRequired,
    true,
  );
});

test("connection view reports availability only on a successful read", async () => {
  assert.deepEqual(await getGoogleCalendarConnectionView("user-1"), {
    enabled: true,
    available: true,
    connected: false,
    reconnectRequired: false,
    selectedCalendarCount: 0,
  });

  findFailure = new Error("database unavailable");
  await assert.rejects(
    getGoogleCalendarConnectionView("user-1"),
    /database unavailable/,
  );
});
