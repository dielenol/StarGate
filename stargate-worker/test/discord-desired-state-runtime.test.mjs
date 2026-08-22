import assert from "node:assert/strict";
import test from "node:test";

import { DiscordDesiredStateConsumer } from "../dist/consumers/discord-desired-state.js";
import { reconcileResearchRankingDeliveryUnknown } from "../dist/operations/research-ranking-reconciliation.js";

const OLD_MESSAGE_IDS = [
  "90000000000000001",
  "90000000000000002",
  "90000000000000003",
  "90000000000000004",
];

function payload(index) {
  return {
    username: "재무기구 시장감시실",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `공시 카드 ${index}`,
        color: 0xc5a059,
        fields: [{ name: "항목", value: `내용 ${index}` }],
        timestamp: "2026-08-11T03:00:00.000Z",
      },
    ],
  };
}

function applyUpdate(state, update) {
  if (update.$set) {
    Object.assign(state, structuredClone(update.$set));
  }
  if (update.$pull) {
    for (const [field, value] of Object.entries(update.$pull)) {
      state[field] = (state[field] ?? []).filter((item) => item !== value);
    }
  }
  if (update.$unset) {
    for (const field of Object.keys(update.$unset)) {
      delete state[field];
    }
  }
}

function makeFixture({
  name = "stock-market-wire",
  quarantineUnknownCreate = false,
} = {}) {
  const stateId = name === "research-ranking"
    ? "team-research-all-time"
    : "scheduled";
  const state = {
    _id: stateId,
    requestedRevision: 2,
    syncedRevision: 1,
    desiredPayloads: [1, 2, 3, 4].map(payload),
    messageIds: [...OLD_MESSAGE_IDS],
    updatedAt: new Date("2026-08-11T03:00:00.000Z"),
  };
  const visible = new Set(OLD_MESSAGE_IDS);
  const posts = [];
  const deletes = [];
  let nextMessageId = 91000000000000000n;
  let failPostAt = null;
  let losePostResponseAt = null;
  let failDeleteId = null;

  const collection = {
    async findOneAndUpdate(_filter, update) {
      const now = new Date();
      const hasDueRevision = state.requestedRevision > state.syncedRevision;
      const hasCleanup = [
        ...(state.staleMessageIds ?? []),
        ...(state.replacementMessageIds ?? []),
        ...(state.cleanupMessageIds ?? []),
      ].length > 0;
      const leaseAvailable =
        !state.leaseToken ||
        !state.leaseExpiresAt ||
        state.leaseExpiresAt <= now;
      const retryDue = !state.nextAttemptAt || state.nextAttemptAt <= now;
      const deliveryAllowed =
        state.deliveryUnknownRevision === undefined || hasCleanup;
      if (
        (!hasDueRevision && !hasCleanup) ||
        !deliveryAllowed ||
        !leaseAvailable ||
        !retryDue
      ) {
        return null;
      }
      applyUpdate(state, update);
      return structuredClone(state);
    },
    async updateOne(filter, update) {
      if (
        typeof filter.leaseToken === "string" &&
        filter.leaseToken !== state.leaseToken
      ) {
        return { modifiedCount: 0 };
      }
      for (const field of [
        "requestedRevision",
        "syncedRevision",
        "deliveryUnknownRevision",
        "deliveryUnknownAt",
      ]) {
        if (
          filter[field] !== undefined &&
          JSON.stringify(filter[field]) !== JSON.stringify(state[field])
        ) {
          return { modifiedCount: 0 };
        }
      }
      if (
        filter.leaseToken?.$exists === false &&
        state.leaseToken !== undefined
      ) {
        return { modifiedCount: 0 };
      }
      for (const clause of filter.$and ?? []) {
        const [field, expected] = Object.entries(clause)[0];
        if (expected?.$exists === false) {
          if (Object.hasOwn(state, field)) return { modifiedCount: 0 };
        } else if (
          JSON.stringify(state[field]) !== JSON.stringify(expected)
        ) {
          return { modifiedCount: 0 };
        }
      }
      applyUpdate(state, update);
      return { modifiedCount: 1 };
    },
    async findOne(filter) {
      if (filter._id && filter._id !== state._id) return null;
      const messageIdsMatch =
        !filter.messageIds ||
        JSON.stringify(filter.messageIds) === JSON.stringify(state.messageIds);
      const revisionMatches =
        !filter.syncedRevision?.$gte ||
        state.syncedRevision >= filter.syncedRevision.$gte;
      return messageIdsMatch && revisionMatches
        ? structuredClone(state)
        : null;
    },
  };

  const fetchImpl = async (url, init) => {
    if (init.method === "POST") {
      posts.push(JSON.parse(init.body));
      if (failPostAt === posts.length) {
        failPostAt = null;
        return new Response("POST_FAILED", { status: 500 });
      }
      nextMessageId += 1n;
      const id = nextMessageId.toString();
      visible.add(id);
      if (losePostResponseAt === posts.length) {
        losePostResponseAt = null;
        throw new TypeError("socket closed after request write");
      }
      return Response.json({ id });
    }

    const id = new URL(url).pathname.split("/").at(-1);
    deletes.push(id);
    if (id === failDeleteId) {
      failDeleteId = null;
      return new Response("DELETE_FAILED", { status: 500 });
    }
    visible.delete(id);
    return new Response(null, { status: 204 });
  };

  const consumer = new DiscordDesiredStateConsumer(name, {
    collectionName: name === "research-ranking"
      ? "research_ranking_states"
      : "stock_discord_market_wires",
    stateId,
    webhookUrl: "https://discord.test/api/webhooks/123/token",
    fetchImpl,
    getDbImpl: async () => ({ collection: () => collection }),
    quarantineUnknownCreate,
  });

  return {
    consumer,
    deletes,
    posts,
    state,
    visible,
    db: { collection: () => collection },
    failNextPostAt(index) {
      failPostAt = index;
    },
    loseNextPostResponseAt(index) {
      losePostResponseAt = index;
    },
    failNextDelete(id) {
      failDeleteId = id;
    },
    allowRetry() {
      state.nextAttemptAt = new Date(0);
    },
    removeVisible(messageId) {
      visible.delete(messageId);
    },
  };
}

test("네 장 생성 중 세 번째 실패는 새 카드만 정리하고 재시도에서 네 장으로 수렴한다", async () => {
  const fixture = makeFixture();
  fixture.failNextPostAt(3);

  const failed = await fixture.consumer.tick({
    signal: new AbortController().signal,
  });

  assert.equal(failed.failed, 1);
  assert.equal(fixture.state.syncedRevision, 1);
  assert.deepEqual([...fixture.visible], OLD_MESSAGE_IDS);
  assert.equal(fixture.state.replacementMessageIds, undefined);
  assert.match(fixture.state.lastError, /POST_FAILED/);

  fixture.allowRetry();
  const retried = await fixture.consumer.tick({
    signal: new AbortController().signal,
  });

  assert.equal(retried.delivered, 1);
  assert.equal(fixture.state.syncedRevision, 2);
  assert.equal(fixture.state.messageIds.length, 4);
  assert.deepEqual([...fixture.visible], fixture.state.messageIds);
  assert.ok(
    fixture.state.messageIds.every((id) => !OLD_MESSAGE_IDS.includes(id)),
  );
  assert.deepEqual(
    fixture.posts.slice(-4).map((posted) => posted.embeds.length),
    [1, 1, 1, 1],
  );
});

test("연구 공로 POST 결과 유실은 기존 카드를 유지하고 자동 재발행을 격리한다", async () => {
  const fixture = makeFixture({
    name: "research-ranking",
    quarantineUnknownCreate: true,
  });
  fixture.loseNextPostResponseAt(3);

  const failed = await fixture.consumer.tick({
    signal: new AbortController().signal,
  });

  assert.equal(failed.failed, 1);
  assert.equal(fixture.state.syncedRevision, 1);
  assert.deepEqual(fixture.state.messageIds, OLD_MESSAGE_IDS);
  assert.equal(fixture.state.deliveryUnknownRevision, 2);
  assert.ok(fixture.state.deliveryUnknownAt instanceof Date);
  assert.match(fixture.state.lastError, /^DELIVERY_UNKNOWN:/);
  assert.equal(fixture.state.nextAttemptAt, undefined);
  assert.equal(fixture.state.replacementMessageIds, undefined);
  assert.equal(fixture.visible.size, OLD_MESSAGE_IDS.length + 1);
  assert.ok(OLD_MESSAGE_IDS.every((id) => fixture.visible.has(id)));

  const postCount = fixture.posts.length;
  fixture.allowRetry();
  const quarantined = await fixture.consumer.tick({
    signal: new AbortController().signal,
  });

  assert.deepEqual(quarantined, {
    observedDue: 0,
    claimed: 0,
    delivered: 0,
    failed: 0,
  });
  assert.equal(fixture.posts.length, postCount);
});

test("연구 공로 adopt와 retry는 격리 뒤 최신 requested revision까지 수렴한다", async (t) => {
  for (const action of ["adopt", "retry"]) {
    await t.test(action, async () => {
      const fixture = makeFixture({
        name: "research-ranking",
        quarantineUnknownCreate: true,
      });
      fixture.loseNextPostResponseAt(3);
      await fixture.consumer.tick({ signal: new AbortController().signal });

      const unknownMessageId = [...fixture.visible].find(
        (messageId) => !OLD_MESSAGE_IDS.includes(messageId),
      );
      assert.ok(unknownMessageId);
      fixture.state.requestedRevision = 3;
      if (action === "retry") fixture.removeVisible(unknownMessageId);

      const input = {
        targetFingerprint: `mongo-target-v1:${"a".repeat(64)}`,
        action,
        ...(action === "adopt"
          ? { candidateMessageId: unknownMessageId }
          : {}),
      };
      const dependencies = {
        async getDbImpl() {
          return fixture.db;
        },
        async verifyCandidateMessageOwnership(messageId) {
          assert.equal(action, "adopt");
          assert.equal(messageId, unknownMessageId);
          assert.ok(fixture.visible.has(messageId));
          return `discord-webhook-message-v1:${"b".repeat(64)}`;
        },
      };
      const dryRun = await reconcileResearchRankingDeliveryUnknown(
        input,
        dependencies,
      );
      await reconcileResearchRankingDeliveryUnknown(
        {
          ...input,
          execute: true,
          expectedPlanDigest: dryRun.plan.planDigest,
        },
        dependencies,
      );

      const converged = await fixture.consumer.tick({
        signal: new AbortController().signal,
      });
      assert.equal(converged.delivered, 1);
      assert.equal(
        fixture.state.requestedRevision,
        fixture.state.syncedRevision,
      );
      assert.equal(fixture.state.deliveryUnknownRevision, undefined);
      assert.equal(fixture.state.deliveryUnknownAt, undefined);
      assert.equal(fixture.state.staleMessageIds, undefined);
      assert.deepEqual([...fixture.visible], fixture.state.messageIds);
      assert.ok(
        OLD_MESSAGE_IDS.every((messageId) => !fixture.visible.has(messageId)),
      );
      assert.equal(fixture.visible.has(unknownMessageId), false);
    });
  }
});

test("네 장 활성화 뒤 이전 카드 삭제 실패는 재시도에서 새 네 장을 보존한다", async () => {
  const fixture = makeFixture();
  fixture.failNextDelete(OLD_MESSAGE_IDS[0]);

  const failed = await fixture.consumer.tick({
    signal: new AbortController().signal,
  });

  assert.equal(failed.failed, 1);
  assert.equal(fixture.state.syncedRevision, 2);
  assert.equal(fixture.state.messageIds.length, 4);
  assert.equal(fixture.visible.size, 8);
  assert.deepEqual(fixture.state.staleMessageIds, OLD_MESSAGE_IDS);

  fixture.allowRetry();
  const retried = await fixture.consumer.tick({
    signal: new AbortController().signal,
  });

  assert.equal(retried.failed, 0);
  assert.equal(fixture.state.syncedRevision, 2);
  assert.deepEqual([...fixture.visible], fixture.state.messageIds);
  assert.ok(
    fixture.state.messageIds.every((id) => !OLD_MESSAGE_IDS.includes(id)),
  );
  assert.equal(fixture.state.staleMessageIds, undefined);
});
