import assert from "node:assert/strict";
import test from "node:test";

const { indexDefinitionIssues, sameIndexKey } = await import(
  "../lore-index-inspection.ts"
);

const textDefinition = {
  key: {
    title: "text",
    aliases: "text",
    summary: "text",
    searchText: "text",
  },
  name: "lore_search_documents_text",
  weights: { title: 10, aliases: 8, summary: 5, searchText: 1 },
  default_language: "none",
  textIndexVersion: 3,
};

test("Mongo listIndexes의 _fts/_ftsx text key를 선언형 text key와 동일하게 본다", () => {
  const actual = {
    key: { _fts: "text", _ftsx: 1 },
    name: "lore_search_documents_text",
    weights: { aliases: 8, searchText: 1, summary: 5, title: 10 },
    default_language: "none",
  };

  assert.deepEqual(indexDefinitionIssues(textDefinition, actual), []);
  assert.equal(sameIndexKey(textDefinition.key, actual.key), true);
});

test("text index의 field weight나 내부 key가 다르면 invalid로 진단한다", () => {
  assert.deepEqual(
    indexDefinitionIssues(textDefinition, {
      key: { _fts: "text", _ftsx: 1 },
      name: "lore_search_documents_text",
      weights: { aliases: 8, searchText: 1, summary: 4, title: 10 },
      default_language: "none",
    }),
    ["weights"],
  );
  assert.deepEqual(
    indexDefinitionIssues(textDefinition, {
      key: { title: "text", aliases: "text", summary: "text", searchText: "text" },
      name: "lore_search_documents_text",
      weights: textDefinition.weights,
      default_language: "none",
    }),
    ["key"],
  );
  assert.deepEqual(
    indexDefinitionIssues(textDefinition, {
      key: { _fts: "text", _ftsx: 1 },
      name: "lore_search_documents_text",
      weights: textDefinition.weights,
      default_language: "none",
      language_override: "customLanguage",
    }),
    ["language_override"],
  );
  assert.deepEqual(
    indexDefinitionIssues(textDefinition, {
      key: { _fts: "text", _ftsx: 1 },
      name: "lore_search_documents_text",
      weights: textDefinition.weights,
      default_language: "none",
      textIndexVersion: 2,
    }),
    ["textIndexVersion"],
  );
});

test("compound text index는 non-text prefix/suffix 순서를 보존한다", () => {
  assert.equal(
    sameIndexKey(
      { tenantId: 1, title: "text", summary: "text", updatedAt: -1 },
      { tenantId: 1, _fts: "text", _ftsx: 1, updatedAt: -1 },
    ),
    true,
  );
  assert.equal(
    sameIndexKey(
      { tenantId: 1, title: "text", updatedAt: -1 },
      { updatedAt: -1, _fts: "text", _ftsx: 1, tenantId: 1 },
    ),
    false,
  );
});

test("weights를 생략한 text field는 Mongo 기본 weight 1과 동등하다", () => {
  assert.deepEqual(
    indexDefinitionIssues(
      {
        key: { title: "text", summary: "text" },
        name: "default_text_weights",
      },
      {
        key: { _fts: "text", _ftsx: 1 },
        name: "default_text_weights",
        weights: { summary: 1, title: 1 },
        default_language: "english",
      },
    ),
    [],
  );
});

test("일반 compound index는 선언 순서와 옵션 drift를 그대로 진단한다", () => {
  const expected = {
    key: { status: 1, updatedAt: -1 },
    name: "status_updatedAt",
    unique: true,
    partialFilterExpression: { status: "active" },
  };
  assert.deepEqual(
    indexDefinitionIssues(expected, {
      key: { updatedAt: -1, status: 1 },
      name: "status_updatedAt",
      unique: false,
      partialFilterExpression: { status: "inactive" },
    }),
    ["key", "unique", "partialFilterExpression"],
  );
});
