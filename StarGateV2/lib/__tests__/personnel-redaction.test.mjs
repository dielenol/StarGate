/**
 * Validator 검증 — personnel 마스킹 (영역 D)
 *
 * 시나리오:
 *   D-1: clearance G 미만 (J/U) → lore.name/nameNative/nickname/nameEn 마스킹
 *   D-2: clearance H 미만 (G/J/U) → lore.appearance/personality/background/quote 마스킹
 *   D-3: clearance M 미만 (H/G/J/U) → AGENT play 의 equipment/abilities 마스킹
 *   D-5: GM → 마스킹 없음 (모든 필드 보존)
 *   D-6: AGENT/NPC 양쪽에서 ownerId 가 V+ 만 노출되는지
 *
 * 추가 검증:
 *   D-7 (Strict #6): redactLore 가 원본에 부재한 optional 필드를 REDACTED 로 채우는 부작용
 *
 * 실행:
 *   cd StarGateV2 && node --experimental-strip-types --test lib/__tests__/personnel-redaction.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  filterCharacterByClearance,
  filterCharacterForList,
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

/* ── D-1: J/U 사용자 → identity 그룹 마스킹 ── */

test("D-1: clearance U → lore.name/nameNative/nickname/nameEn 모두 REDACTED", () => {
  const filtered = filterCharacterByClearance(agentChar(), "U");
  assert.equal(filtered.lore.name, REDACTED);
  assert.equal(filtered.lore.nameNative, REDACTED);
  assert.equal(filtered.lore.nickname, REDACTED);
  assert.equal(filtered.lore.nameEn, REDACTED);
  assert.equal(filtered.lore.gender, REDACTED);
  assert.equal(filtered.lore.age, REDACTED);
  assert.equal(filtered.lore.height, REDACTED);
  assert.equal(filtered.lore.weight, REDACTED);
  assert.equal(filtered.lore.mainImage, "", "이미지 마스킹은 빈 문자열");
});

test("D-1b: clearance J → identity 그룹 동일 마스킹", () => {
  const filtered = filterCharacterByClearance(agentChar(), "J");
  assert.equal(filtered.lore.name, REDACTED);
});

test("D-1c: clearance G → identity 노출 (G 가 cutoff)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "G");
  assert.equal(filtered.lore.name, "John", "G 는 identity 그룹 통과");
  // profile 그룹은 H 부터라 G 는 미달
  assert.equal(filtered.lore.appearance, REDACTED);
});

/* ── D-2: G/J/U → profile 그룹 마스킹 ── */

test("D-2: clearance G → appearance/personality/background/quote 마스킹 (profile 미달)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "G");
  assert.equal(filtered.lore.appearance, REDACTED);
  assert.equal(filtered.lore.personality, REDACTED);
  assert.equal(filtered.lore.background, REDACTED);
  assert.equal(filtered.lore.quote, REDACTED);
  assert.equal(filtered.lore.roleDetail, REDACTED);
  assert.equal(filtered.lore.notes, REDACTED);
});

test("D-2b: clearance H → profile 노출", () => {
  const filtered = filterCharacterByClearance(agentChar(), "H");
  assert.equal(filtered.lore.appearance, "tall");
  assert.equal(filtered.lore.background, "ex-soldier");
});

/* ── D-3: H/G/J/U → AGENT play 의 abilities/equipment 마스킹 ── */

test("D-3: clearance H → play.equipment/abilities/credit/abilityType 모두 마스킹 (abilities 미달)", () => {
  const filtered = filterCharacterByClearance(agentChar(), "H");
  assert.equal(filtered.play.abilityType, REDACTED);
  assert.equal(filtered.play.credit, REDACTED);
  assert.deepEqual(filtered.play.weaponTraining, []);
  assert.deepEqual(filtered.play.skillTraining, []);
  assert.deepEqual(filtered.play.equipment, []);
  assert.deepEqual(filtered.play.abilities, []);
  // combatStats 는 H 통과
  assert.equal(filtered.play.hp, 80);
});

test("D-3b: clearance M → play 모두 노출", () => {
  const filtered = filterCharacterByClearance(agentChar(), "M");
  assert.equal(filtered.play.abilityType, "강화");
  assert.equal(filtered.play.credit, "1000");
  assert.deepEqual(filtered.play.equipment, [{ name: "Pistol" }]);
});

test("D-3c: clearance G → combatStats(hp/san/def/atk/Delta) 모두 0 마스킹", () => {
  const filtered = filterCharacterByClearance(agentChar(), "G");
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
  // canIdentity=false 라도 원본 undefined 면 결과도 undefined.
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
  // 필수 필드는 그대로 REDACTED
  assert.equal(filtered.lore.name, REDACTED);
  assert.equal(filtered.lore.gender, REDACTED);
});

test("D-7b: 인증된 GM 사용자 — optional 필드 부재 시 undefined 유지", () => {
  const npcWithoutNative = npcChar();
  const filtered = filterCharacterByClearance(npcWithoutNative, "GM");
  // canIdentity=true 분기는 lore.nameNative 그대로 → undefined
  assert.equal(filtered.lore.nameNative, undefined);
  assert.equal(filtered.lore.nickname, undefined);
  assert.equal(filtered.lore.nameEn, undefined);
});

test("D-7c: 원본에 optional 값 존재 + clearance 미달 → REDACTED 마스킹", () => {
  // AGENT 는 nameNative/nickname/nameEn/roleDetail/notes 모두 채워둠
  const filtered = filterCharacterByClearance(agentChar(), "U");
  // 원본이 정의돼 있을 때만 REDACTED
  assert.equal(filtered.lore.nameNative, REDACTED);
  assert.equal(filtered.lore.nickname, REDACTED);
  assert.equal(filtered.lore.nameEn, REDACTED);
  assert.equal(filtered.lore.roleDetail, REDACTED);
  assert.equal(filtered.lore.notes, REDACTED);
  assert.equal(filtered.lore.posterImage, "");
});

test("D-7d: posterImage optional — 원본 부재 시 undefined, 존재 + 미달 시 빈 문자열", () => {
  // NPC 는 posterImage 부재
  const filteredNpc = filterCharacterByClearance(npcChar(), "U");
  assert.equal(filteredNpc.lore.posterImage, undefined, "원본 부재 → undefined");

  // AGENT 는 posterImage 존재
  const filteredAgent = filterCharacterByClearance(agentChar(), "U");
  assert.equal(filteredAgent.lore.posterImage, "", "원본 존재 + 미달 → 빈 문자열");
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

test("D-9b: filterCharacterForList — G 사용자(identity 통과): 원본 그대로 반환", () => {
  const original = agentChar();
  const filtered = filterCharacterForList(original, "G");
  // identity 통과 시 원본 그대로 returned (얕은 비교가 아닌 동일 reference)
  assert.equal(filtered, original, "identity 통과 시 동일 reference 반환");
});

/* ── D-10: clearance 등급 함수 ── */

test("D-10: getUserClearance — UserRole 그대로 반환 (Phase 2-A 일체화)", () => {
  assert.equal(getUserClearance("V"), "V");
  assert.equal(getUserClearance("U"), "U");
  assert.equal(getUserClearance("GM"), "GM");
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
