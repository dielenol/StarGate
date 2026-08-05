import assert from "node:assert/strict";
import test from "node:test";

const testApi = await import("node:test");
const HAS_MODULE_MOCK =
  testApi.mock && typeof testApi.mock.module === "function";

if (!HAS_MODULE_MOCK) {
  test("보고서 참조 target lock — module mock 미지원", { skip: true }, () => {});
} else {
  const filters = {};
  let wikiRows = [];
  let characterRows = [];
  let catalogRows = [];
  let wikiMatchedCount = 0;

  function collectionDouble(kind, rows, matchedCount) {
    return {
      find(filter) {
        filters[`${kind}Find`] = filter;
        return {
          async toArray() {
            return rows();
          },
        };
      },
      async updateOne(filter, update, options) {
        filters[`${kind}Update`] = { filter, update, options };
        return { matchedCount: matchedCount() };
      },
    };
  }

  testApi.mock.module(
    new URL("../../../dist/collections.js", import.meta.url).href,
    {
      namedExports: {
        wikiPagesCol: async () =>
          collectionDouble("wiki", () => wikiRows, () => wikiMatchedCount),
        charactersCol: async () =>
          collectionDouble(
            "character",
            () => characterRows,
            () => characterRows.length,
          ),
        masterItemsCol: async () =>
          collectionDouble(
            "catalog",
            () => catalogRows,
            () => catalogRows.length,
          ),
        sessionReportsCol: async () => ({
          find() {
            return {
              sort() {
                return { toArray: async () => [] };
              },
            };
          },
        }),
        sessionResponsesCol: async () => ({}),
        sessionsCol: async () => ({}),
      },
    },
  );

  const {
    findSessionReportReferenceTargetIssues,
    lockSessionReportReferenceTargets,
    SessionReportReferenceConflictError,
  } = await import("../../../dist/crud/session-reports.js");

  test("exact target 검증과 lock은 공개 대상만 같은 transaction session에서 조회·갱신한다", async () => {
    wikiRows = [{ slug: "wiki-public" }];
    characterRows = [{ codename: "PUBLIC_AGENT" }];
    catalogRows = [{ slug: "catalog-public" }];
    wikiMatchedCount = 1;
    const references = {
      relatedWikiSlugs: ["wiki-public"],
      relatedPersonnelCodenames: ["PUBLIC_AGENT"],
      relatedCatalogSlugs: ["catalog-public"],
    };
    const session = { id: "transaction-session" };
    const db = {
      collection(name) {
        if (name === "wiki_pages") {
          return collectionDouble("wiki", () => wikiRows, () => wikiMatchedCount);
        }
        if (name === "characters") {
          return collectionDouble(
            "character",
            () => characterRows,
            () => characterRows.length,
          );
        }
        if (name === "master_items") {
          return collectionDouble("catalog", () => catalogRows, () => catalogRows.length);
        }
        throw new Error(`unexpected collection ${name}`);
      },
    };

    assert.deepEqual(
      await findSessionReportReferenceTargetIssues(references, { session, db }),
      [],
    );
    await lockSessionReportReferenceTargets(references, session, { db });

    assert.deepEqual(filters.wikiFind, {
      slug: { $in: ["wiki-public"] },
      isPublic: true,
    });
    assert.deepEqual(filters.characterFind, {
      codename: { $in: ["PUBLIC_AGENT"] },
      isPublic: { $ne: false },
    });
    assert.deepEqual(filters.catalogFind, {
      slug: { $in: ["catalog-public"] },
      isPublic: { $ne: false },
    });
    for (const kind of ["wiki", "character", "catalog"]) {
      assert.equal(filters[`${kind}Update`].options.session, session);
      assert.deepEqual(filters[`${kind}Update`].update, {
        $currentDate: { __sessionReportReferenceLockAt: true },
      });
    }
  });

  test("검증 뒤 target 수가 바뀌면 report write를 conflict로 중단한다", async () => {
    wikiMatchedCount = 0;
    const db = {
      collection() {
        return collectionDouble("wiki", () => wikiRows, () => wikiMatchedCount);
      },
    };
    await assert.rejects(
      lockSessionReportReferenceTargets(
        { relatedWikiSlugs: ["wiki-public"] },
        { id: "transaction-session" },
        { db },
      ),
      SessionReportReferenceConflictError,
    );
  });
}
