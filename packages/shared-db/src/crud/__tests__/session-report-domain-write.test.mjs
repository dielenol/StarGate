import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import test from "node:test";

import {
  SessionReportReferenceTargetError,
  SessionReportSourceNotFoundError,
  validateAndLockSessionReportWrite,
} from "../../../dist/crud/session-reports.js";

function cursor(rows) {
  return { async toArray() { return rows; } };
}

function buildDb({ source = true, wiki = true } = {}) {
  const writes = [];
  const sessionId = new ObjectId();
  const db = {
    collection(name) {
      if (name === "sessions") {
        return {
          async findOne() {
            return source
              ? { _id: sessionId, title: "등록 세션", updatedAt: new Date() }
              : null;
          },
          async updateOne(filter, update, options) {
            writes.push({ name, filter, update, options });
            return { matchedCount: source ? 1 : 0 };
          },
        };
      }
      if (name === "trpg_sessions") {
        return { async findOne() { return null; } };
      }
      if (name === "wiki_pages") {
        return {
          find() { return cursor(wiki ? [{ slug: "wiki-ok" }] : []); },
          async updateOne(filter, update, options) {
            writes.push({ name, filter, update, options });
            return { matchedCount: wiki ? 1 : 0 };
          },
        };
      }
      if (name === "characters") {
        return {
          find() { return cursor([{ codename: "AGENT_OK" }]); },
          async updateOne(filter, update, options) {
            writes.push({ name, filter, update, options });
            return { matchedCount: 1 };
          },
        };
      }
      if (name === "master_items") {
        return {
          find() { return cursor([{ slug: "item-ok" }]); },
          async updateOne(filter, update, options) {
            writes.push({ name, filter, update, options });
            return { matchedCount: 1 };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return { db, sessionId: sessionId.toHexString(), writes };
}

test("shared report write gate는 source와 공개 exact target을 같은 session에서 lock한다", async () => {
  const { db, sessionId, writes } = buildDb();
  const session = { id: "transaction-session" };
  const result = await validateAndLockSessionReportWrite(
    sessionId,
    {
      relatedWikiSlugs: ["wiki-ok"],
      relatedPersonnelCodenames: ["AGENT_OK"],
      relatedCatalogSlugs: ["item-ok"],
    },
    session,
    { db },
  );

  assert.deepEqual(result, { sessionTitle: "등록 세션" });
  assert.equal(writes.length, 4);
  assert.ok(writes.every((write) => write.options.session === session));
  for (const write of writes.filter((entry) => entry.name !== "sessions")) {
    assert.deepEqual(write.update, {
      $currentDate: { __sessionReportReferenceLockAt: true },
    });
  }
});

test("shared report write gate는 미등록 source와 missing target을 fail-closed 처리한다", async () => {
  const missingSource = buildDb({ source: false });
  await assert.rejects(
    validateAndLockSessionReportWrite(
      missingSource.sessionId,
      {},
      { id: "transaction-session" },
      { db: missingSource.db },
    ),
    SessionReportSourceNotFoundError,
  );

  const missingTarget = buildDb({ wiki: false });
  await assert.rejects(
    validateAndLockSessionReportWrite(
      missingTarget.sessionId,
      { relatedWikiSlugs: ["wiki-ok"] },
      { id: "transaction-session" },
      { db: missingTarget.db },
    ),
    SessionReportReferenceTargetError,
  );
});
