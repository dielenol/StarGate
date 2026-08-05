import assert from "node:assert/strict";
import test from "node:test";

const {
  applySeedCompatibilityRepairs,
  planCharacterNestedDateRepair,
  planMasterItemNullableManagedRepair,
  seedCompatibilityRepairDigest,
  seedCompatibilityRepairPostconditionIssues,
} = await import("../lore-seed-compatibility.ts");

function makeClient(session) {
  return { startSession: () => session };
}

test("character nested BSON Date만 ISO 문자열로 정규화하고 입력은 보존한다", () => {
  const relationDate = new Date("2026-06-11T00:00:00.000Z");
  const appearanceDate = new Date("2026-07-02T00:00:00.000Z");
  const character = {
    lore: {
      relations: [
        { targetCodename: "TIME", updatedAt: relationDate },
        { targetCodename: "AERIN", updatedAt: "2026-07-01T00:00:00.000Z" },
      ],
      sessionAppearances: [
        { sessionId: "S1", updatedAt: appearanceDate },
        { sessionId: "S2" },
      ],
    },
  };

  const repair = planCharacterNestedDateRepair(character);
  assert.deepEqual(repair, {
    set: {
      "lore.relations": [
        { targetCodename: "TIME", updatedAt: "2026-06-11T00:00:00.000Z" },
        { targetCodename: "AERIN", updatedAt: "2026-07-01T00:00:00.000Z" },
      ],
      "lore.sessionAppearances": [
        { sessionId: "S1", updatedAt: "2026-07-02T00:00:00.000Z" },
        { sessionId: "S2" },
      ],
    },
  });
  assert.equal(character.lore.relations[0].updatedAt, relationDate);
  assert.equal(character.lore.sessionAppearances[0].updatedAt, appearanceDate);
});

test("이미 호환되는 character는 repair를 만들지 않는다", () => {
  assert.equal(
    planCharacterNestedDateRepair({
      lore: {
        relations: [{ updatedAt: "2026-06-11T00:00:00.000Z" }],
        sessionAppearances: [],
      },
    }),
    null,
  );
});

test("master item optional null만 unset 대상으로 계획한다", () => {
  assert.deepEqual(
    planMasterItemNullableManagedRepair({
      damage: null,
      authorId: null,
      authorName: "기록관",
      description: null,
    }),
    { unsetFields: ["damage", "authorId"] },
  );
  assert.equal(planMasterItemNullableManagedRepair({ damage: "" }), null);
});

test("repair plan digest는 대상과 unset 순서에 무관하게 안정적이다", () => {
  const character = {
    collection: "characters",
    id: "character-1",
    key: "TIME",
    expectedUpdatedAt: new Date("2026-08-05T00:00:00.000Z"),
    set: { "lore.relations": [{ updatedAt: "2026-08-04T00:00:00.000Z" }] },
  };
  const item = {
    collection: "master_items",
    id: "item-1",
    key: "broken-syllable",
    expectedUpdatedAt: undefined,
    unsetFields: ["damage", "authorId"],
  };

  assert.equal(
    seedCompatibilityRepairDigest([character, item]),
    seedCompatibilityRepairDigest([
      { ...item, unsetFields: ["authorId", "damage"] },
      character,
    ]),
  );
});

test("post-read verifier는 exact normalized target만 적용 상태로 인정한다", () => {
  const repair = {
    collection: "characters",
    id: "character-1",
    key: "TIME",
    expectedUpdatedAt: new Date("2026-08-05T00:00:00.000Z"),
    set: {
      "lore.relations": [
        { targetCodename: "AERIN", updatedAt: "2026-08-04T00:00:00.000Z" },
      ],
    },
  };
  const normalized = {
    updatedAt: new Date("2026-08-05T00:01:00.000Z"),
    lore: {
      relations: [
        { targetCodename: "AERIN", updatedAt: "2026-08-04T00:00:00.000Z" },
      ],
    },
  };

  assert.deepEqual(
    seedCompatibilityRepairPostconditionIssues(normalized, repair),
    [],
  );
  assert.match(
    seedCompatibilityRepairPostconditionIssues(null, repair)[0],
    /target-missing/u,
  );
  assert.match(
    seedCompatibilityRepairPostconditionIssues(
      { updatedAt: new Date(), lore: "invalid" },
      repair,
    )[0],
    /postcondition-mismatch/u,
  );
  assert.match(
    seedCompatibilityRepairPostconditionIssues(
      { ...normalized, updatedAt: repair.expectedUpdatedAt },
      repair,
    )[0],
    /updatedAt:unchanged/u,
  );
});

test("post-read verifier는 unset target의 field absence를 요구한다", () => {
  const repair = {
    collection: "master_items",
    id: "item-1",
    key: "broken-syllable",
    expectedUpdatedAt: new Date("2026-08-05T00:00:00.000Z"),
    unsetFields: ["damage"],
  };
  assert.deepEqual(
    seedCompatibilityRepairPostconditionIssues(
      { updatedAt: new Date("2026-08-05T00:01:00.000Z") },
      repair,
    ),
    [],
  );
  assert.match(
    seedCompatibilityRepairPostconditionIssues(
      { damage: null, updatedAt: new Date("2026-08-05T00:01:00.000Z") },
      repair,
    )[0],
    /still-present/u,
  );
});

test("approved plan은 transaction 안에서 exact CAS update 후 적용 목록을 반환한다", async () => {
  const expected = [
    {
      collection: "characters",
      id: "character-1",
      key: "TIME",
      expectedUpdatedAt: new Date("2026-08-05T00:00:00.000Z"),
      set: { "lore.relations": [{ updatedAt: "2026-08-04T00:00:00.000Z" }] },
    },
    {
      collection: "master_items",
      id: "item-1",
      key: "broken-syllable",
      expectedUpdatedAt: undefined,
      unsetFields: ["damage", "authorId"],
    },
  ];
  const inspections = [expected, []];
  const writes = [];
  let ended = false;
  const session = {
    withTransaction: async (callback) => callback(),
    endSession: async () => {
      ended = true;
    },
  };
  const db = {
    collection: (collection) => ({
      updateOne: async (filter, update, options) => {
        writes.push({ collection, filter, update, options });
        return { matchedCount: 1, modifiedCount: 1 };
      },
    }),
  };

  const applied = await applySeedCompatibilityRepairs(
    db,
    makeClient(session),
    expected,
    seedCompatibilityRepairDigest(expected),
    async (activeSession) => {
      assert.equal(activeSession, session);
      return inspections.shift();
    },
  );

  assert.equal(applied, expected);
  assert.equal(ended, true);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], {
    collection: "characters",
    filter: {
      _id: "character-1",
      updatedAt: new Date("2026-08-05T00:00:00.000Z"),
    },
    update: {
      $currentDate: { updatedAt: true },
      $set: {
        "lore.relations": [{ updatedAt: "2026-08-04T00:00:00.000Z" }],
      },
    },
    options: { session },
  });
  assert.deepEqual(writes[1], {
    collection: "master_items",
    filter: { _id: "item-1", updatedAt: { $exists: false } },
    update: {
      $currentDate: { updatedAt: true },
      $unset: { damage: "", authorId: "" },
    },
    options: { session },
  });
});

test("approved digest와 다른 현재 snapshot이면 write 전에 중단한다", async () => {
  const expected = [{
    collection: "characters",
    id: "character-1",
    key: "TIME",
    expectedUpdatedAt: new Date("2026-08-05T00:00:00.000Z"),
    set: { "lore.relations": [{ targetCodename: "AERIN" }] },
  }];
  const current = [{
    ...expected[0],
    expectedUpdatedAt: new Date("2026-08-05T00:01:00.000Z"),
  }];
  let writes = 0;
  let ended = false;
  const session = {
    withTransaction: async (callback) => callback(),
    endSession: async () => {
      ended = true;
    },
  };
  const db = {
    collection: () => ({
      updateOne: async () => {
        writes += 1;
        return { matchedCount: 1, modifiedCount: 1 };
      },
    }),
  };

  await assert.rejects(
    applySeedCompatibilityRepairs(
      db,
      makeClient(session),
      expected,
      seedCompatibilityRepairDigest(expected),
      async () => current,
    ),
    /inspection\/CAS snapshot/u,
  );
  assert.equal(writes, 0);
  assert.equal(ended, true);
});

test("두 번째 row CAS 실패는 transaction callback을 실패시켜 선행 write를 commit하지 않는다", async () => {
  const expected = [
    {
      collection: "characters",
      id: "character-1",
      key: "TIME",
      expectedUpdatedAt: new Date("2026-08-05T00:00:00.000Z"),
      set: { "lore.relations": [{ targetCodename: "AERIN" }] },
    },
    {
      collection: "master_items",
      id: "item-1",
      key: "broken-syllable",
      expectedUpdatedAt: new Date("2026-08-05T00:00:00.000Z"),
      unsetFields: ["damage"],
    },
  ];
  const committed = [];
  let staged = [];
  let aborted = false;
  let ended = false;
  const session = {
    withTransaction: async (callback) => {
      staged = [...committed];
      try {
        await callback();
        committed.splice(0, committed.length, ...staged);
      } catch (error) {
        staged = [];
        aborted = true;
        throw error;
      }
    },
    endSession: async () => {
      ended = true;
    },
  };
  let writes = 0;
  const db = {
    collection: (collection) => ({
      updateOne: async () => {
        writes += 1;
        if (writes === 2) return { matchedCount: 0, modifiedCount: 0 };
        staged.push(collection);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    }),
  };

  await assert.rejects(
    applySeedCompatibilityRepairs(
      db,
      makeClient(session),
      expected,
      seedCompatibilityRepairDigest(expected),
      async () => expected,
    ),
    /CAS 실패/u,
  );
  assert.equal(writes, 2);
  assert.equal(aborted, true);
  assert.deepEqual(committed, []);
  assert.equal(ended, true);
});

test("report lock write conflict의 driver retry는 같은 승인 snapshot만 재적용한다", async () => {
  const expected = [{
    collection: "characters",
    id: "character-1",
    key: "TIME",
    expectedUpdatedAt: new Date("2026-08-05T00:00:00.000Z"),
    set: { "lore.relations": [{ targetCodename: "AERIN" }] },
  }];
  const inspections = [expected, expected, []];
  let writes = 0;
  let retries = 0;
  let ended = false;
  const session = {
    withTransaction: async (callback) => {
      try {
        return await callback();
      } catch (error) {
        if (error.message !== "transient write conflict") throw error;
        retries += 1;
        return callback();
      }
    },
    endSession: async () => {
      ended = true;
    },
  };
  const db = {
    collection: () => ({
      updateOne: async () => {
        writes += 1;
        if (writes === 1) throw new Error("transient write conflict");
        return { matchedCount: 1, modifiedCount: 1 };
      },
    }),
  };

  await applySeedCompatibilityRepairs(
    db,
    makeClient(session),
    expected,
    seedCompatibilityRepairDigest(expected),
    async () => inspections.shift(),
  );
  assert.equal(retries, 1);
  assert.equal(writes, 2);
  assert.equal(inspections.length, 0);
  assert.equal(ended, true);
});

test("driver retry 사이 dossier가 바뀌면 최신 배열을 덮지 않고 중단한다", async () => {
  const expected = [{
    collection: "characters",
    id: "character-1",
    key: "TIME",
    expectedUpdatedAt: new Date("2026-08-05T00:00:00.000Z"),
    set: { "lore.relations": [{ targetCodename: "AERIN" }] },
  }];
  const latest = [{
    ...expected[0],
    expectedUpdatedAt: new Date("2026-08-05T00:01:00.000Z"),
    set: {
      "lore.relations": [
        { targetCodename: "AERIN" },
        { targetCodename: "WEXLER" },
      ],
    },
  }];
  const inspections = [expected, latest];
  let writes = 0;
  const session = {
    withTransaction: async (callback) => {
      try {
        return await callback();
      } catch (error) {
        if (error.message !== "transient write conflict") throw error;
        return callback();
      }
    },
    endSession: async () => {},
  };
  const db = {
    collection: () => ({
      updateOne: async () => {
        writes += 1;
        throw new Error("transient write conflict");
      },
    }),
  };

  await assert.rejects(
    applySeedCompatibilityRepairs(
      db,
      makeClient(session),
      expected,
      seedCompatibilityRepairDigest(expected),
      async () => inspections.shift(),
    ),
    /inspection\/CAS snapshot/u,
  );
  assert.equal(writes, 1);
});

test("적용 대상이 없는 재실행은 session과 DB를 건드리지 않는다", async () => {
  const applied = await applySeedCompatibilityRepairs(
    { collection: () => assert.fail("DB에 접근하면 안 됩니다.") },
    { startSession: () => assert.fail("session을 열면 안 됩니다.") },
    [],
    seedCompatibilityRepairDigest([]),
    async () => assert.fail("inspection을 실행하면 안 됩니다."),
  );
  assert.deepEqual(applied, []);
});
