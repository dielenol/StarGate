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
    if (filter._id instanceof ObjectId && !filter._id.equals(doc._id)) return false;
    if (
      filter._id?.$in &&
      !filter._id.$in.some((id) => id.toHexString() === doc._id.toHexString())
    ) {
      return false;
    }
    if (filter.$or && !filter.$or.some((condition) => matchesTierCondition(doc, condition))) {
      return false;
    }
    return true;
  }

  function projectDoc(doc, projection) {
    const projected = {};
    for (const key of Object.keys(projection)) {
      if (key.includes(".")) {
        const [parent, child] = key.split(".");
        if (projection[key] && doc[parent]?.[child] !== undefined) {
          projected[parent] ??= {};
          projected[parent][child] = doc[parent][child];
        }
        continue;
      }
      if (projection[key] && key in doc) projected[key] = doc[key];
    }
    return projected;
  }

  const fakeCharactersCol = {
    async findOne(filter, options = {}) {
      const result = characterDocs.find((doc) => matchesFilter(doc, filter));
      if (!result) return null;
      return options.projection ? projectDoc(result, options.projection) : result;
    },
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
    findDisplayCharacterByOwner,
    findDisplayCharacterLiteByOwner,
    findMainCharacterByOwner,
    findMainCharacterLiteByOwner,
    findMainDashboardCharacterByOwner,
    findDisplayDashboardCharacterByOwner,
    findDashboardCharacterById,
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
    assert.equal((await findMainDashboardCharacterByOwner(OWNER_ID)).codename, main.codename);
  });

  test("ACTIVE GM의 명시적 NPC는 표시 신원만 바꾸고 경제 메인은 유지", async () => {
    resetFixtures();
    const mainAgentId = new ObjectId();
    const selectedNpcId = new ObjectId();
    userDocs = [
      {
        _id: new ObjectId(OWNER_ID),
        role: "GM",
        status: "ACTIVE",
        characterIds: [mainAgentId.toHexString(), selectedNpcId.toHexString()],
      },
    ];
    characterDocs = [
      {
        _id: mainAgentId,
        codename: "AGENT_MAIN",
        type: "AGENT",
        ownerId: OWNER_ID,
        tier: "MAIN",
        agentLevel: "G",
        isPublic: false,
        lore: { name: "경제 메인" },
      },
      {
        _id: selectedNpcId,
        codename: "CLAIRVOYANCE",
        type: "NPC",
        ownerId: OWNER_ID,
        agentLevel: "H",
        isPublic: true,
        lore: { name: "수잔 델라웨어" },
      },
    ];

    const main = await findMainCharacterByOwner(OWNER_ID);
    const display = await findDisplayCharacterByOwner(OWNER_ID);
    const displayLite = await findDisplayCharacterLiteByOwner(OWNER_ID);
    assert.equal(main.codename, "AGENT_MAIN");
    assert.equal(display.codename, "CLAIRVOYANCE");
    assert.equal(display.agentLevel, "H");
    assert.equal(displayLite.codename, "CLAIRVOYANCE");
    assert.equal(displayLite.lore.name, "수잔 델라웨어");
    assert.equal((await findMainDashboardCharacterByOwner(OWNER_ID))._id.toString(), mainAgentId.toString());
    assert.equal((await findDisplayDashboardCharacterByOwner(OWNER_ID))._id.toString(), selectedNpcId.toString());
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
    assert.equal((await findMainDashboardCharacterByOwner(OWNER_ID)).codename, main.codename);
    assert.equal((await findDisplayDashboardCharacterByOwner(OWNER_ID)).codename, main.codename);
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
    assert.equal(await findMainDashboardCharacterByOwner(OWNER_ID), null);
    assert.equal(await findDisplayDashboardCharacterByOwner(OWNER_ID), null);
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
    await assert.rejects(() => findMainDashboardCharacterByOwner(OWNER_ID), /owned NPC fallback candidates/);
    await assert.rejects(() => findDisplayDashboardCharacterByOwner(OWNER_ID), /owned NPC fallback candidates/);
  });

  test("대시보드 projection은 초상·HP/SAN/포인트를 보존하고 원본 시트는 반환하지 않음", async () => {
    resetFixtures();
    const id = new ObjectId();
    characterDocs = [{
      _id: id, codename: "MAIN", type: "AGENT", tier: "MAIN", ownerId: OWNER_ID,
      agentLevel: "U", pixelCharacterImage: "/pixel.webp", previewImage: "/preview.webp",
      lore: { name: "요원", background: "private biography" },
      play: { hp: 12, san: 0, points: 0, abilities: [{ name: "private ability" }] },
      rawText: "full source", loreMd: "full lore", clearanceOverrides: { identity: "GM" },
    }];
    const expected = {
      _id: id, codename: "MAIN", type: "AGENT", agentLevel: "U",
      pixelCharacterImage: "/pixel.webp", previewImage: "/preview.webp",
      lore: { name: "요원" }, play: { hp: 12, san: 0, points: 0 },
    };
    assert.deepEqual(await findMainDashboardCharacterByOwner(OWNER_ID), expected);
    assert.deepEqual(await findDisplayDashboardCharacterByOwner(OWNER_ID), expected);
    assert.deepEqual(await findDashboardCharacterById(id.toString()), expected);
    assert.equal(await findDashboardCharacterById("invalid-id"), null);
    assert.equal(await findDashboardCharacterById(new ObjectId().toString()), null);
  });

  test("대시보드도 legacy MAIN을 허용하고 여러 MAIN은 fail-closed", async () => {
    resetFixtures();
    characterDocs = [{ _id: new ObjectId(), codename: "LEGACY", type: "AGENT", ownerId: OWNER_ID, lore: { name: "legacy" } }];
    assert.equal((await findMainDashboardCharacterByOwner(OWNER_ID)).codename, "LEGACY");
    characterDocs.push({ ...characterDocs[0], _id: new ObjectId(), codename: "DUPLICATE", tier: "MAIN" });
    await assert.rejects(() => findMainDashboardCharacterByOwner(OWNER_ID), /MAIN agents/);
    await assert.rejects(() => findDisplayDashboardCharacterByOwner(OWNER_ID), /MAIN agents/);
  });

  test("대시보드 NPC fallback은 ACTIVE GM에만 허용", async () => {
    resetFixtures();
    const id = new ObjectId();
    characterDocs = [{ _id: id, codename: "NPC", type: "NPC", ownerId: OWNER_ID, lore: { name: "NPC" }, previewImage: "" }];
    for (const owner of [
      { role: "GM", status: "SUSPENDED" },
      { role: "U", status: "ACTIVE" },
      { role: "GM" },
    ]) {
      userDocs = [{ _id: new ObjectId(OWNER_ID), characterIds: [id.toString()], ...owner }];
      assert.equal(await findMainDashboardCharacterByOwner(OWNER_ID), null);
      assert.equal(await findDisplayDashboardCharacterByOwner(OWNER_ID), null);
    }
    userDocs = [];
    assert.equal(await findDisplayDashboardCharacterByOwner(OWNER_ID), null);
  });

  test("대시보드 GM 표시 NPC는 소유권과 단일 선택을 유지", async () => {
    resetFixtures();
    const ids = [new ObjectId(), new ObjectId()];
    userDocs = [{ _id: new ObjectId(OWNER_ID), role: "GM", status: "ACTIVE", characterIds: ids.map(String) }];
    characterDocs = ids.map((id, index) => ({ _id: id, codename: `NPC-${index}`, type: "NPC", ownerId: OWNER_ID, lore: { name: "NPC" } }));
    await assert.rejects(() => findDisplayDashboardCharacterByOwner(OWNER_ID), /selected NPCs/);
    characterDocs[1].ownerId = OTHER_OWNER_ID;
    const actual = await findDisplayDashboardCharacterByOwner(OWNER_ID);
    assert.equal(actual._id.toString(), ids[0].toString());
    assert.equal("play" in actual, false);
    assert.equal("pixelCharacterImage" in actual, false);
  });
}
