/**
 * Validator 검증 — personnel 마스킹 (영역 D)
 *
 * 시나리오 (2026-05 등급 재조정 + 실명 열람 정책 기준):
 *   D-1: 실명 그룹(name/nameNative/nameEn)은 G 미만 (J/U) → REDACTED.
 *        identity 그룹(nickname/gender/age/height/weight/이미지)은 최소 등급 U — 전원 노출
 *   D-2: profile 그룹(appearance/personality/background/quote/roleDetail/notes)은 J 미만 (U) → REDACTED
 *   D-3: AGENT play — combatStats 는 G 미만 (J/U) → 0, abilities 는 H 미만 (G/J/U) → 마스킹
 *   D-5: GM → 마스킹 없음 (모든 필드 보존)
 *   D-6: AGENT/NPC 양쪽에서 ownerId 가 V+ 만 노출되는지
 *
 * 추가 검증:
 *   D-7 (Strict #6): redactLore 가 원본에 부재한 optional 필드를 REDACTED 로 채우는 부작용
 *
 * 실행:
 *   cd StarGateV2 && node --test lib/__tests__/personnel-redaction.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  filterCharacterByClearance,
  filterCharacterForList,
  getLevelDisplayRank,
  getLevelDisplayTotal,
  getUserClearance,
} from "../personnel.ts";

const REDACTED = "[CLASSIFIED]";

function agentChar(overrides = {}) {
  return {
    _id: "obj-1",
    codename: "AGENT_001",
    type: "AGENT",
    role: "operative",
    previewImage: "/preview.png",
    ownerId: "owner-1",
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lore: {
      name: "John",
      nameNative: "ジョン",
      nickname: "JJ",
      gender: "male",
      age: "30",
      height: "180",
      weight: "75",
      appearance: "tall",
      personality: "calm",
      background: "ex-soldier",
      quote: "ready",
      mainImage: "/m.png",
      posterImage: "/p.png",
      nameEn: "John Doe",
      roleDetail: "field op",
      notes: "trusted",
    },
    play: {
      className: "Operative",
      hp: 80,
      hpDelta: -10,
      san: 60,
      sanDelta: 0,
      def: 5,
      defDelta: 0,
      atk: 7,
      atkDelta: 0,
      abilityType: "강화",
      weaponTraining: ["Pistol"],
      skillTraining: ["Stealth"],
      credit: "1000",
      equipment: [{ name: "Pistol" }],
      abilities: [{ slot: "C1", name: "Shoot" }],
    },
    ...overrides,
  };
}

function npcChar(overrides = {}) {
  return {
    _id: "obj-2",
    codename: "NPC_001",
    type: "NPC",
    role: "civilian",
    previewImage: "/n-preview.png",
    ownerId: null,
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lore: {
      name: "Mari",
      gender: "female",
      age: "40",
      height: "165",
      weight: "55",
      appearance: "..",
      personality: "..",
      background: "..",
      quote: "..",
      mainImage: "/m2.png",
    },
    ...overrides,
  };
}

/* ── D-1: 실명 그룹 — G 미만(J/U) 마스킹, identity 그룹은 U 부터 노출 ── */

test("D-1: clearance U → 실명(name/nameNative/nameEn)만 REDACTED, identity 그룹은 노출", () => {
  const filtered = filterCharacterByClearance(agentChar(), "U");
  assert.equal(filtered.lore.name, REDACTED);
  assert.equal(filtered.lore.nameNative, REDACTED);
  assert.equal(filtered.lore.nameEn, REDACTED);
  // identity 그룹은 최소 등급이 U 라 전원 노출 (nickname 은 실명 그룹이 아님)
  assert.equal(filtered.lore.nickname, "JJ");
  assert.equal(filtered.lore.gender, "male");
  assert.equal(filtered.lore.age, "30");
  assert.equal(filtered.lore.height, "180");
  assert.equal(filtered.lore.weight, "75");
  assert.equal(filtered.lore.mainImage, "/m.png");
});

test("D-1b: clearance J → 실명 동일 마스킹 (real-name 은 G 부터)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "J");
  assert.equal(filtered.lore.name, REDACTED);
});

test("D-1c: clearance G → 실명 노출 (G 가 real-name cutoff)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "G");
  assert.equal(filtered.lore.name, "John", "G 는 실명 통과");
  // profile 그룹은 J 부터라 G 도 통과
  assert.equal(filtered.lore.appearance, "tall");
});

/* ── D-2: U → profile 그룹 마스킹 (J 부터 노출) ── */

test("D-2: clearance U → appearance/personality/background/quote 마스킹 (profile 미달)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "U");
  assert.equal(filtered.lore.appearance, REDACTED);
  assert.equal(filtered.lore.personality, REDACTED);
  assert.equal(filtered.lore.background, REDACTED);
  assert.equal(filtered.lore.quote, REDACTED);
  assert.equal(filtered.lore.roleDetail, REDACTED);
  assert.equal(filtered.lore.notes, REDACTED);
});

test("D-2b: clearance J → profile 노출 (J 가 cutoff)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "J");
  assert.equal(filtered.lore.appearance, "tall");
  assert.equal(filtered.lore.background, "ex-soldier");
});

/* ── D-3: AGENT play — combatStats 는 G 미만 0, abilities 는 H 미만 마스킹 ── */

test("D-3: clearance G → play.equipment/abilities/credit/abilityType 모두 마스킹 (abilities 미달)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "G");
  assert.equal(filtered.play.abilityType, REDACTED);
  assert.equal(filtered.play.credit, REDACTED);
  assert.deepEqual(filtered.play.weaponTraining, []);
  assert.deepEqual(filtered.play.skillTraining, []);
  assert.deepEqual(filtered.play.equipment, []);
  assert.deepEqual(filtered.play.abilities, []);
  // combatStats 는 G 부터 통과
  assert.equal(filtered.play.hp, 80);
});

test("D-3b: clearance H → play 모두 노출 (H 가 abilities cutoff)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "H");
  assert.equal(filtered.play.abilityType, "강화");
  assert.equal(filtered.play.credit, "1000");
  assert.deepEqual(filtered.play.equipment, [{ name: "Pistol" }]);
});

test("D-3c: clearance J → combatStats(hp/san/def/atk/Delta) 모두 0 마스킹 (combatStats 미달)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "J");
  assert.equal(filtered.play.hp, 0);
  assert.equal(filtered.play.san, 0);
  assert.equal(filtered.play.def, 0);
  assert.equal(filtered.play.atk, 0);
  assert.equal(filtered.play.hpDelta, 0);
});

/* ── D-5: GM → 마스킹 없음 ── */

test("D-5: clearance GM → 모든 필드 원본 그대로", () => {
  const original = agentChar();
  const filtered = filterCharacterByClearance(original, "GM");
  assert.equal(filtered.lore.name, "John");
  assert.equal(filtered.lore.nameNative, "ジョン");
  assert.equal(filtered.lore.appearance, "tall");
  assert.equal(filtered.play.hp, 80);
  assert.equal(filtered.play.abilityType, "강화");
  assert.deepEqual(filtered.play.equipment, [{ name: "Pistol" }]);
});

/* ── D-6: ownerId — meta 그룹 (V+ 만 노출) ── */

test("D-6: clearance V → ownerId 노출, A → ownerId null", () => {
  const filteredV = filterCharacterByClearance(agentChar(), "V");
  assert.equal(filteredV.ownerId, "owner-1");
  const filteredA = filterCharacterByClearance(agentChar(), "A");
  assert.equal(
    filteredA.ownerId,
    null,
    "A 는 meta 그룹(V) 미달 — ownerId 마스킹",
  );
});

/* ── D-7 (Strict #6 fix 검증): optional 필드 부재 시 undefined 유지 ── */

test("D-7: redactLore — 원본 optional 필드 undefined 면 결과도 undefined (검색 oracle 차단)", () => {
  // NPC 처럼 nameNative 가 없는 캐릭터를 U 사용자가 봤을 때
  const npcWithoutNative = npcChar(); // nameNative/nickname/nameEn/roleDetail/notes 없음
  const filtered = filterCharacterByClearance(npcWithoutNative, "U");
  // 실명/profile 미달이라도 원본 undefined 면 결과도 undefined.
  // "[CLASSIFIED]" 채움이 사라져 "필드 자체 부재" 와 "마스킹됨" 이 구분된다.
  assert.equal(
    filtered.lore.nameNative,
    undefined,
    "원본 undefined → 결과 undefined (REDACTED 채움 금지)",
  );
  assert.equal(filtered.lore.nickname, undefined);
  assert.equal(filtered.lore.nameEn, undefined);
  assert.equal(filtered.lore.roleDetail, undefined);
  assert.equal(filtered.lore.notes, undefined);
  // 실명은 그대로 REDACTED (U < G), identity 그룹은 U 부터 노출
  assert.equal(filtered.lore.name, REDACTED);
  assert.equal(filtered.lore.gender, "female");
});

test("D-7b: 인증된 GM 사용자 — optional 필드 부재 시 undefined 유지", () => {
  const npcWithoutNative = npcChar();
  const filtered = filterCharacterByClearance(npcWithoutNative, "GM");
  // canRealName=true 분기는 lore.nameNative 그대로 → undefined
  assert.equal(filtered.lore.nameNative, undefined);
  assert.equal(filtered.lore.nickname, undefined);
  assert.equal(filtered.lore.nameEn, undefined);
});

test("D-7c: 원본에 optional 값 존재 + 그룹 미달 → REDACTED 마스킹", () => {
  // AGENT 는 nameNative/nickname/nameEn/roleDetail/notes 모두 채워둠
  const filtered = filterCharacterByClearance(agentChar(), "U");
  // 원본이 정의돼 있고 그룹 미달일 때만 REDACTED — 실명(G 미만)/profile(J 미만)
  assert.equal(filtered.lore.nameNative, REDACTED);
  assert.equal(filtered.lore.nameEn, REDACTED);
  assert.equal(filtered.lore.roleDetail, REDACTED);
  assert.equal(filtered.lore.notes, REDACTED);
  // identity 그룹(U 부터)에 속한 optional 은 노출
  assert.equal(filtered.lore.nickname, "JJ");
  assert.equal(filtered.lore.posterImage, "/p.png");
});

test("D-7d: posterImage optional — 부재 시 undefined, identity 노출 시 원본, override 미달 시 빈 문자열", () => {
  // NPC 는 posterImage 부재
  const filteredNpc = filterCharacterByClearance(npcChar(), "U");
  assert.equal(filteredNpc.lore.posterImage, undefined, "원본 부재 → undefined");

  // identity 기본 cutoff 가 U 라 default 정책에서는 전원에게 원본 경로 노출
  const filteredAgent = filterCharacterByClearance(agentChar(), "U");
  assert.equal(filteredAgent.lore.posterImage, "/p.png", "identity 노출 → 원본 경로");

  // 빈 문자열 마스킹 분기는 clearanceOverrides 로 identity 를 상향했을 때만 도달
  const overridden = filterCharacterByClearance(
    agentChar({ clearanceOverrides: { identity: "G" } }),
    "U",
  );
  assert.equal(overridden.lore.posterImage, "", "override 미달 → 빈 문자열");
  assert.equal(overridden.lore.mainImage, "", "mainImage 도 동일 규칙");
});

/* ── D-8: NPC 의 play 가 마스킹 결과에 절대 포함되지 않음 ── */

test("D-8: NPC 캐릭터 — filterCharacterByClearance 결과에 play 키 없음", () => {
  const filtered = filterCharacterByClearance(npcChar(), "U");
  assert.equal(
    "play" in filtered,
    false,
    "NPC 결과에 play 키 부재 (filterCharacterByClearance 분기 검증)",
  );
});

/* ── D-9: filterCharacterForList — name 만 마스킹 ── */

test("D-9: filterCharacterForList — U 사용자: name 만 REDACTED, 나머지 lore 원본", () => {
  const original = agentChar();
  const filtered = filterCharacterForList(original, "U");
  assert.equal(filtered.lore.name, REDACTED);
  // 나머지는 그대로 (목록용 가벼운 필터)
  assert.equal(filtered.lore.appearance, "tall");
  assert.equal(filtered.lore.background, "ex-soldier");
});

test("D-9b: filterCharacterForList — G 사용자(실명 통과): 원본 그대로 반환", () => {
  const original = agentChar();
  const filtered = filterCharacterForList(original, "G");
  // 실명 통과 시 원본 그대로 returned (얕은 비교가 아닌 동일 reference)
  assert.equal(filtered, original, "실명 통과 시 동일 reference 반환");
});

/* ── D-10: clearance 등급 함수 ── */

test("D-10: getUserClearance — UserRole 그대로 반환 (Phase 2-A 일체화)", () => {
  assert.equal(getUserClearance("V"), "V");
  assert.equal(getUserClearance("U"), "U");
  assert.equal(getUserClearance("GM"), "GM");
});

test("D-10b: display pips use V as full scale and GM as overflow", () => {
  assert.equal(getLevelDisplayTotal("V"), 6);
  assert.equal(getLevelDisplayRank("V"), 6);
  assert.equal(getLevelDisplayTotal("A"), 6);
  assert.equal(getLevelDisplayRank("A"), 5);
  assert.equal(getLevelDisplayTotal("GM"), 7);
  assert.equal(getLevelDisplayRank("GM"), 7);
});

/* ── D-11: 입력 객체 변경 안 함 (immutability) ── */

test("D-11: filterCharacterByClearance — 원본 변경 안 함", () => {
  const original = agentChar();
  const originalName = original.lore.name;
  filterCharacterByClearance(original, "U");
  assert.equal(
    original.lore.name,
    originalName,
    "원본 lore.name 이 변경되면 안 됨",
  );
});
