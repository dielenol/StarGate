import assert from "node:assert/strict";
import test from "node:test";

import { drainResearchDiscordCardSync } from "../research-discord-sync.ts";

function makeFakeSync() {
  const state = {
    requestedRevision: 1,
    syncedRevision: 0,
    messageId: "old-message",
    cleanupMessageId: null,
    leaseToken: null,
    lastError: null,
  };
  const visible = new Set(["old-message"]);
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
      newLeaseToken: () => `lease-${++tokenSequence}`,
      acquire: async (projectKey, leaseToken) => {
        if (
          state.leaseToken ||
          state.requestedRevision <= state.syncedRevision
        ) {
          return null;
        }
        state.leaseToken = leaseToken;
        return {
          projectKey,
          requestedRevision: state.requestedRevision,
          messageId: state.messageId,
          ...(state.cleanupMessageId
            ? { cleanupMessageId: state.cleanupMessageId }
            : {}),
          leaseToken,
        };
      },
      buildPayload: async (projectKey) => ({
        projectKey,
        revision: state.requestedRevision,
      }),
      deleteMessage: async (messageId) => {
        deleted.push(messageId);
        visible.delete(messageId);
      },
      createMessage: async () => {
        const id = `new-message-${++createSequence}`;
        created.push(id);
        visible.add(id);
        return id;
      },
      recordInflight: async ({ leaseToken, messageId }) => {
        if (state.leaseToken !== leaseToken) return false;
        state.cleanupMessageId = messageId;
        return true;
      },
      complete: async ({ leaseToken, syncedRevision, messageId }) => {
        if (state.leaseToken !== leaseToken) return false;
        state.syncedRevision = syncedRevision;
        state.messageId = messageId;
        state.cleanupMessageId = null;
        state.leaseToken = null;
        return true;
      },
      confirm: async ({ syncedRevision, messageId }) =>
        state.syncedRevision >= syncedRevision && state.messageId === messageId,
      fail: async ({ leaseToken, error }) => {
        if (state.leaseToken !== leaseToken) return;
        state.leaseToken = null;
        state.lastError = error;
      },
    },
  };
}

test("동기화 중 revision이 증가하면 같은 lease drain이 최신 카드까지 교체한다", async () => {
  const fake = makeFakeSync();
  let releaseFirstBuild;
  const firstBuildBlocked = new Promise((resolve) => {
    releaseFirstBuild = resolve;
  });
  let buildCount = 0;
  fake.dependencies.buildPayload = async (projectKey) => {
    buildCount += 1;
    if (buildCount === 1) await firstBuildBlocked;
    return { projectKey, revision: fake.state.requestedRevision };
  };

  const first = drainResearchDiscordCardSync("BIO-02", fake.dependencies);
  await new Promise((resolve) => setImmediate(resolve));
  fake.state.requestedRevision += 1;
  const concurrent = await drainResearchDiscordCardSync(
    "BIO-02",
    fake.dependencies,
  );
  releaseFirstBuild();
  const result = await first;

  assert.equal(concurrent, "idle");
  assert.equal(result, "synced");
  assert.equal(fake.state.syncedRevision, 2);
  assert.equal(fake.visible.size, 1);
  assert.deepEqual([...fake.visible], ["new-message-2"]);
  assert.deepEqual(fake.deleted, ["old-message", "new-message-1"]);
});

test("DB 완료 저장 뒤 응답만 유실되면 재조회로 확인하고 새 카드를 보존한다", async () => {
  const fake = makeFakeSync();
  fake.dependencies.complete = async ({
    leaseToken,
    syncedRevision,
    messageId,
  }) => {
    assert.equal(fake.state.leaseToken, leaseToken);
    fake.state.syncedRevision = syncedRevision;
    fake.state.messageId = messageId;
    fake.state.leaseToken = null;
    throw new Error("ACK_LOST_AFTER_COMMIT");
  };

  const result = await drainResearchDiscordCardSync(
    "BIO-02",
    fake.dependencies,
  );

  assert.equal(result, "synced");
  assert.equal(fake.state.syncedRevision, 1);
  assert.equal(fake.visible.size, 1);
  assert.deepEqual([...fake.visible], ["new-message-1"]);
  assert.deepEqual(fake.deleted, ["old-message"]);
});

test("기존 카드 삭제 실패 시 새 카드를 게시하지 않고 dirty revision을 남긴다", async () => {
  const fake = makeFakeSync();
  fake.dependencies.deleteMessage = async () => {
    throw new Error("DELETE_FAILED");
  };

  const result = await drainResearchDiscordCardSync(
    "BIO-02",
    fake.dependencies,
  );

  assert.equal(result, "failed");
  assert.equal(fake.created.length, 0);
  assert.equal(fake.state.syncedRevision, 0);
  assert.equal(fake.state.requestedRevision, 1);
  assert.equal(fake.state.leaseToken, null);
  assert.equal(fake.state.lastError, "DELETE_FAILED");
  assert.deepEqual([...fake.visible], ["old-message"]);
});

test("저장된 이전 카드를 웹훅으로 삭제한 뒤 새 카드 하나만 남긴다", async () => {
  const fake = makeFakeSync();

  const result = await drainResearchDiscordCardSync(
    "BIO-02",
    fake.dependencies,
  );

  assert.equal(result, "synced");
  assert.deepEqual(fake.deleted, ["old-message"]);
  assert.deepEqual(fake.created, ["new-message-1"]);
  assert.deepEqual([...fake.visible], ["new-message-1"]);
  assert.equal(fake.state.messageId, "new-message-1");
  assert.equal(fake.state.cleanupMessageId, null);
});

test("완료 전 중단되어 저장된 inflight 카드도 다음 교체에서 함께 삭제한다", async () => {
  const fake = makeFakeSync();
  fake.state.cleanupMessageId = "orphan-message";
  fake.visible.add("orphan-message");

  const result = await drainResearchDiscordCardSync(
    "BIO-02",
    fake.dependencies,
  );

  assert.equal(result, "synced");
  assert.deepEqual(fake.deleted, ["old-message", "orphan-message"]);
  assert.deepEqual([...fake.visible], ["new-message-1"]);
  assert.equal(fake.state.messageId, "new-message-1");
  assert.equal(fake.state.cleanupMessageId, null);
});
