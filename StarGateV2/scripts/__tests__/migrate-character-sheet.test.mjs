/**
 * Validator 검증 — 마이그레이션 스크립트 planForDoc / validateDoc idempotency
 *
 * 영역 B 시나리오 (1~8) + 추가 boundary 케이스:
 *   1. Fresh 도큐먼트 (sheet 만, lore/play 없음) → update 액션
 *   2. 재실행 (lore O / sheet X / 메타 잔존 X) → skip
 *   3. 부분 마이그레이션 (lore O / sheet O) → cleanup-sheet
 *   4. case 1 + root 메타 잔존 → cleanup-sheet (Review-Fix #5 보강)
 *   5. AGENT abilities 7개 초과 → 잘리며 warning
 *   6. AGENT weaponTraining/skillTraining 이미 string[] → 재변환 안 함
 *   7. NPC sheet.weight 부재 → lore.weight = ""
 *   8. AGENT abilities 일부 slot 누락 → 인덱스 매핑
 *
 * Idempotency invariant: 두 번째 plan 은 'skip' 또는 'cleanup' 만 발생.
 *
 * 실행:
 *   cd StarGateV2 && node --experimental-strip-types --test scripts/__tests__/migrate-character-sheet.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { planForDoc, validateDoc } from "../migrate-character-sheet-to-lore-play.ts";

/* ── helpers ── */

const baseAgentSheet = {
  name: "Agent Test",
  gender: "male",
  age: "30",
  height: "180",
  weight: "75",
  appearance: "갈색 머리",
  personality: "냉정",
  background: "전직 군인",
  quote: "임무 완수.",
  mainImage: "/main.png",
  className: "Operative",
  hp: 80,
  san: 60,
  def: 5,
  atk: 7,
  credit: "1000",
  abilityType: "강화",
  weaponTraining: "권총, 단검",
  skillTraining: "스텔스, 잠입",
  equipment: [{ name: "권총", price: "100" }],
  abilities: [
    { name: "사격", code: "S1", description: "권총 사격" },
    { name: "은신", code: "S2", description: "은밀 행동" },
  ],
};

const baseNpcSheet = {
  name: "NPC Test",
  gender: "female",
  age: "40",
  height: "165",
  appearance: "청바지",
  personality: "온화",
  background: "민간인",
  quote: "...",
  mainImage: "/npc.png",
  nameNative: "村山真理",
  nickname: "마리",
  nameEn: "Mari Murayama",
  roleDetail: "민간 협력자",
  notes: "P-3 등급",
};

function freshAgent() {
  return {
    _id: "agent-1",
    codename: "AGENT_001",
    type: "AGENT",
    sheet: { ...baseAgentSheet },
  };
}

function freshNpc() {
  return {
    _id: "npc-1",
    codename: "NPC_001",
    type: "NPC",
    sheet: { ...baseNpcSheet },
  };
}

/* ── B-1: Fresh AGENT 1회차 ── */

test("B-1: Fresh AGENT 1회차 — update 액션 + lore/play 모두 set", () => {
  const plan = planForDoc(freshAgent());
  assert.match(plan.action, /update/);
  assert.ok(plan.setPayload?.lore, "setPayload.lore 누락");
  assert.ok(plan.setPayload?.play, "setPayload.play 누락 (AGENT)");

  const lore = plan.setPayload.lore;
  assert.equal(lore.name, "Agent Test");
  assert.equal(lore.weight, "75", "AGENT weight 가 lore 로 이동되어야 함");
  assert.equal(lore.appearance, "갈색 머리");

  const play = plan.setPayload.play;
  assert.equal(play.hp, 80);
  assert.equal(play.hpDelta, 0, "delta 4종 default 0");
  assert.equal(play.sanDelta, 0);
  assert.equal(play.defDelta, 0);
  assert.equal(play.atkDelta, 0);
  assert.deepEqual(
    play.weaponTraining,
    ["권총", "단검"],
    "weaponTraining string → string[] 변환",
  );
  assert.deepEqual(play.skillTraining, ["스텔스", "잠입"]);
  assert.equal(
    play.abilities.length,
    7,
    "7-슬롯 자동 보정",
  );
  // slot 자동 매핑
  assert.equal(play.abilities[0].slot, "C1");
  assert.equal(play.abilities[1].slot, "C2");
  assert.equal(play.abilities[6].slot, "A3");

  assert.deepEqual(plan.unsetKeys, ["sheet"]);
});

/* ── B-2: 이미 마이그레이션됨 (lore O / sheet X / 메타 X) ── */

test("B-2: 재실행 — lore O + sheet X + root 메타 X → skip", () => {
  const doc = {
    _id: "agent-1",
    codename: "AGENT_001",
    type: "AGENT",
    lore: {
      name: "Agent Test",
      gender: "male",
      age: "30",
      height: "180",
      weight: "75",
      appearance: "갈색",
      personality: "냉정",
      background: "전직",
      quote: "Q",
      mainImage: "/m.png",
    },
    play: {
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
    },
  };
  const plan = planForDoc(doc);
  assert.match(plan.action, /skip/, `예상 skip, 실제 ${plan.action}`);
  assert.equal(plan.setPayload, undefined);
  assert.equal(
    plan.unsetKeys === undefined || plan.unsetKeys.length === 0,
    true,
    "skip 시 unsetKeys 비어 있어야 함",
  );
});

/* ── B-3: 부분 마이그레이션 (lore O / sheet O) → cleanup-sheet ── */

test("B-3: 부분 마이그레이션 — lore O + sheet O → cleanup-sheet", () => {
  const doc = {
    _id: "agent-1",
    codename: "AGENT_001",
    type: "AGENT",
    lore: {
      name: "Already",
      gender: "m",
      age: "30",
      height: "180",
      weight: "75",
      appearance: "x",
      personality: "y",
      background: "z",
      quote: "Q",
      mainImage: "/m.png",
    },
    sheet: { ...baseAgentSheet, name: "OldStale" },
  };
  const plan = planForDoc(doc);
  assert.match(plan.action, /cleanup-sheet/);
  assert.ok(plan.unsetKeys?.includes("sheet"), "sheet $unset 필요");
});

/* ── B-4: case 1 + root 메타 잔존 → cleanup-sheet ── */

test("B-4: lore O + sheet X + root.loreTags/appearsInEvents 잔존 → cleanup-sheet", () => {
  const doc = {
    _id: "npc-1",
    codename: "NPC_001",
    type: "NPC",
    lore: {
      name: "Migrated",
      gender: "f",
      age: "40",
      height: "165",
      weight: "55",
      appearance: "x",
      personality: "y",
      background: "z",
      quote: "Q",
      mainImage: "/m.png",
    },
    loreTags: ["행정"],
    appearsInEvents: ["2025-Q1"],
  };
  const plan = planForDoc(doc);
  assert.match(plan.action, /cleanup-sheet/, "root 메타 잔존 시 cleanup 필요");
  assert.ok(plan.unsetKeys?.includes("loreTags"));
  assert.ok(plan.unsetKeys?.includes("appearsInEvents"));
  assert.ok(
    !plan.unsetKeys.includes("sheet"),
    "sheet 가 이미 없으면 sheet 는 unset 대상 아님",
  );
});

/* ── B-5: AGENT abilities 7개 초과 → warning + 잘림 ── */

test("B-5: AGENT abilities 9개 → 7개로 절단 + warning", () => {
  const doc = freshAgent();
  doc.sheet.abilities = Array.from({ length: 9 }, (_, i) => ({
    name: `ability-${i}`,
    code: `C${i}`,
  }));
  const plan = planForDoc(doc);
  const play = plan.setPayload.play;
  assert.equal(play.abilities.length, 7);
  assert.ok(plan.warnings && plan.warnings.length > 0, "warning 발생해야 함");
  assert.match(plan.warnings[0], /길이 9.*무시/);
});

/* ── B-6: AGENT weaponTraining/skillTraining 이미 string[] → 재변환 안 함 ── */

test("B-6: weaponTraining 이미 string[] → 그대로 유지", () => {
  const doc = freshAgent();
  doc.sheet.weaponTraining = ["권총", "산탄총"];
  doc.sheet.skillTraining = ["은신"];
  const plan = planForDoc(doc);
  const play = plan.setPayload.play;
  assert.deepEqual(play.weaponTraining, ["권총", "산탄총"]);
  assert.deepEqual(play.skillTraining, ["은신"]);
});

/* ── B-7: NPC sheet.weight 부재 → lore.weight = "" ── */

test("B-7: NPC sheet.weight 부재 → lore.weight = ''", () => {
  const doc = freshNpc();
  // baseNpcSheet 에는 weight 부재
  const plan = planForDoc(doc);
  const lore = plan.setPayload.lore;
  assert.equal(lore.weight, "", "weight 미정의 시 빈 문자열 fallback");
  assert.equal(plan.setPayload.play, undefined, "NPC 는 play 빌드 안 됨");
});

/* ── B-8: AGENT abilities 일부 slot 누락 → 인덱스 매핑 ── */

test("B-8: abilities 혼재 slot — 빈 slot 은 인덱스 매핑, 명시 slot 은 보존", () => {
  const doc = freshAgent();
  doc.sheet.abilities = [
    { slot: "C1", name: "사격" },
    { name: "은신" }, // slot 누락
    { slot: "A1", name: "치료" },
  ];
  const plan = planForDoc(doc);
  const play = plan.setPayload.play;
  // 현재 코드: src.slot 이 있으면 보존, 없으면 인덱스 fallback (혼합)
  assert.equal(play.abilities.length, 7);
  assert.equal(play.abilities[0].slot, "C1", "index 0 → src.slot=C1 보존");
  assert.equal(
    play.abilities[1].slot,
    "C2",
    "index 1 → src.slot 누락 → fallback C2",
  );
  // ⚠ 정합성 결함: src.slot=A1 이 보존되어 index 4 의 fallback A1 과 충돌 가능
  // (현재 동작 그대로 검증, 결함은 발견사항에 기록)
  assert.equal(
    play.abilities[2].slot,
    "A1",
    "index 2 → src.slot=A1 보존 (현재 동작)",
  );
  assert.equal(play.abilities[3].name, "");
  assert.equal(play.abilities[6].slot, "A3");

  // ⚠ slot 중복 가능 — index 2(보존된 A1) ↔ index 4(fallback A1) 가 동일 slot
  const slots = play.abilities.map((a) => a.slot);
  const slotSet = new Set(slots);
  // 결함 명시: 길이 7 인데 unique slot 개수가 7 미만이면 중복 발생
  if (slotSet.size < 7) {
    console.warn(
      `⚠ MIGRATE-DEFECT: slot 중복 — slots=${slots.join(",")}; AGENT abilities 의 invariant 위반 가능 (validateDoc 은 slot 미정의만 검사, 중복은 미검사)`,
    );
  }
});

/* ── B-Idempotency: 두 번째 plan 은 cleanup 또는 skip ── */

test("B-IDEM-1: Fresh AGENT → 1회차 update → 마이그레이션 결과 적용 → 2회차 skip", () => {
  const doc = freshAgent();
  const plan1 = planForDoc(doc);
  assert.match(plan1.action, /update/);

  // 시뮬레이션: $set + $unset 적용
  const migrated = {
    _id: doc._id,
    codename: doc.codename,
    type: doc.type,
    lore: plan1.setPayload.lore,
    play: plan1.setPayload.play,
    // sheet 제거 (unsetKeys 의 sheet)
  };
  const plan2 = planForDoc(migrated);
  assert.match(plan2.action, /skip/, `2회차는 skip 이어야 함, 실제: ${plan2.action}`);
});

test("B-IDEM-2: Fresh NPC + loreTags → 1회차 update → 2회차 skip", () => {
  const doc = freshNpc();
  doc.loreTags = ["행정"];
  doc.appearsInEvents = ["2025-Q1"];
  const plan1 = planForDoc(doc);
  assert.match(plan1.action, /update/);
  // unsetKeys 가 sheet + loreTags + appearsInEvents 포함
  assert.ok(plan1.unsetKeys.includes("sheet"));
  assert.ok(plan1.unsetKeys.includes("loreTags"));

  const migrated = {
    _id: doc._id,
    codename: doc.codename,
    type: doc.type,
    lore: plan1.setPayload.lore,
    // sheet/loreTags/appearsInEvents 모두 제거됨
  };
  const plan2 = planForDoc(migrated);
  assert.match(plan2.action, /skip/);
});

test("B-IDEM-3: 3회차 — 이미 skip 상태에서 다시 plan 해도 변화 없음", () => {
  const doc = {
    _id: "agent-1",
    codename: "AGENT_001",
    type: "AGENT",
    lore: {
      name: "Stable",
      gender: "m",
      age: "30",
      height: "180",
      weight: "75",
      appearance: "x",
      personality: "y",
      background: "z",
      quote: "Q",
      mainImage: "/m.png",
    },
    play: {
      className: "C",
      hp: 0,
      hpDelta: 0,
      san: 0,
      sanDelta: 0,
      def: 0,
      defDelta: 0,
      atk: 0,
      atkDelta: 0,
      weaponTraining: [],
      skillTraining: [],
      credit: "0",
      equipment: [],
      abilities: [],
    },
  };
  const plan = planForDoc(doc);
  assert.match(plan.action, /skip/);
  // 한 번 더
  const plan2 = planForDoc(doc);
  assert.match(plan2.action, /skip/);
});

/* ── validateDoc 검증 ── */

test("VAL-1: AGENT lore + play 정상 → null (위반 없음)", () => {
  const doc = {
    codename: "X",
    type: "AGENT",
    lore: { weight: "75" },
    play: {
      weaponTraining: [],
      skillTraining: [],
      abilities: [{ slot: "C1", name: "" }],
    },
  };
  assert.equal(validateDoc(doc), null);
});

test("VAL-2: NPC + play 잔존 → 위반 'NPC 인데 play 필드 존재'", () => {
  const doc = {
    codename: "NPC_X",
    type: "NPC",
    lore: { weight: "" },
    play: { className: "X" },
  };
  const v = validateDoc(doc);
  assert.ok(v);
  assert.ok(v.reasons.some((r) => /NPC.*play/.test(r)));
});

test("VAL-3: AGENT abilities[i].slot 미정의 → 위반 보고", () => {
  const doc = {
    codename: "X",
    type: "AGENT",
    lore: { weight: "75" },
    play: {
      weaponTraining: [],
      skillTraining: [],
      abilities: [{ name: "no-slot" }],
    },
  };
  const v = validateDoc(doc);
  assert.ok(v);
  assert.ok(v.reasons.some((r) => /abilities\[0\]\.slot/.test(r)));
});

test("VAL-4: lore.weight 가 number → 위반 (string 강제)", () => {
  const doc = {
    codename: "X",
    type: "AGENT",
    lore: { weight: 75 },
    play: {
      weaponTraining: [],
      skillTraining: [],
      abilities: [{ slot: "C1", name: "" }],
    },
  };
  const v = validateDoc(doc);
  assert.ok(v);
  assert.ok(v.reasons.some((r) => /lore\.weight/.test(r)));
});

test("VAL-5: sheet 잔존 → 위반", () => {
  const doc = {
    codename: "X",
    type: "AGENT",
    sheet: {},
    lore: { weight: "75" },
    play: {
      weaponTraining: [],
      skillTraining: [],
      abilities: [{ slot: "C1", name: "" }],
    },
  };
  const v = validateDoc(doc);
  assert.ok(v);
  assert.ok(v.reasons.some((r) => /sheet/.test(r)));
});
