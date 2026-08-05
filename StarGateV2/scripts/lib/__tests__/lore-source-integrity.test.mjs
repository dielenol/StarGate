import { strict as assert } from "node:assert";
import test from "node:test";

import { auditLoreSourceIntegrity } from "../lore-source-integrity.ts";

test("source 무결성 감사가 고아 참조와 중복 ID를 식별한다", () => {
  const result = auditLoreSourceIntegrity(
    [
      { sourceId: "source:a" },
      { sourceId: "source:a" },
      { sourceId: "source:b", parentSourceId: "source:missing-parent" },
    ],
    [
      { owner: "lore_aliases.alias:1.evidence", sourceId: "source:a" },
      { owner: "lore_claims.claim:1.evidence", sourceId: "source:missing" },
    ],
  );

  assert.deepEqual(result.duplicateSourceIds, ["source:a"]);
  assert.deepEqual(result.orphanReferences, [
    "lore_claims.claim:1.evidence->source:missing",
    "lore_sources.source:b.parentSourceId->source:missing-parent",
  ]);
  assert.deepEqual(result.parentCycles, []);
});

test("source 부모 그래프의 순환은 시작점과 무관하게 한 번만 보고한다", () => {
  const result = auditLoreSourceIntegrity(
    [
      { sourceId: "source:a", parentSourceId: "source:b" },
      { sourceId: "source:b", parentSourceId: "source:c" },
      { sourceId: "source:c", parentSourceId: "source:a" },
      { sourceId: "source:leaf", parentSourceId: "source:a" },
    ],
    [],
  );

  assert.deepEqual(result.orphanReferences, []);
  assert.deepEqual(result.parentCycles, [
    "source:a -> source:b -> source:c -> source:a",
  ]);
});

test("multi-parent source의 orphan과 cycle도 모두 추적한다", () => {
  const result = auditLoreSourceIntegrity(
    [
      {
        sourceId: "source:a",
        parentSourceIds: ["source:b", "source:missing"],
      },
      { sourceId: "source:b", parentSourceIds: ["source:a"] },
    ],
    [],
  );

  assert.deepEqual(result.orphanReferences, [
    "lore_sources.source:a.parentSourceIds->source:missing",
  ]);
  assert.deepEqual(result.parentCycles, ["source:a -> source:b -> source:a"]);
});

test("정상 source DAG와 근거 참조는 blocker를 만들지 않는다", () => {
  assert.deepEqual(
    auditLoreSourceIntegrity(
      [
        { sourceId: "source:root" },
        { sourceId: "source:child", parentSourceId: "source:root" },
      ],
      [
        {
          owner: "lore_search_documents.wiki:black-pyramid.sourceIds",
          sourceId: "source:child",
        },
      ],
    ),
    {
      duplicateSourceIds: [],
      orphanReferences: [],
      parentCycles: [],
    },
  );
});
