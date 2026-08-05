import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import test from "node:test";

const testApi = await import("node:test");
const HAS_MODULE_MOCK =
  testApi.mock && typeof testApi.mock.module === "function";

if (!HAS_MODULE_MOCK) {
  test("updatedAt CAS mock 테스트 — module mock 미지원", { skip: true }, () => {});
} else {
  let wikiFilter = null;
  let wikiModifiedCount = 0;
  let revisionInsertCount = 0;
  let reportFilter = null;
  const reportSessionId = new ObjectId().toHexString();

  const wikiPage = {
    _id: new ObjectId(),
    slug: "cas-page",
    title: "CAS",
    content: "이전 본문",
    category: "테스트",
    tags: [],
    isPublic: false,
    authorId: "editor",
    authorName: "Editor",
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
  };

  testApi.mock.module(
    new URL("../../../dist/collections.js", import.meta.url).href,
    {
      namedExports: {
        wikiPagesCol: async () => ({
          async findOne() {
            return wikiPage;
          },
          async updateOne(filter) {
            wikiFilter = filter;
            return {
              acknowledged: true,
              matchedCount: wikiModifiedCount,
              modifiedCount: wikiModifiedCount,
            };
          },
        }),
        wikiPageRevisionsCol: async () => ({
          async insertOne() {
            revisionInsertCount += 1;
            return { acknowledged: true, insertedId: new ObjectId() };
          },
        }),
        sessionReportsCol: async () => ({
          async findOne() {
            return {
              _id: new ObjectId(),
              sessionId: reportSessionId,
              sessionTitle: "등록 세션",
              summary: "이전 요약",
              highlights: [],
              participants: [],
              gmId: "gm",
              gmName: "GM",
              createdAt: new Date(),
              updatedAt: null,
            };
          },
          async updateOne(filter) {
            reportFilter = filter;
            return {
              acknowledged: true,
              matchedCount: 1,
              modifiedCount: 1,
            };
          },
        }),
        charactersCol: async () => ({}),
        masterItemsCol: async () => ({}),
        sessionResponsesCol: async () => ({}),
        sessionsCol: async () => ({}),
      },
    },
  );

  const { updateWikiPage } = await import(
    "../../../dist/crud/wiki.js"
  );
  const { updateSessionReport } = await import(
    "../../../dist/crud/session-reports.js"
  );
  const VALID_ID = new ObjectId().toHexString();

  test("위키 CAS 실패는 revision을 남기지 않는다", async () => {
    const expectedUpdatedAt = new Date("2026-07-30T01:00:00.000Z");
    wikiModifiedCount = 0;
    revisionInsertCount = 0;
    wikiFilter = null;

    const updated = await updateWikiPage(
      VALID_ID,
      { content: "새 본문" },
      "editor",
      "Editor",
      expectedUpdatedAt,
    );

    assert.equal(updated, false);
    assert.equal(wikiFilter.updatedAt, expectedUpdatedAt);
    assert.equal(revisionInsertCount, 0);
  });

  test("위키 CAS 성공 뒤에만 revision을 남긴다", async () => {
    wikiModifiedCount = 1;
    revisionInsertCount = 0;

    const updated = await updateWikiPage(
      VALID_ID,
      { content: "새 본문" },
      "editor",
      "Editor",
      wikiPage.updatedAt,
    );

    assert.equal(updated, true);
    assert.equal(revisionInsertCount, 1);
  });

  test("리포트 legacy CAS는 updatedAt null filter를 유지한다", async () => {
    reportFilter = null;

    const updated = await updateSessionReport(
      VALID_ID,
      { summary: "새 요약" },
      null,
      {
        session: { id: "transaction-session" },
        db: {
          collection(name) {
            if (name === "sessions") {
              return {
                async findOne() {
                  return {
                    title: "등록 세션",
                    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
                  };
                },
                async updateOne() {
                  return { matchedCount: 1 };
                },
              };
            }
            if (name === "wiki_pages" || name === "characters" || name === "master_items") {
              return {
                find() {
                  return { async toArray() { return []; } };
                },
              };
            }
            throw new Error(`unexpected collection ${name}`);
          },
        },
      },
    );

    assert.equal(updated, true);
    assert.ok(reportFilter);
    assert.ok(
      Object.prototype.hasOwnProperty.call(reportFilter, "updatedAt"),
    );
    assert.equal(reportFilter.updatedAt, null);
  });
}
