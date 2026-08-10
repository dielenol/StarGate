import assert from "node:assert/strict";
import test from "node:test";

import {
  createPlannedReferenceTargets,
  reconcilePlannedReferenceTargetIssues,
  recordPlannedReferenceTarget,
} from "../seed-payload-reference-preview.ts";

const wikiReference = { relatedWikiSlugs: ["last-battalion"] };
const missingWiki = [{
  field: "relatedWikiSlugs",
  value: "last-battalion",
  reason: "missing",
}];

test("같은 파일에서 먼저 공개할 wiki는 U report dry-run target으로 인정한다", () => {
  const planned = createPlannedReferenceTargets();
  recordPlannedReferenceTarget(
    "wiki_pages",
    "last-battalion",
    { slug: "last-battalion", isPublic: true },
    planned,
  );

  assert.deepEqual(
    reconcilePlannedReferenceTargetIssues(
      wikiReference,
      "U",
      missingWiki,
      planned,
    ),
    [],
  );
});

test("앞선 private wiki는 V report에만 보이고 U report에는 보이지 않는다", () => {
  const planned = createPlannedReferenceTargets();
  recordPlannedReferenceTarget(
    "wiki_pages",
    "last-battalion",
    { slug: "last-battalion", isPublic: false },
    planned,
  );

  assert.deepEqual(
    reconcilePlannedReferenceTargetIssues(
      wikiReference,
      "V",
      missingWiki,
      planned,
    ),
    [],
  );
  assert.deepEqual(
    reconcilePlannedReferenceTargetIssues(wikiReference, "U", [], planned),
    missingWiki,
  );
});

test("planned target은 ambiguous DB 상태를 가리지 않는다", () => {
  const planned = createPlannedReferenceTargets();
  recordPlannedReferenceTarget(
    "wiki_pages",
    "last-battalion",
    { slug: "last-battalion", isPublic: true },
    planned,
  );
  const ambiguous = [{
    field: "relatedWikiSlugs",
    value: "last-battalion",
    reason: "ambiguous",
  }];

  assert.deepEqual(
    reconcilePlannedReferenceTargetIssues(
      wikiReference,
      "U",
      ambiguous,
      planned,
    ),
    ambiguous,
  );
});

test("같은 파일의 뒤 envelope 상태가 앞선 planned visibility를 덮어쓴다", () => {
  const planned = createPlannedReferenceTargets();
  recordPlannedReferenceTarget(
    "wiki_pages",
    "last-battalion",
    { slug: "last-battalion", isPublic: true },
    planned,
  );
  recordPlannedReferenceTarget(
    "wiki_pages",
    "last-battalion",
    { slug: "last-battalion", isPublic: false },
    planned,
  );

  assert.deepEqual(
    reconcilePlannedReferenceTargetIssues(wikiReference, "U", [], planned),
    missingWiki,
  );
});

test("private personnel target은 GM report에만 허용한다", () => {
  const planned = createPlannedReferenceTargets();
  const references = { relatedPersonnelCodenames: ["DOCTOR_ZENO"] };
  const missing = [{
    field: "relatedPersonnelCodenames",
    value: "DOCTOR_ZENO",
    reason: "missing",
  }];
  recordPlannedReferenceTarget(
    "characters",
    "DOCTOR_ZENO",
    { codename: "DOCTOR_ZENO", isPublic: false },
    planned,
  );

  assert.deepEqual(
    reconcilePlannedReferenceTargetIssues(references, "GM", missing, planned),
    [],
  );
  assert.deepEqual(
    reconcilePlannedReferenceTargetIssues(references, "V", [], planned),
    missing,
  );
});

test("report가 target publication보다 앞서면 현재 DB missing을 그대로 유지한다", () => {
  const planned = createPlannedReferenceTargets();

  assert.deepEqual(
    reconcilePlannedReferenceTargetIssues(
      wikiReference,
      "U",
      missingWiki,
      planned,
    ),
    missingWiki,
  );
});

test("파일별 planned target state는 서로 공유하지 않는다", () => {
  const firstFile = createPlannedReferenceTargets();
  const secondFile = createPlannedReferenceTargets();
  recordPlannedReferenceTarget(
    "wiki_pages",
    "last-battalion",
    { slug: "last-battalion", isPublic: true },
    firstFile,
  );

  assert.deepEqual(
    reconcilePlannedReferenceTargetIssues(
      wikiReference,
      "U",
      missingWiki,
      secondFile,
    ),
    missingWiki,
  );
});

test("stable identity rename 후보는 planned target으로 기록하지 않는다", () => {
  const planned = createPlannedReferenceTargets();

  assert.throws(
    () => recordPlannedReferenceTarget(
      "wiki_pages",
      "old-slug",
      { slug: "new-slug", isPublic: true },
      planned,
    ),
    /planned reference target identity 불일치/u,
  );
  assert.equal(planned.relatedWikiSlugs.size, 0);
});
