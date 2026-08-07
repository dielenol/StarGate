import { strict as assert } from "node:assert";
import test from "node:test";

import {
  collectSessionReportReferenceTargetIssues,
  filterSessionReportReferencesToResolvedTargets,
  findSessionReportReferenceTargetIssues,
} from "../../../dist/crud/session-reports.js";

function cursor(rows) {
  return { async toArray() { return rows; } };
}

function privateTargetDb() {
  return {
    collection(name) {
      return {
        find(filter) {
          if (name === "wiki_pages") {
            return cursor(filter.isPublic === true ? [] : [{ slug: "wiki-private" }]);
          }
          if (name === "master_items") {
            return cursor(filter.isPublic ? [] : [{ slug: "catalog-private" }]);
          }
          if (name === "characters") {
            return cursor(filter.isPublic ? [] : [{ codename: "NPC_PRIVATE" }]);
          }
          throw new Error(`unexpected collection ${name}`);
        },
      };
    },
  };
}

test("구조화 보고서 참조는 missing과 duplicate SSOT identity를 구분한다", () => {
  const issues = collectSessionReportReferenceTargetIssues(
    {
      relatedWikiSlugs: ["wiki-ok", "wiki-missing"],
      relatedPersonnelCodenames: ["NPC_DUP"],
      relatedCatalogSlugs: ["catalog-ok"],
    },
    {
      relatedWikiSlugs: ["wiki-ok"],
      relatedPersonnelCodenames: ["NPC_DUP", "NPC_DUP"],
      relatedCatalogSlugs: ["catalog-ok"],
    },
  );

  assert.deepEqual(issues, [
    {
      field: "relatedPersonnelCodenames",
      value: "NPC_DUP",
      reason: "ambiguous",
    },
    {
      field: "relatedWikiSlugs",
      value: "wiki-missing",
      reason: "missing",
    },
  ]);
});

test("모든 exact identity가 하나씩 존재하면 참조 blocker가 없다", () => {
  assert.deepEqual(
    collectSessionReportReferenceTargetIssues(
      {
        relatedWikiSlugs: ["wiki-ok"],
        relatedPersonnelCodenames: ["NPC_OK"],
        relatedCatalogSlugs: ["catalog-ok"],
      },
      {
        relatedWikiSlugs: ["wiki-ok"],
        relatedPersonnelCodenames: ["NPC_OK"],
        relatedCatalogSlugs: ["catalog-ok"],
      },
    ),
    [],
  );
});

test("출력 정제는 공개 exact target으로 해석되지 않은 참조를 제거한다", () => {
  const [report] = filterSessionReportReferencesToResolvedTargets(
    [
      {
        sessionId: "session-1",
        provenanceSourceIds: ["seed-payload:private-audit-id"],
        relatedWikiSlugs: ["wiki-public", "wiki-private"],
        relatedPersonnelCodenames: ["PUBLIC_AGENT", "PRIVATE_AGENT"],
        relatedCatalogSlugs: ["catalog-public", "catalog-private"],
      },
    ],
    {
      relatedWikiSlugs: ["wiki-public"],
      relatedPersonnelCodenames: ["PUBLIC_AGENT"],
      relatedCatalogSlugs: ["catalog-public"],
    },
  );

  assert.deepEqual(report, {
    sessionId: "session-1",
    relatedWikiSlugs: ["wiki-public"],
    relatedPersonnelCodenames: ["PUBLIC_AGENT"],
    relatedCatalogSlugs: ["catalog-public"],
  });
});

test("구조화 참조 target은 보고서 최소 역할이 실제로 볼 수 있어야 한다", async () => {
  const references = {
    relatedWikiSlugs: ["wiki-private"],
    relatedCatalogSlugs: ["catalog-private"],
    relatedPersonnelCodenames: ["NPC_PRIVATE"],
  };
  const db = privateTargetDb();

  const uIssues = await findSessionReportReferenceTargetIssues(references, {
    db,
    reportMinRole: "U",
  });
  assert.deepEqual(
    uIssues.map((issue) => issue.field),
    [
      "relatedCatalogSlugs",
      "relatedPersonnelCodenames",
      "relatedWikiSlugs",
    ],
  );

  const vIssues = await findSessionReportReferenceTargetIssues(references, {
    db,
    reportMinRole: "V",
  });
  assert.deepEqual(vIssues, [
    {
      field: "relatedPersonnelCodenames",
      value: "NPC_PRIVATE",
      reason: "missing",
    },
  ]);

  assert.deepEqual(
    await findSessionReportReferenceTargetIssues(references, {
      db,
      reportMinRole: "GM",
    }),
    [],
  );
});
