/**
 * Validator 검증 — PATCH 라우트의 sub-document 별 화이트리스트 합성
 *
 * 영역 C 시나리오 (1~8):
 *   C-1: admin V+ → AGENT 의 lore + play 모두 set
 *   C-2: admin V+ → NPC 의 lore set
 *   C-3: admin V+ → NPC 에 play 시도 → silent drop (NPC 화이트리스트는 play 미포함)
 *   C-4: player → 본인 owner AGENT 의 lore 8필드 set
 *   C-5: player → 본인 owner AGENT 의 play 시도 → silent drop
 *   C-6: player → 본인 owner NPC 시도 → 404 (canEditLore 가 차단)
 *   C-7: player → 타인 AGENT 시도 → 404
 *   C-8: GM → admin 동일
 *
 * 라우트의 핵심 합성 로직 (route.ts:152-163) 미러링:
 *   if (isAdmin) → ROOT_ADMIN + ALLOWED_LORE_FIELDS_ADMIN + (playAllowed ? ALLOWED_PLAY_FIELDS_ADMIN : ∅)
 *   else        → ALLOWED_LORE_FIELDS_PLAYER (player 는 play 자동 drop)
 *
 * 실행:
 *   cd StarGateV2 && node --test --experimental-test-module-mocks --experimental-strip-types \
 *     lib/auth/__tests__/character-patch-whitelist.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";

import { canEditLore, canEditPlay } from "../rbac.ts";

const testApi = await import("node:test");
const HAS_MODULE_MOCK =
  testApi.mock && typeof testApi.mock.module === "function";

if (!HAS_MODULE_MOCK) {
  test("Patch whitelist e2e: module mock 미지원 — skip", { skip: true }, () => {});
} else {
  let capturedSetPayload = null;

  const fakeCol = {
    updateOne: async (_filter, doc) => {
      capturedSetPayload = doc.$set;
      return { modifiedCount: 1, matchedCount: 1, acknowledged: true };
    },
  };

  const sharedDbRoot = new URL(
    "../../../../packages/shared-db/dist/",
    import.meta.url,
  );
  testApi.mock.module(new URL("collections.js", sharedDbRoot).href, {
    namedExports: {
      charactersCol: async () => fakeCol,
    },
  });

  const {
    updateCharacter,
    ALLOWED_LORE_FIELDS_ADMIN,
    ALLOWED_LORE_FIELDS_PLAYER,
    ALLOWED_PLAY_FIELDS_ADMIN,
  } = await import(new URL("crud/characters.js", sharedDbRoot).href);

  const ROOT_ALLOWED_FIELDS_ADMIN = new Set([
    "codename",
    "tier",
    "role",
    "agentLevel",
    "department",
    "previewImage",
    "pixelCharacterImage",
    "warningVideo",
    "ownerId",
    "isPublic",
    "factionCode",
    "institutionCode",
  ]);

  /**
   * 라우트 합성 로직 미러 (route.ts PATCH 의 핵심 분기).
   * 입력: session 사용자 + 캐릭터(존재 시) → allowedFields Set
   */
  function composeAllowedFields({ session, before }) {
    const loreDecision = canEditLore(
      session.user.id,
      session.user.role,
      before ?? { type: "AGENT", ownerId: null },
    );
    if (!before || loreDecision.mode === "none") {
      return { status: 404, allowedFields: null, mode: null };
    }
    const playAllowed = canEditPlay(
      session.user.id,
      session.user.role,
      before,
    );
    const isAdmin = loreDecision.mode === "admin";
    const allowed = new Set();
    if (isAdmin) {
      for (const f of ROOT_ALLOWED_FIELDS_ADMIN) allowed.add(f);
      for (const f of ALLOWED_LORE_FIELDS_ADMIN) allowed.add(f);
      if (playAllowed) {
        for (const f of ALLOWED_PLAY_FIELDS_ADMIN) allowed.add(f);
      }
    } else {
      for (const f of ALLOWED_LORE_FIELDS_PLAYER) allowed.add(f);
    }
    return {
      status: 200,
      allowedFields: allowed,
      mode: loreDecision.mode,
      playAllowed,
    };
  }

  const VALID_ID = new ObjectId().toHexString();

  /* ── C-1: admin V+ + AGENT — lore + play 모두 통과 ── */

  test("C-1: admin V + AGENT — lore patch + play patch 모두 $set 통과", async () => {
    capturedSetPayload = null;
    const before = { type: "AGENT", ownerId: "owner-x" };
    const session = { user: { id: "v-admin", role: "V" } };
    const compose = composeAllowedFields({ session, before });
    assert.equal(compose.status, 200);
    assert.equal(compose.mode, "admin");
    assert.equal(compose.playAllowed, true);

    // lore + play 동시 patch
    const body = {
      lore: { appearance: "변경됨", personality: "냉정" },
      play: { hp: 99, atk: 50 },
      role: "agent",
    };
    await updateCharacter(VALID_ID, body, { allowedFields: compose.allowedFields });

    assert.equal(capturedSetPayload["lore.appearance"], "변경됨");
    assert.equal(capturedSetPayload["lore.personality"], "냉정");
    assert.equal(capturedSetPayload["play.hp"], 99);
    assert.equal(capturedSetPayload["play.atk"], 50);
    assert.equal(capturedSetPayload.role, "agent");
  });

  /* ── C-2: admin + NPC — lore 만 ── */

  test("C-2: admin V + NPC — lore set, play 화이트리스트 자체는 포함되지만 NPC 라 playAllowed=false", async () => {
    capturedSetPayload = null;
    const before = { type: "NPC", ownerId: null };
    const session = { user: { id: "v-admin", role: "V" } };
    const compose = composeAllowedFields({ session, before });
    assert.equal(compose.mode, "admin");
    assert.equal(
      compose.playAllowed,
      false,
      "NPC 는 canEditPlay → false 이므로 play 화이트리스트 미합성",
    );

    // play 가 화이트리스트에 들어가지 않아야 함
    for (const k of ALLOWED_PLAY_FIELDS_ADMIN) {
      assert.ok(!compose.allowedFields.has(k), `NPC admin 에 ${k} 누설`);
    }
    // lore 는 가능
    assert.ok(compose.allowedFields.has("lore.appearance"));

    const body = {
      lore: { appearance: "x" },
      play: { hp: 999 },
    };
    await updateCharacter(VALID_ID, body, { allowedFields: compose.allowedFields });
    assert.equal(capturedSetPayload["lore.appearance"], "x");
    // play.hp silent drop
    assert.ok(!("play.hp" in capturedSetPayload), "NPC 의 play.hp silent drop 실패");
  });

  /* ── C-3: admin + NPC + play 시도 → silent drop ── */

  test("C-3: admin V + NPC body 에 play 포함 → 모두 silent drop", async () => {
    capturedSetPayload = null;
    const before = { type: "NPC", ownerId: null };
    const session = { user: { id: "v-admin", role: "V" } };
    const compose = composeAllowedFields({ session, before });

    const evilBody = {
      lore: { appearance: "ok" },
      play: {
        hp: 999,
        san: 999,
        def: 999,
        atk: 999,
        equipment: [{ name: "exploit" }],
        abilities: [{ slot: "C1", name: "exploit" }],
      },
    };
    await updateCharacter(VALID_ID, evilBody, {
      allowedFields: compose.allowedFields,
    });
    for (const forbidden of [
      "play.hp",
      "play.san",
      "play.def",
      "play.atk",
      "play.equipment",
      "play.abilities",
    ]) {
      assert.ok(
        !(forbidden in capturedSetPayload),
        `NPC ${forbidden} silent drop 실패`,
      );
    }
  });

  /* ── C-4: player + 본인 owner AGENT + lore 8필드 ── */

  test("C-4: player U + owner AGENT — lore 8필드 dot path 통과", async () => {
    capturedSetPayload = null;
    const before = { type: "AGENT", ownerId: "u-self" };
    const session = { user: { id: "u-self", role: "U" } };
    const compose = composeAllowedFields({ session, before });
    assert.equal(compose.mode, "player");
    assert.equal(compose.playAllowed, false);

    // play 화이트리스트가 합성에 미포함이어야 함
    for (const k of ALLOWED_PLAY_FIELDS_ADMIN) {
      assert.ok(!compose.allowedFields.has(k));
    }
    // root 도 미포함
    for (const k of ROOT_ALLOWED_FIELDS_ADMIN) {
      assert.ok(!compose.allowedFields.has(k));
    }

    const body = {
      lore: {
        appearance: "ok",
        personality: "ok",
        background: "ok",
        quote: "ok",
        gender: "M",
        age: "30",
        height: "180",
        weight: "75",
      },
    };
    await updateCharacter(VALID_ID, body, { allowedFields: compose.allowedFields });
    const keys = Object.keys(capturedSetPayload).filter((k) => k !== "updatedAt");
    assert.equal(keys.length, 8);
    assert.deepEqual(
      new Set(keys),
      new Set([
        "lore.quote",
        "lore.appearance",
        "lore.personality",
        "lore.background",
        "lore.gender",
        "lore.age",
        "lore.height",
        "lore.weight",
      ]),
    );
  });

  /* ── C-5: player + 본인 AGENT + play 시도 → silent drop ── */

  test("C-5: player U + owner AGENT — play 화이트리스트는 포함 안 됨, body.play silent drop", async () => {
    capturedSetPayload = null;
    const before = { type: "AGENT", ownerId: "u-self" };
    const session = { user: { id: "u-self", role: "U" } };
    const compose = composeAllowedFields({ session, before });

    const evilBody = {
      lore: { appearance: "ok" },
      play: { hp: 9999, atk: 9999 },
    };
    await updateCharacter(VALID_ID, evilBody, {
      allowedFields: compose.allowedFields,
    });
    assert.equal(capturedSetPayload["lore.appearance"], "ok");
    for (const forbidden of ["play.hp", "play.atk", "play.def", "play.san"]) {
      assert.ok(
        !(forbidden in capturedSetPayload),
        `${forbidden} silent drop 실패`,
      );
    }
  });

  /* ── C-6: player + 본인 owner NPC → 404 (canEditLore 차단 — Review-Fix #10) ── */

  test("C-6: player U + owner NPC — canEditLore 가 'none' 으로 거부 (Review-Fix #10)", () => {
    const before = { type: "NPC", ownerId: "u-self" };
    const session = { user: { id: "u-self", role: "U" } };
    const compose = composeAllowedFields({ session, before });
    assert.equal(
      compose.status,
      404,
      "Review-Fix #10: NPC self-edit 가드 — player 가 본인 owner 인 NPC 도 거부",
    );
  });

  /* ── C-7: player + 타인 AGENT → 404 ── */

  test("C-7: player U + 타인 AGENT → 404", () => {
    const before = { type: "AGENT", ownerId: "u-other" };
    const session = { user: { id: "u-self", role: "U" } };
    const compose = composeAllowedFields({ session, before });
    assert.equal(compose.status, 404);
  });

  /* ── C-8: GM + AGENT → admin 동일 ── */

  test("C-8: GM + AGENT — admin 동일 (lore + play + root 모두)", async () => {
    capturedSetPayload = null;
    const before = { type: "AGENT", ownerId: "any" };
    const session = { user: { id: "gm-user", role: "GM" } };
    const compose = composeAllowedFields({ session, before });
    assert.equal(compose.mode, "admin");
    assert.equal(compose.playAllowed, true);

    const body = {
      lore: { appearance: "x" },
      play: { hp: 100 },
      codename: "GM_X",
      ownerId: null,
    };
    await updateCharacter(VALID_ID, body, { allowedFields: compose.allowedFields });
    assert.equal(capturedSetPayload["lore.appearance"], "x");
    assert.equal(capturedSetPayload["play.hp"], 100);
    assert.equal(capturedSetPayload.codename, "GM_X");
    assert.equal(capturedSetPayload.ownerId, null);
  });

  /* ── C-9: AGENT lore + play 동시 + admin 의 root 메타 — 모두 dot path 또는 root key ── */

  test("C-9: admin 합성 화이트리스트 — lore.* + play.* + root keys 셋 모두 포함", () => {
    const before = { type: "AGENT", ownerId: null };
    const session = { user: { id: "v-admin", role: "V" } };
    const compose = composeAllowedFields({ session, before });
    // ROOT
    assert.ok(compose.allowedFields.has("codename"));
    assert.ok(compose.allowedFields.has("factionCode"));
    assert.ok(compose.allowedFields.has("institutionCode"));
    assert.ok(compose.allowedFields.has("ownerId"));
    // LORE
    assert.ok(compose.allowedFields.has("lore.name"));
    assert.ok(compose.allowedFields.has("lore.posterImage"));
    assert.ok(compose.allowedFields.has("lore.notes"));
    assert.ok(compose.allowedFields.has("lore.loreTags"));
    // PLAY
    assert.ok(compose.allowedFields.has("play.hp"));
    assert.ok(compose.allowedFields.has("play.hpDelta"));
    assert.ok(compose.allowedFields.has("play.equipment"));
    assert.ok(compose.allowedFields.has("play.abilities"));
    assert.ok(compose.allowedFields.has("play.weaponTraining"));
    // 루트 'lore'/'play' 키는 미포함 (dot path only — 부분 patch 안전)
    assert.ok(!compose.allowedFields.has("lore"));
    assert.ok(!compose.allowedFields.has("play"));
  });

  /* ── C-10: admin player+lore.weight 보안 — 양쪽 모두 weight patch 가능 ── */

  test("C-10: admin 도 lore.weight, player 도 lore.weight (ASK A 결정 — 8필드)", async () => {
    capturedSetPayload = null;
    const adminBefore = { type: "AGENT", ownerId: null };
    const playerBefore = { type: "AGENT", ownerId: "u-self" };

    const adminCompose = composeAllowedFields({
      session: { user: { id: "v", role: "V" } },
      before: adminBefore,
    });
    const playerCompose = composeAllowedFields({
      session: { user: { id: "u-self", role: "U" } },
      before: playerBefore,
    });

    assert.ok(adminCompose.allowedFields.has("lore.weight"), "admin lore.weight 가능");
    assert.ok(playerCompose.allowedFields.has("lore.weight"), "player lore.weight 가능 (ASK A)");
  });
}
