import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { Session } from "../src/types/session.js";

process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/test";

const {
  buildFinalizationLogId,
  buildFinalizationMessageNonce,
  getFinalizationDeliveryDisposition,
  requiresLegacyFinalizationReconciliation,
} = await import(
  "../src/db/finalization-lease.js"
);

test("finalization nonce는 재시도에는 안정적이고 종류·수명주기별로 분리된다", () => {
  const requestedAt = new Date("2026-07-27T12:00:00.000Z");
  const retry = buildFinalizationMessageNonce(
    "507f1f77bcf86cd799439011",
    "CLOSE",
    requestedAt,
  );
  assert.equal(
    retry,
    buildFinalizationMessageNonce(
      "507f1f77bcf86cd799439011",
      "CLOSE",
      requestedAt,
    ),
  );
  assert.notEqual(
    retry,
    buildFinalizationMessageNonce(
      "507f1f77bcf86cd799439011",
      "CANCEL",
      requestedAt,
    ),
  );
  assert.notEqual(
    retry,
    buildFinalizationMessageNonce(
      "507f1f77bcf86cd799439011",
      "CLOSE",
      new Date("2026-07-28T12:00:00.000Z"),
    ),
  );
  assert.equal(retry.length, 25);
});

test("finalization operation key와 log ID는 재시도에 안정적이다", () => {
  const key = "7cd75590-05fb-4260-b322-dc0299ca2559";
  const retryKey = "7cd75590-05fb-4260-b322-dc0299ca2559";

  assert.equal(key, retryKey);
  assert.equal(
    buildFinalizationLogId(key).toHexString(),
    buildFinalizationLogId(retryKey).toHexString()
  );
  assert.notEqual(
    buildFinalizationLogId(key).toHexString(),
    buildFinalizationLogId(
      "32035ee1-f78d-4688-acbf-5bb0de85f197"
    ).toHexString()
  );
});

test("불확실한 Discord 전달 상태는 자동 재발송 대신 reconciliation으로 분류한다", () => {
  assert.equal(getFinalizationDeliveryDisposition(undefined), "RECONCILE");
  assert.equal(getFinalizationDeliveryDisposition("PENDING"), "SEND");
  assert.equal(
    getFinalizationDeliveryDisposition("DISPATCHING"),
    "RECONCILE"
  );
  assert.equal(
    getFinalizationDeliveryDisposition("DELIVERY_UNKNOWN"),
    "RECONCILE"
  );
  assert.equal(getFinalizationDeliveryDisposition("SENT"), "RECONCILE");
  assert.equal(
    getFinalizationDeliveryDisposition("DELIVERY_UNKNOWN", "message-1"),
    "SKIP"
  );
});

test("legacy pending 문서는 자동 resume하지 않고 reconciliation 대상으로 분류한다", () => {
  const requestedAt = new Date("2026-07-27T12:00:00.000Z");
  const base: Session = {
    _id: "507f1f77bcf86cd799439011",
    guildId: "guild",
    channelId: "channel",
    messageId: "message",
    title: "test",
    targetDateTime: requestedAt,
    closeDateTime: requestedAt,
    targetRoleId: "role",
    status: "CLOSING",
    createdBy: "creator",
    createdAt: requestedAt,
    updatedAt: requestedAt,
    finalizationTrigger: "force",
    finalizationOperationKey: "7cd75590-05fb-4260-b322-dc0299ca2559",
    finalizationRequestedAt: requestedAt,
    finalizationDeliveryState: "PENDING",
  };

  assert.equal(requiresLegacyFinalizationReconciliation(base, "CLOSE"), false);
  assert.equal(
    requiresLegacyFinalizationReconciliation(
      { ...base, finalizationDeliveryState: undefined },
      "CLOSE"
    ),
    true
  );
  assert.equal(
    requiresLegacyFinalizationReconciliation(
      { ...base, finalizationOperationKey: undefined },
      "CLOSE"
    ),
    true
  );
  assert.equal(
    requiresLegacyFinalizationReconciliation(
      {
        ...base,
        status: "CANCELING",
        finalizationTrigger: "cancel",
        finalizationCancelReason: undefined,
      },
      "CANCEL"
    ),
    true
  );
});

test("finalization 완료는 SENT 상태와 결과 message id를 모두 요구한다", async () => {
  const source = await readFile(
    new URL("../src/db/finalization-lease.ts", import.meta.url),
    "utf8"
  );

  const completion = source.slice(
    source.indexOf("export async function completeFinalizationWithLease"),
    source.indexOf("export async function completeFinalizationWithLease") +
      2_500
  );
  assert.match(completion, /finalizationDeliveryState: "SENT"/);
  assert.match(
    completion,
    /finalizationResultMessageId: \{ \$exists: true, \$ne: "" \}/
  );
  assert.doesNotMatch(
    completion,
    /finalizationDeliveryState: \{ \$ne: "DELIVERY_UNKNOWN" \}/
  );
});
