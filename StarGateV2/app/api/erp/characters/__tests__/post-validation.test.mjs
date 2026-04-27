/**
 * Validator 검증 — POST /api/erp/characters 의 lore/play 검증 (영역 E, ASK D)
 *
 * 시나리오:
 *   E-1: AGENT 생성 시 lore 누락 → 400
 *   E-2: AGENT 생성 시 play 누락 → 400
 *   E-3: NPC 생성 시 play 포함 → 400 (NPC 는 play 없음)
 *   E-4: AGENT 생성 시 lore.weight 누락 → 400 (필수)
 *   E-5: zod schema — PlaySheet delta 필드 default 처리 (실제 스키마는 number 필수, default 없음 — 확인)
 *
 * 라우트 분기 미러 (route.ts:55-134):
 *   1. !codename → 400
 *   2. type !== AGENT|NPC → 400
 *   3. !loreSheetSchema.safeParse(body.lore).success → 400
 *   4. type==='AGENT' && !playSheetSchema.safeParse(body.play).success → 400
 *   5. type==='NPC' && body.play !== undefined → 400 (BLOCKING #ASK-D)
 *
 * 실행:
 *   cd StarGateV2 && node --test app/api/erp/characters/__tests__/post-validation.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const sharedDbRoot = new URL(
  "../../../../../../packages/shared-db/dist/",
  import.meta.url,
);
const { loreSheetSchema, playSheetSchema } = await import(
  new URL("schemas/npc.schema.js", sharedDbRoot).href
);

/**
 * POST 라우트 분기 미러.
 * 입력: body 객체 + session.user.role
 * 출력: { status, error?, payload? }
 */
function decidePostResponse(body, role = "V") {
  // 1. session 인증 (생략 — 테스트 입력은 인증 가정)
  // 2. role check
  const ROLE_RANK = { GM: 100, V: 90, A: 80, M: 70, H: 60, G: 50, J: 40, U: 30 };
  if (ROLE_RANK[role] < ROLE_RANK.V) {
    return { status: 403, error: "Forbidden" };
  }

  // 3. codename
  if (!body.codename || !body.codename.trim()) {
    return { status: 400, error: "codename은 필수입니다." };
  }
  if (!/^[A-Z0-9_]+$/.test(body.codename)) {
    return { status: 400, error: "codename 형식 오류" };
  }
  if (body.type !== "AGENT" && body.type !== "NPC") {
    return { status: 400, error: "type은 AGENT 또는 NPC여야 합니다." };
  }

  // 4. lore validation
  const loreResult = loreSheetSchema.safeParse(body.lore);
  if (!loreResult.success) {
    return { status: 400, error: "lore sub-document가 유효하지 않습니다." };
  }

  const payload = { ...body, lore: loreResult.data };

  // 5. play validation 분기
  if (body.type === "AGENT") {
    const playResult = playSheetSchema.safeParse(body.play);
    if (!playResult.success) {
      return {
        status: 400,
        error: "AGENT 생성에는 유효한 play sub-document가 필요합니다.",
      };
    }
    payload.play = playResult.data;
  } else if (body.play !== undefined) {
    return {
      status: 400,
      error: "NPC 생성 payload에는 play sub-document를 포함할 수 없습니다.",
    };
  } else {
    delete payload.play;
  }

  return { status: 201, payload };
}

/* ── helpers ── */

function validLore() {
  return {
    name: "Test",
    gender: "male",
    age: "30",
    height: "180",
    weight: "75",
    appearance: "x",
    personality: "y",
    background: "z",
    quote: "Q",
    mainImage: "/m.png",
  };
}

function validPlay() {
  return {
    className: "Op",
    hp: 80,
    hpDelta: 0,
    san: 60,
    sanDelta: 0,
    def: 5,
    defDelta: 0,
    atk: 7,
    atkDelta: 0,
    weaponTraining: [],
    skillTraining: [],
    credit: "0",
    equipment: [],
    abilities: [],
  };
}

/* ── E-1: AGENT + lore 누락 ── */

test("E-1: AGENT body + lore 누락 → 400 lore 검증 실패", () => {
  const res = decidePostResponse({
    codename: "AGENT_X",
    type: "AGENT",
    play: validPlay(),
  });
  assert.equal(res.status, 400);
  assert.match(res.error, /lore/);
});

/* ── E-2: AGENT + play 누락 ── */

test("E-2: AGENT body + play 누락 → 400 play 검증 실패", () => {
  const res = decidePostResponse({
    codename: "AGENT_X",
    type: "AGENT",
    lore: validLore(),
  });
  assert.equal(res.status, 400);
  assert.match(res.error, /play/);
});

/* ── E-3: NPC + play 포함 ── */

test("E-3: NPC body + play 포함 → 400 (NPC 는 play 없음)", () => {
  const res = decidePostResponse({
    codename: "NPC_X",
    type: "NPC",
    lore: validLore(),
    play: validPlay(),
  });
  assert.equal(res.status, 400);
  assert.match(res.error, /NPC.*play/);
});

/* ── E-4: AGENT + lore.weight 누락 ── */

test("E-4: AGENT + lore.weight 누락 → 400", () => {
  const lore = validLore();
  delete lore.weight;
  const res = decidePostResponse({
    codename: "AGENT_X",
    type: "AGENT",
    lore,
    play: validPlay(),
  });
  assert.equal(res.status, 400);
  assert.match(res.error, /lore/);
});

/* ── E-5: PlaySheet delta 4종 — default 0 적용 ── */

test("E-5: PlaySheet delta 4종 (hpDelta/sanDelta/defDelta/atkDelta) 누락 → default 0 통과", () => {
  // schema 가 .default(0) 이므로 누락 시 0 으로 채워져 통과.
  const playMissingDelta = {
    className: "Op",
    hp: 80,
    san: 60,
    def: 5,
    atk: 7,
    weaponTraining: [],
    skillTraining: [],
    credit: "0",
    equipment: [],
    abilities: [],
    // hpDelta/sanDelta/defDelta/atkDelta 누락
  };
  const result = playSheetSchema.safeParse(playMissingDelta);
  assert.equal(
    result.success,
    true,
    "delta 누락 → schema 가 default 0 적용",
  );
  assert.equal(result.data.hpDelta, 0);
  assert.equal(result.data.sanDelta, 0);
  assert.equal(result.data.defDelta, 0);
  assert.equal(result.data.atkDelta, 0);
});

test("E-5b: PlaySheet delta 0 명시 → 통과 (명시값 보존)", () => {
  const result = playSheetSchema.safeParse(validPlay());
  assert.equal(result.success, true);
  assert.equal(result.data.hpDelta, 0);
});

test("E-5c: PlaySheet delta 명시값 (0이 아닌) → 보존", () => {
  const play = validPlay();
  play.hpDelta = -10;
  play.sanDelta = 5;
  const result = playSheetSchema.safeParse(play);
  assert.equal(result.success, true);
  assert.equal(result.data.hpDelta, -10);
  assert.equal(result.data.sanDelta, 5);
});

/* ── E-6: NPC + play 부재 → 정상 201 ── */

test("E-6: NPC body + play 부재 → 201 정상", () => {
  const res = decidePostResponse({
    codename: "NPC_X",
    type: "NPC",
    lore: validLore(),
  });
  assert.equal(res.status, 201);
  assert.equal(res.payload.play, undefined, "NPC payload 에 play 미포함");
});

/* ── E-7: AGENT + 정상 → 201 ── */

test("E-7: AGENT + 정상 lore + 정상 play → 201", () => {
  const res = decidePostResponse({
    codename: "AGENT_X",
    type: "AGENT",
    lore: validLore(),
    play: validPlay(),
    role: "operative",
    previewImage: "/p.png",
    isPublic: true,
    ownerId: null,
  });
  assert.equal(res.status, 201);
  assert.ok(res.payload.lore);
  assert.ok(res.payload.play);
});

/* ── E-8: 권한 부족 (M) → 403 ── */

test("E-8: M 권한 (V 미달) → 403", () => {
  const res = decidePostResponse(
    {
      codename: "AGENT_X",
      type: "AGENT",
      lore: validLore(),
      play: validPlay(),
    },
    "M",
  );
  assert.equal(res.status, 403);
});

/* ── E-9: AGENT + lore.posterImage 옵션 — 부재 OK ── */

test("E-9: lore.posterImage optional — 부재해도 통과", () => {
  const lore = validLore(); // posterImage 부재
  const result = loreSheetSchema.safeParse(lore);
  assert.equal(result.success, true);
});

/* ── E-10: codename 정규식 — 소문자 거부 ── */

test("E-10: codename 소문자 → 400", () => {
  const res = decidePostResponse({
    codename: "agent_x",
    type: "AGENT",
    lore: validLore(),
    play: validPlay(),
  });
  assert.equal(res.status, 400);
});

/* ── E-11: NPC + play 가 빈 객체여도 거부 ── */

test("E-11: NPC + body.play={} → 400 (undefined 아닌 모든 값 거부)", () => {
  const res = decidePostResponse({
    codename: "NPC_X",
    type: "NPC",
    lore: validLore(),
    play: {},
  });
  assert.equal(res.status, 400);
  assert.match(res.error, /NPC.*play/);
});

/* ── E-12: AGENT + abilities 7-슬롯 검증 ── */

test("E-12: AGENT play.abilities — 빈 배열도 통과 (스키마는 길이 강제 안 함)", () => {
  const result = playSheetSchema.safeParse(validPlay());
  assert.equal(result.success, true, "스키마는 abilities.length 강제 X (마이그레이션이 7로 보정)");
});

test("E-12b: AGENT play.abilities[i].slot enum — 잘못된 slot 거부", () => {
  const play = validPlay();
  play.abilities = [{ slot: "X9", name: "evil" }];
  const result = playSheetSchema.safeParse(play);
  assert.equal(result.success, false, "C1/C2/C3/P/A1/A2/A3 외 slot 거부");
});
