import assert from "node:assert/strict";
import test from "node:test";

import { drainDiscordMessageBatchSync } from "../../discord/message-batch-sync.ts";

function makeFakeSync() {
  const state = {
    requestedRevision: 1,
    syncedRevision: 0,
    messageIds: ["old-1", "old-2", "old-3", "old-4"],
    desiredPayloads: ["payload-1", "payload-2", "payload-3", "payload-4"],
    leaseToken: null,
    lastError: null,
    cleanupMessageIds: [],
  };
  const visible = new Set(state.messageIds);
  const created = [];
  const deleted = [];
  let tokenSequence = 0;
  let createSequence = 0;

  return {
    state,
    visible,
    created,
    deleted,
    dependencies: {
      logPrefix: "stock-market-wire-test",
      newLeaseToken: () => `lease-${++tokenSequence}`,
      acquire: async (leaseToken) => {
        if (state.leaseToken || state.requestedRevision <= state.syncedRevision) {
          return null;
        }
        state.leaseToken = leaseToken;
        return {
          requestedRevision: state.requestedRevision,
          messageIds: Array.from(
            new Set([...state.messageIds, ...state.cleanupMessageIds]),
          ),
          desiredPayloads: [...state.desiredPayloads],
          leaseToken,
        };
      },
      deleteMessage: async (messageId) => {
        deleted.push(messageId);
        visible.delete(messageId);
      },
      createMessage: async () => {
        const id = `new-${++createSequence}`;
        created.push(id);
        visible.add(id);
        return id;
      },
      recordInflight: async ({ leaseToken, messageIds }) => {
        if (state.leaseToken !== leaseToken) return false;
        state.cleanupMessageIds = [...messageIds];
        return true;
      },
      complete: async ({ leaseToken, syncedRevision, messageIds }) => {
        if (state.leaseToken !== leaseToken) return false;
        state.syncedRevision = syncedRevision;
        state.messageIds = [...messageIds];
        state.cleanupMessageIds = [];
        state.leaseToken = null;
        return true;
      },
      confirm: async ({ syncedRevision, messageIds }) =>
        state.syncedRevision >= syncedRevision &&
        JSON.stringify(state.messageIds) === JSON.stringify(messageIds),
      fail: async ({ leaseToken, error, cleanupMessageIds }) => {
        if (state.leaseToken !== leaseToken) return;
        state.leaseToken = null;
        state.lastError = error;
        state.cleanupMessageIds = [...cleanupMessageIds];
      },
    },
  };
}

test("a newer revision replaces the first batch before releasing the drain", async () => {
  const fake = makeFakeSync();
  let releaseFirstCreate;
  const firstCreateBlocked = new Promise((resolve) => {
    releaseFirstCreate = resolve;
  });
  const originalCreate = fake.dependencies.createMessage;
  let createCount = 0;
  fake.dependencies.createMessage = async (payload) => {
    createCount += 1;
    if (createCount === 1) await firstCreateBlocked;
    return originalCreate(payload);
  };

  const first = drainDiscordMessageBatchSync(fake.dependencies);
  await new Promise((resolve) => setImmediate(resolve));
  fake.state.requestedRevision = 2;
  fake.state.desiredPayloads = ["latest-1", "latest-2", "latest-3", "latest-4"];
  const concurrent = await drainDiscordMessageBatchSync(fake.dependencies);
  releaseFirstCreate();
  const result = await first;

  assert.equal(concurrent, "idle");
  assert.equal(result, "synced");
  assert.equal(fake.state.syncedRevision, 2);
  assert.equal(fake.visible.size, 4);
  assert.deepEqual([...fake.visible], ["new-5", "new-6", "new-7", "new-8"]);
});

test("old message deletion failure prevents every new post and leaves dirty state", async () => {
  const fake = makeFakeSync();
  fake.dependencies.deleteMessage = async () => {
    throw new Error("DELETE_FAILED");
  };

  const result = await drainDiscordMessageBatchSync(fake.dependencies);

  assert.equal(result, "failed");
  assert.equal(fake.created.length, 0);
  assert.equal(fake.state.syncedRevision, 0);
  assert.equal(fake.state.lastError, "DELETE_FAILED");
  assert.equal(fake.visible.size, 4);
});

test("partial post failure removes newly created messages and keeps the revision dirty", async () => {
  const fake = makeFakeSync();
  const originalCreate = fake.dependencies.createMessage;
  let attempt = 0;
  fake.dependencies.createMessage = async (payload) => {
    attempt += 1;
    if (attempt === 3) throw new Error("POST_FAILED");
    return originalCreate(payload);
  };

  const result = await drainDiscordMessageBatchSync(fake.dependencies);

  assert.equal(result, "failed");
  assert.equal(fake.state.syncedRevision, 0);
  assert.equal(fake.state.lastError, "POST_FAILED");
  assert.deepEqual(fake.state.cleanupMessageIds, ["new-1", "new-2"]);
  assert.equal(fake.visible.size, 0);
  assert.deepEqual(fake.created, ["new-1", "new-2"]);
  assert.deepEqual(fake.deleted.slice(-2), ["new-1", "new-2"]);

  fake.dependencies.createMessage = originalCreate;
  const retry = await drainDiscordMessageBatchSync(fake.dependencies);

  assert.equal(retry, "synced");
  assert.equal(fake.state.syncedRevision, 1);
  assert.deepEqual(fake.state.cleanupMessageIds, []);
  assert.deepEqual([...fake.visible], ["new-3", "new-4", "new-5", "new-6"]);
});

test("a lost completion response is confirmed without deleting the live batch", async () => {
  const fake = makeFakeSync();
  fake.dependencies.complete = async ({
    leaseToken,
    syncedRevision,
    messageIds,
  }) => {
    assert.equal(fake.state.leaseToken, leaseToken);
    fake.state.syncedRevision = syncedRevision;
    fake.state.messageIds = [...messageIds];
    fake.state.leaseToken = null;
    throw new Error("ACK_LOST_AFTER_COMMIT");
  };

  const result = await drainDiscordMessageBatchSync(fake.dependencies);

  assert.equal(result, "synced");
  assert.equal(fake.visible.size, 4);
  assert.deepEqual([...fake.visible], ["new-1", "new-2", "new-3", "new-4"]);
});

test("inflight ids remain recoverable when completion and confirmation both fail", async () => {
  const fake = makeFakeSync();
  fake.dependencies.complete = async () => {
    throw new Error("COMPLETE_RESPONSE_LOST");
  };
  fake.dependencies.confirm = async () => {
    throw new Error("CONFIRM_UNAVAILABLE");
  };

  const first = await drainDiscordMessageBatchSync(fake.dependencies);

  assert.equal(first, "failed");
  assert.deepEqual(fake.state.cleanupMessageIds, [
    "new-1",
    "new-2",
    "new-3",
    "new-4",
  ]);
  assert.equal(fake.visible.size, 4);

  fake.state.leaseToken = null;
  fake.dependencies.complete = async ({
    leaseToken,
    syncedRevision,
    messageIds,
  }) => {
    if (fake.state.leaseToken !== leaseToken) return false;
    fake.state.syncedRevision = syncedRevision;
    fake.state.messageIds = [...messageIds];
    fake.state.cleanupMessageIds = [];
    fake.state.leaseToken = null;
    return true;
  };
  fake.dependencies.confirm = async () => false;

  const retry = await drainDiscordMessageBatchSync(fake.dependencies);

  assert.equal(retry, "synced");
  assert.deepEqual([...fake.visible], ["new-5", "new-6", "new-7", "new-8"]);
});
