import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import test from "node:test";

import {
  deleteSessionById,
  SessionReportSourceInboundReferenceError,
} from "../../../dist/crud/sessions.js";

function buildDb({ inbound = false } = {}) {
  const sessionId = new ObjectId();
  const writes = [];
  const db = {
    collection(name) {
      if (name === "sessions") {
        return {
          async findOne(_filter, options) {
            writes.push({ operation: "find-source", options });
            return { _id: sessionId, updatedAt: new Date(0) };
          },
          async updateOne(filter, update, options) {
            writes.push({ operation: "lock-source", filter, update, options });
            return { matchedCount: 1 };
          },
          async deleteOne(filter, options) {
            writes.push({ operation: "delete-source", filter, options });
            return { deletedCount: 1 };
          },
        };
      }
      if (name === "session_reports") {
        return {
          async findOne(filter, options) {
            writes.push({ operation: "find-inbound", filter, options });
            return inbound ? { _id: new ObjectId() } : null;
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return { db, sessionId: sessionId.toHexString(), writes };
}

test("session source 삭제는 같은 transaction에서 lock과 inbound 검사를 거친다", async () => {
  const { db, sessionId, writes } = buildDb();
  const session = { id: "transaction-session" };

  assert.equal(await deleteSessionById(sessionId, { db, session }), true);
  assert.deepEqual(
    writes.map((write) => write.operation),
    ["find-source", "lock-source", "find-inbound", "delete-source"],
  );
  assert.ok(writes.every((write) => write.options.session === session));
  assert.deepEqual(writes[1].update, {
    $inc: { reportReferenceRevision: 1 },
  });
});

test("inbound report가 있으면 session source 삭제를 차단한다", async () => {
  const { db, sessionId, writes } = buildDb({ inbound: true });
  await assert.rejects(
    deleteSessionById(sessionId, {
      db,
      session: { id: "transaction-session" },
    }),
    SessionReportSourceInboundReferenceError,
  );
  assert.equal(
    writes.some((write) => write.operation === "delete-source"),
    false,
  );
});
