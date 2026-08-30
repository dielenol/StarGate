import assert from "node:assert/strict";
import test from "node:test";

import { ObjectId } from "mongodb";

import { buildOperationHonorSourceMaterial } from "../../../dist/honor-source.js";
import { findCurrentOperationHonorSources } from "../../../dist/crud/honor-sources.js";
import { findHonorCandidateCharactersByCodenames } from "../../../dist/crud/honors.js";
import { sanitizeSessionReportReferencesForPublicTargets } from "../../../dist/crud/session-reports.js";

const ACTIVE_OWNER = new ObjectId("507f1f77bcf86cd799439011");
const INACTIVE_OWNER = new ObjectId("507f1f77bcf86cd799439012");
const MISSING_OWNER = new ObjectId("507f1f77bcf86cd799439013");
const UPDATED_AT = new Date("2026-08-28T00:00:00.000Z");

function agent(codename, overrides = {}) {
  return {
    _id: new ObjectId(),
    codename,
    type: "AGENT",
    ownerId: String(ACTIVE_OWNER),
    isPublic: true,
    ...overrides,
  };
}

function report(sessionId, codenames, overrides = {}) {
  return {
    _id: new ObjectId(),
    sessionId,
    minRole: "U",
    summary: `${codenames[0]}가 작전 현장에서 대피로를 확보했다.`,
    highlights: [`${codenames[0]}가 남은 인원을 안전하게 구출했다.`],
    relatedPersonnelCodenames: codenames,
    relatedWikiSlugs: ["irrelevant-wiki"],
    relatedCatalogSlugs: ["irrelevant-catalog"],
    participants: ["비공개 참가자 필드는 조회하지 않음"],
    gmId: "private-gm-id",
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function fakeDb({ reports = [], characters = [], owners } = {}) {
  const rowsByCollection = {
    session_reports: reports,
    characters,
    users: owners ?? [
      { _id: ACTIVE_OWNER, status: "ACTIVE" },
      { _id: INACTIVE_OWNER, status: "SUSPENDED" },
    ],
    wiki_pages: [{ slug: "irrelevant-wiki", isPublic: true }],
    master_items: [{ slug: "irrelevant-catalog", isPublic: true }],
  };
  const queries = [];
  const db = {
    collection(name) {
      return {
        find(filter, options = {}) {
          queries.push({ name, filter, options });
          const rows = rowsByCollection[name].filter((row) =>
            Object.entries(filter).every(([field, condition]) => {
              if (condition?.$in) {
                return condition.$in.some((value) => String(row[field]) === String(value));
              }
              if (condition?.$ne !== undefined) return row[field] !== condition.$ne;
              return row[field] === condition;
            }),
          );
          return {
            async toArray() {
              if (!options.projection) return rows;
              return rows.map((row) => Object.fromEntries(
                Object.entries(row).filter(([field]) =>
                  options.projection[field] === 1 ||
                  (field === "_id" && options.projection._id !== 0),
                ),
              ));
            },
          };
        },
      };
    },
  };
  return { db, queries };
}

async function legacySource(reportValue, db) {
  const [safeReport] = await sanitizeSessionReportReferencesForPublicTargets(
    [reportValue],
    { db },
  );
  const characters = await findHonorCandidateCharactersByCodenames(
    safeReport.relatedPersonnelCodenames ?? [],
    { db },
  );
  return buildOperationHonorSourceMaterial({ report: safeReport, characters });
}

test("10개 보고서 sourceHash는 기존 정제와 동일하며 4번 조회로 묶인다", async () => {
  const characters = [agent("ALPHA"), agent("BETA")];
  const reports = Array.from({ length: 10 }, (_, index) =>
    report(`REPORT-${index}`, index % 2 ? ["BETA"] : ["ALPHA", "BETA"]),
  );
  delete reports[0].minRole;
  const baseline = fakeDb({ reports, characters });
  const expected = new Map();
  for (const entry of reports) {
    expected.set(entry.sessionId, await legacySource(entry, baseline.db));
  }

  const { db, queries } = fakeDb({ reports, characters });
  const actual = await findCurrentOperationHonorSources(
    [...reports.map((entry) => entry.sessionId), reports[0].sessionId],
    { db },
  );
  assert.equal(actual.size, reports.length);
  for (const [key, entry] of actual) {
    assert.deepEqual(entry.source, expected.get(key));
    assert.equal("participants" in entry.report, false);
    assert.equal("gmId" in entry.report, false);
    assert.equal("relatedWikiSlugs" in entry.report, false);
    assert.equal("relatedCatalogSlugs" in entry.report, false);
  }
  assert.deepEqual(queries.map((query) => query.name), [
    "session_reports", "characters", "characters", "users",
  ]);
  assert.equal(queries[0].filter.sessionId.$in.length, reports.length);
});

test("비공개·중복 코드네임·NPC·소유자 없는 인물은 bulk에서도 후보가 되지 않는다", async () => {
  const characters = [
    agent("VALID"),
    agent("PRIVATE", { isPublic: false }),
    agent("DUPLICATE"),
    agent("DUPLICATE", { isPublic: false }),
    agent("NPC", { type: "NPC" }),
    agent("OWNERLESS", { ownerId: undefined }),
    agent("INACTIVE", { ownerId: String(INACTIVE_OWNER) }),
    agent("MISSING_OWNER", { ownerId: String(MISSING_OWNER) }),
  ];
  const reports = characters.map((entry, index) => report(`R-${index}`, [entry.codename]));
  const { db } = fakeDb({ reports, characters });
  const actual = await findCurrentOperationHonorSources(reports.map((entry) => entry.sessionId), { db });
  assert.deepEqual([...actual.keys()], ["R-0"]);
  assert.deepEqual(actual.get("R-0").source.candidates.map((entry) => entry.codename), ["VALID"]);
});

test("현재 U가 아닌 보고서와 중복 source는 존재·공적을 반환하지 않는다", async () => {
  const characters = [agent("VALID")];
  const reports = [
    report("PUBLIC", ["VALID"]),
    report("LEGACY", ["VALID"], { minRole: undefined }),
    report("NULL-ROLE", ["VALID"], { minRole: null }),
    report("PRIVATE", ["VALID"], { minRole: "V" }),
    report("INVALID", ["VALID"], { minRole: "INVALID" }),
    report("DUPLICATE", ["VALID"]),
    report("DUPLICATE", ["VALID"], { minRole: "GM" }),
  ];
  const { db } = fakeDb({ reports, characters });
  const actual = await findCurrentOperationHonorSources(
    [...reports.map((entry) => entry.sessionId), "MISSING"],
    { db },
  );
  assert.deepEqual([...actual.keys()], ["PUBLIC", "LEGACY", "NULL-ROLE"]);
});

test("본문·revision·후보 변경은 기존 sourceHash와 동일하게 즉시 반영된다", async () => {
  const characters = [agent("ALPHA"), agent("BETA")];
  const original = report("REPORT", ["ALPHA", "BETA"]);
  const firstDb = fakeDb({ reports: [original], characters });
  const first = (await findCurrentOperationHonorSources(["REPORT"], { db: firstDb.db })).get("REPORT");

  for (const changed of [
    { ...original, summary: "ALPHA가 추가 구조를 수행했다." },
    { ...original, updatedAt: new Date(UPDATED_AT.getTime() + 1_000) },
    { ...original, relatedPersonnelCodenames: ["ALPHA"] },
  ]) {
    const { db } = fakeDb({ reports: [changed], characters });
    const actual = (await findCurrentOperationHonorSources(["REPORT"], { db })).get("REPORT");
    assert.notEqual(actual.source.sourceHash, first.source.sourceHash);
    assert.deepEqual(actual.source, await legacySource(changed, db));
  }
});

test("빈 source 목록은 DB 조회 없이 종료한다", async () => {
  const { db, queries } = fakeDb();
  assert.equal((await findCurrentOperationHonorSources([], { db })).size, 0);
  assert.equal(queries.length, 0);
});
