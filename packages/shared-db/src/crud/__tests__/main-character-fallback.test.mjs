/**
 * findMainCharacterByOwner GM NPC fallback 정책 검증.
 *
 * 실제 DB 없이 collections.js를 mock으로 대체한다.
 * Node 24+의 --experimental-test-module-mocks 플래그 사용.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ObjectId } from "mongodb";

const testApi = await import("node:test");
const HAS_MODULE_MOCK =
  testApi.mock && typeof testApi.mock.module === "function";

if (!HAS_MODULE_MOCK) {
  test("findMainCharacterByOwner GM NPC fallback — module mock 미지원", { skip: true }, () => {});
} else {
  const OWNER_ID = new ObjectId().toHexString();
  const OTHER_OWNER_ID = new ObjectId().toHexString();

  let characterDocs = [];
  let userDocs = [];

  function matchesTierCondition(doc, condition) {
    if (condition.tier === "MAIN") return doc.tier === "MAIN";
    if (condition.tier?.$exists === false) return !("tier" in doc);
    return false;
  }

  function matchesFilter(doc, filter) {
    if (filter.type && doc.type !== filter.type) return false;
    if (filter.ownerId && doc.ownerId !== filter.ownerId) return false;
    if (filter.$or && !filter.$or.some((condition) => matchesTierCondition(doc, condition))) {
      return false;
    }
    return true;
  }

  function projectDoc(doc, projection) {
    const projected = {};
    for (const key of Object.keys(projection)) {
      if (projection[key] && key in doc) projected[key] = doc[key];
    }
    return projected;
  }

  const fakeCharactersCol = {
    find(filter) {
      const results = characterDocs.filter((doc) => matchesFilter(doc, filter));
      return {
        async toArray() {
          return results;
        },
        project(projection) {
          return {
            async toArray() {
              return results.map((doc) => projectDoc(doc, projection));
            },
          };
        },
      };
    },
  };

  const fakeUsersCol = {
    async findOne(filter) {
      const id = filter._id?.toHexString?.();
      return userDocs.find((doc) => doc._id.toHexString() === id) ?? null;
    },
  };

  testApi.mock.module(
    new URL("../../../dist/collections.js", import.meta.url).href,
    {
      namedExports: {
        charactersCol: async () => fakeCharactersCol,
        usersCol: async () => fakeUsersCol,
      },
    },
  );

  const {
    findMainCharacterByOwner,
    findMainCharacterLiteByOwner,
  } = await import("../../../dist/crud/characters.js");

  function resetFixtures() {
    characterDocs = [];
    userDocs = [];
  }

  test("AGENT MAIN이 있으면 GM NPC보다 AGENT를 우선 반환", async () => {
    resetFixtures();
    userDocs = [{ _id: new ObjectId(OWNER_ID), role: "GM", status: "ACTIVE" }];
    characterDocs = [
      {
        _id: new ObjectId(),
        codename: "AGENT_MAIN",
        type: "AGENT",
        ownerId: OWNER_ID,
        tier: "MAIN",
        agentLevel: "M",
        isPublic: true,
        lore: { name: "메인 요원" },
      },
      {
        _id: new ObjectId(),
        codename: "NPC_FALLBACK",
        type: "NPC",
        ownerId: OWNER_ID,
        agentLevel: "M",
        isPublic: true,
        lore: { name: "운영 NPC" },
      },
    ];

    const main = await findMainCharacterByOwner(OWNER_ID);
    assert.equal(main.codename, "AGENT_MAIN");
    assert.equal(main.type, "AGENT");
  });

  test("ACTIVE GM이 AGENT 없이 NPC 1건만 소유하면 NPC fallback 반환", async () => {
    resetFixtures();
    userDocs = [{ _id: new ObjectId(OWNER_ID), role: "GM", status: "ACTIVE" }];
    characterDocs = [
      {
        _id: new ObjectId(),
        codename: "AMERI",
        type: "NPC",
        ownerId: OWNER_ID,
        agentLevel: "M",
        isPublic: true,
        lore: { name: "아메리" },
      },
    ];

    const main = await findMainCharacterByOwner(OWNER_ID);
    const lite = await findMainCharacterLiteByOwner(OWNER_ID);
    assert.equal(main.codename, "AMERI");
    assert.equal(main.type, "NPC");
    assert.equal(lite.codename, "AMERI");
    assert.equal(lite.type, "NPC");
  });

  test("비GM 소유 NPC는 메인 캐릭터 fallback이 되지 않음", async () => {
    resetFixtures();
    userDocs = [{ _id: new ObjectId(OWNER_ID), role: "M", status: "ACTIVE" }];
    characterDocs = [
      {
        _id: new ObjectId(),
        codename: "NPC_ONLY",
        type: "NPC",
        ownerId: OWNER_ID,
        agentLevel: "M",
        isPublic: true,
        lore: { name: "NPC" },
      },
    ];

    const main = await findMainCharacterByOwner(OWNER_ID);
    assert.equal(main, null);
  });

  test("GM fallback NPC가 여러 건이면 정합성 오류", async () => {
    resetFixtures();
    userDocs = [{ _id: new ObjectId(OWNER_ID), role: "GM", status: "ACTIVE" }];
    characterDocs = [
      {
        _id: new ObjectId(),
        codename: "NPC_A",
        type: "NPC",
        ownerId: OWNER_ID,
        agentLevel: "M",
        isPublic: true,
        lore: { name: "NPC A" },
      },
      {
        _id: new ObjectId(),
        codename: "NPC_B",
        type: "NPC",
        ownerId: OWNER_ID,
        agentLevel: "M",
        isPublic: true,
        lore: { name: "NPC B" },
      },
      {
        _id: new ObjectId(),
        codename: "OTHER_OWNER_NPC",
        type: "NPC",
        ownerId: OTHER_OWNER_ID,
        agentLevel: "M",
        isPublic: true,
        lore: { name: "다른 소유자 NPC" },
      },
    ];

    await assert.rejects(
      () => findMainCharacterByOwner(OWNER_ID),
      /owned NPC fallback candidates/,
    );
  });
}
