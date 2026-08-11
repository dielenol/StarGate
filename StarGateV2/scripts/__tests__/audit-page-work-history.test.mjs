import assert from "node:assert/strict";
import test from "node:test";

import {
  extractReferencedHashes,
  findLikelyOmissions,
  isPageProductionPath,
  parseConventionalType,
} from "../audit-page-work-history.mjs";

function commit(hash, subject, paths, parents = ["parent"]) {
  return { body: subject, hash, parents, paths, subject };
}

test("conventional page commits only are candidates", () => {
  assert.equal(parseConventionalType("fix(novusweb): 버그 수정"), "fix");
  assert.equal(parseConventionalType("feat(all)!: 계약 변경"), "feat");
  assert.equal(parseConventionalType("Install dependency"), null);

  assert.equal(
    isPageProductionPath("StarGateV2/app/(erp)/erp/page.tsx"),
    true,
  );
  assert.equal(isPageProductionPath("StarGateV2/lib/erp/dashboard.ts"), true);
  assert.equal(isPageProductionPath("StarGateV2/proxy.ts"), true);
  assert.equal(
    isPageProductionPath("StarGateV2/app/api/vtt/demo/route.ts"),
    false,
  );
  assert.equal(
    isPageProductionPath("StarGateV2/public/assets/catalog/new-item.webp"),
    false,
  );
  assert.equal(
    isPageProductionPath("StarGateV2/lib/erp/__tests__/dashboard.test.mjs"),
    false,
  );
});

test("only related-commit lines provide history coverage", () => {
  const hashes = extractReferencedHashes(`
- 관련 커밋: \`abcdef1\`, \`12345678\`
- 검증: 커밋 \`7654321\`을 확인했다.
- 관련 로어북 커밋: \`fedcba9\`
`);

  assert.deepEqual([...hashes].sort(), ["12345678", "abcdef1", "fedcba9"]);
});

test("audit keeps one real omission and suppresses documented exceptions", () => {
  const documented = commit(
    "11111111aaaaaaaa",
    "feat(novusweb): 기록된 화면 변경",
    ["StarGateV2/app/(erp)/erp/page.tsx"],
  );
  const mergedBranch = commit(
    "22222222aaaaaaaa",
    "feat(survey): 병합된 화면 변경",
    ["StarGateV2/app/(standalone)/survey/page.tsx"],
  );
  const documentedMerge = commit(
    "33333333aaaaaaaa",
    "feat(novusweb): 화면 브랜치를 통합한다",
    ["StarGateV2/app/(standalone)/survey/page.tsx"],
    ["main-parent", mergedBranch.hash],
  );
  const reverted = commit(
    "44444444aaaaaaaa",
    "fix(novusweb): 되돌릴 화면 변경",
    ["StarGateV2/lib/erp/dashboard.ts"],
  );
  const vttOnly = commit(
    "55555555aaaaaaaa",
    "feat(novusweb): 외부 VTT API 변경",
    ["StarGateV2/app/api/vtt/demo/route.ts"],
  );
  const omission = commit(
    "66666666aaaaaaaa",
    "fix(novusweb): 기록이 필요한 화면 변경",
    ["StarGateV2/components/erp/Widget.tsx"],
  );
  const cherryPicked = commit(
    "77777777bbbbbbbb",
    "fix(novusweb): 이미 기록된 동일 patch",
    ["StarGateV2/lib/erp/personnel.ts"],
  );

  const result = findLikelyOmissions({
    commits: [
      documented,
      mergedBranch,
      documentedMerge,
      reverted,
      vttOnly,
      omission,
      cherryPicked,
    ],
    equivalentDocumentedHashes: new Set([cherryPicked.hash]),
    referencedHashes: new Set(["11111111", "33333333"]),
    integratedByMerge: new Map([[mergedBranch.hash, documentedMerge.hash]]),
    revertedHashes: new Set([reverted.hash]),
  });

  assert.equal(result.candidateCount, 6);
  assert.equal(result.directCount, 2);
  assert.equal(result.equivalentCount, 1);
  assert.equal(result.mergeIntegratedCount, 1);
  assert.equal(result.revertedCount, 1);
  assert.deepEqual(
    result.omissions.map((item) => item.hash),
    [omission.hash],
  );
});

test("a merge is covered when its documented implementation commit is covered", () => {
  const branchCommit = commit(
    "77777777aaaaaaaa",
    "fix(novusweb): 브랜치 구현",
    ["StarGateV2/lib/erp/dashboard.ts"],
  );
  const mergeCommit = commit(
    "88888888aaaaaaaa",
    "feat(novusweb): 브랜치를 통합한다",
    ["StarGateV2/lib/erp/dashboard.ts"],
    ["main-parent", branchCommit.hash],
  );

  const result = findLikelyOmissions({
    commits: [branchCommit, mergeCommit],
    referencedHashes: new Set(["77777777"]),
    integratedByMerge: new Map([[branchCommit.hash, mergeCommit.hash]]),
  });

  assert.equal(result.omissions.length, 0);
});
