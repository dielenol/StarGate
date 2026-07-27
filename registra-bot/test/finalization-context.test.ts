import assert from "node:assert/strict";
import test from "node:test";

import type { Session } from "../src/types/session.js";

process.env.DISCORD_TOKEN ??= "test-token";
process.env.DISCORD_CLIENT_ID ??= "test-client";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/test";

const {
  prepareFinalizationDispatchAttempt,
  resolveCancelFinalizationContext,
  resolveCloseFinalizationContext,
} = await import("../src/services/session-close.js");

function session(overrides: Partial<Session>): Session {
  const now = new Date("2026-07-27T12:00:00.000Z");
  return {
    _id: "507f1f77bcf86cd799439011",
    guildId: "guild",
    channelId: "channel",
    messageId: "message",
    title: "test",
    targetDateTime: now,
    closeDateTime: now,
    targetRoleId: "role",
    status: "CLOSING",
    createdBy: "creator",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("resume된 강제 마감은 scheduler fallback보다 최초 trigger와 actor를 우선한다", () => {
  const context = resolveCloseFinalizationContext(
    session({
      finalizationTrigger: "force",
      finalizationRequestedBy: "original-actor",
    }),
    { kind: "scheduled", actorUserId: "scheduler" }
  );

  assert.deepEqual(context, {
    kind: "force",
    actorUserId: "original-actor",
  });
});

test("resume된 취소는 최초 reason의 null 값까지 불변으로 보존한다", () => {
  const context = resolveCancelFinalizationContext(
    session({
      status: "CANCELING",
      finalizationTrigger: "cancel",
      finalizationRequestedBy: "original-actor",
      finalizationCancelReason: null,
    }),
    {
      actorUserId: "scheduler",
      reason: "fallback reason",
    }
  );

  assert.deepEqual(context, {
    actorUserId: "original-actor",
    reason: null,
  });
});

test("결과 카드 렌더 실패는 DISPATCHING 전이라 PENDING 재시도를 보존한다", async () => {
  let deliveryState = "PENDING";
  let renewCalls = 0;
  let dispatchMarks = 0;

  await assert.rejects(
    prepareFinalizationDispatchAttempt(
      async () => {
        throw new Error("render failed");
      },
      async () => {
        renewCalls += 1;
        return true;
      },
      async () => {
        dispatchMarks += 1;
        deliveryState = "DISPATCHING";
        return true;
      }
    ),
    /render failed/
  );

  assert.equal(deliveryState, "PENDING");
  assert.equal(renewCalls, 0);
  assert.equal(dispatchMarks, 0);
});

test("마지막 lease 갱신 실패는 Discord 전달 상태를 PENDING에 남긴다", async () => {
  let deliveryState = "PENDING";
  let dispatchMarks = 0;

  const payload = await prepareFinalizationDispatchAttempt(
    () => ({ content: "result" }),
    async () => false,
    async () => {
      dispatchMarks += 1;
      deliveryState = "DISPATCHING";
      return true;
    }
  );

  assert.equal(payload, null);
  assert.equal(deliveryState, "PENDING");
  assert.equal(dispatchMarks, 0);
});
