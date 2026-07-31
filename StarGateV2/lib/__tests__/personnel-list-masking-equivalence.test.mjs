/**
 * Validator 검증 — Phase 2 P1: 목록/참조 projection 마스킹 등가성
 *
 * `filterCharacterForList`(CharacterListItem) / `filterCharacterForLoreLinks`(CharacterRef)가
 * 기존 full 경로(`filterCharacterByClearance` → redactLore 게이트)와 **등급 × 필드 ×
 * clearanceOverrides 전 조합**에서 동일한 마스킹 결과를 내는지 검증한다.
 *
 * 핵심 계약:
 *   E-1: 등급(U~GM) × override 시나리오 × 캐릭터 변형 전 조합에서
 *        list 6필드(name/nameNative/nickname/nameEn/loreTags/mainImage)가
 *        full 경로 결과와 값·presence 모두 동일
 *   E-2: 동일 매트릭스에서 ref 5필드(name/nameNative/nickname/nameEn/appearsInEvents) 동일
 *   E-3: "기존(full 경로)에 가려지던 값이 새 경로에서 원본으로 보이는" 케이스 0 (직접 계수)
 *   E-4: optional 필드 부재 시 결과도 부재 (검색 oracle 누출 방지) — 양 경로 presence 일치
 *   E-5: 입력 불변 (원본 mutation 없음)
 *   E-6: clearanceOverrides/식별 top-level 필드는 양 경로 모두 passthrough
 *
 * 실행:
 *   cd StarGateV2 && node --test lib/__tests__/personnel-list-masking-equivalence.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  filterCharacterByClearance,
  filterCharacterForList,
  filterCharacterForLoreLinks,
} from "../personnel.ts";

const CLEARANCES = ["U", "J", "G", "H", "M", "A", "V", "GM"];

/**
 * MIRRORS packages/shared-db/src/crud/characters.ts listCharacterListItems() projection.
 * 여기가 어긋나면 프로덕션 projection 과 테스트가 함께 어긋난 것 — projection 변경 시 동기화.
 */
const LIST_TOP_FIELDS = [
  "_id",
  "codename",
  "type",
  "role",
  "agentLevel",
  "department",
  "factionCode",
  "institutionCode",
  "previewImage",
  "isPublic",
  "clearanceOverrides",
];
const LIST_LORE_FIELDS = [
  "name",
  "nameNative",
  "nickname",
  "nameEn",
  "loreTags",
  "mainImage",
];

/** MIRRORS listCharacterRefs() projection. */
const REF_TOP_FIELDS = [
  "_id",
  "codename",
  "type",
  "role",
  "agentLevel",
  "department",
  "factionCode",
  "institutionCode",
  "isPublic",
  "clearanceOverrides",
];
const REF_LORE_FIELDS = [
  "name",
  "nameNative",
  "nickname",
  "nameEn",
  "appearsInEvents",
];

/** Mongo projection 시뮬레이터 — 존재하는 필드만 복사 (부재 필드는 결과에서도 부재). */
function projectDoc(doc, topFields, loreFields) {
  const out = {};
  for (const f of topFields) {
    if (doc[f] !== undefined) out[f] = doc[f];
  }
  const lore = {};
  for (const f of loreFields) {
    if (doc.lore?.[f] !== undefined) lore[f] = doc.lore[f];
  }
  out.lore = lore;
  return out;
}

function agentChar(overrides = {}, loreOverrides = {}) {
  return {
    _id: "obj-agent-1",
    codename: "AGENT_001",
    type: "AGENT",
    role: "operative",
    agentLevel: "G",
    department: "MANUS",
    factionCode: "NOVUS_ORDO",
    institutionCode: "MANUS",
    previewImage: "/preview.png",
    ownerId: "owner-1",
    isPublic: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    lore: {
      name: "김철수",
      nameNative: "金鐵洙",
      nickname: "스틸",
      nameEn: "Kim Cheolsu",
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
      roleDetail: "field op",
      notes: "trusted",
      loreTags: ["잠입", "저격"],
      appearsInEvents: ["S1E5", "NOSB-S1E2"],
      relations: [{ target: "NPC_001", relation: "ally" }],
      sessionAppearances: ["S1E5"],
      ...loreOverrides,
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
      points: 3,
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

function npcChar(overrides = {}, loreOverrides = {}) {
  return {
    _id: "obj-npc-1",
    codename: "NPC_001",
    type: "NPC",
    role: "civilian",
    previewImage: "/n-preview.png",
    ownerId: null,
    isPublic: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    lore: {
      name: "마리",
      gender: "female",
      age: "40",
      height: "165",
      weight: "55",
      appearance: "..",
      personality: "..",
      background: "..",
      quote: "..",
      mainImage: "/m2.png",
      loreTags: ["정보상"],
      ...loreOverrides,
    },
    ...overrides,
  };
}

/** [라벨, clearanceOverrides 값] — normalizeClearanceOverrides 경로 전체 커버. */
const OVERRIDE_SCENARIOS = [
  ["no-overrides", undefined],
  ["null-overrides", null],
  ["identity-up-V", { identity: "V" }],
  ["identity-up-GM", { identity: "GM" }],
  ["identity-down-U", { identity: "U" }],
  ["profile-up-GM", { profile: "GM" }],
  ["meta-down-U", { meta: "U" }],
  [
    "mixed-all-groups",
    { identity: "M", profile: "V", combatStats: "U", abilities: "U", meta: "U" },
  ],
  ["invalid-keys-values", { identity: "NOPE", bogus: "V", profile: "A" }],
];

/** [라벨, full 캐릭터 팩토리] — optional 부재/빈값/NPC 변형 포함. */
const CHARACTER_VARIANTS = [
  ["agent-full", (ov) => agentChar({ clearanceOverrides: ov })],
  [
    "agent-minimal-optionals",
    (ov) =>
      agentChar(
        { clearanceOverrides: ov },
        {
          nameNative: undefined,
          nickname: undefined,
          nameEn: undefined,
          loreTags: undefined,
          appearsInEvents: undefined,
          posterImage: undefined,
          roleDetail: undefined,
          notes: undefined,
        },
      ),
  ],
  [
    "agent-empty-values",
    (ov) =>
      agentChar(
        { clearanceOverrides: ov },
        { name: "", nickname: "", loreTags: [], appearsInEvents: [] },
      ),
  ],
  ["npc-with-tags", (ov) => npcChar({ clearanceOverrides: ov })],
  [
    "npc-legacy-no-mainimage",
    (ov) => npcChar({ clearanceOverrides: ov }, { mainImage: undefined }),
  ],
];

function assertFieldParity(newLore, oldLore, field, label, counters, rawLore) {
  assert.equal(
    Object.hasOwn(newLore, field),
    Object.hasOwn(oldLore, field),
    `${label} :: ${field} presence 불일치 (new=${Object.hasOwn(newLore, field)}, old=${Object.hasOwn(oldLore, field)})`,
  );
  assert.deepEqual(
    newLore[field],
    oldLore[field],
    `${label} :: ${field} 값 불일치 (new=${JSON.stringify(newLore[field])}, old=${JSON.stringify(oldLore[field])})`,
  );

  // E-3: full 경로가 가리는 값을 새 경로가 원본으로 노출하는지 직접 계수
  const raw = rawLore[field];
  const oldMasked =
    JSON.stringify(oldLore[field]) !== JSON.stringify(raw);
  const newShowsRaw =
    JSON.stringify(newLore[field]) === JSON.stringify(raw) && raw !== undefined;
  if (oldMasked && newShowsRaw) {
    counters.newlyVisible.push(`${label} :: ${field}`);
  }
  counters.checked += 1;
}

test("E-1/E-2/E-3: 등급×override×변형 전 매트릭스 — list/ref 마스킹이 full 경로와 동일", () => {
  const counters = { checked: 0, newlyVisible: [] };

  for (const [ovLabel, overrides] of OVERRIDE_SCENARIOS) {
    for (const [charLabel, makeChar] of CHARACTER_VARIANTS) {
      for (const clearance of CLEARANCES) {
        const label = `${charLabel} / ${ovLabel} / clearance=${clearance}`;

        // full 경로 (기준): redactLore 게이트
        const full = makeChar(overrides);
        const oldResult = filterCharacterByClearance(full, clearance);

        // 새 경로 1: list projection → filterCharacterForList
        const listItem = projectDoc(makeChar(overrides), LIST_TOP_FIELDS, LIST_LORE_FIELDS);
        const newList = filterCharacterForList(listItem, clearance);
        for (const field of LIST_LORE_FIELDS) {
          assertFieldParity(
            newList.lore,
            oldResult.lore,
            field,
            `[list] ${label}`,
            counters,
            full.lore,
          );
        }

        // 새 경로 2: ref projection → filterCharacterForLoreLinks
        const refItem = projectDoc(makeChar(overrides), REF_TOP_FIELDS, REF_LORE_FIELDS);
        const newRef = filterCharacterForLoreLinks(refItem, clearance);
        for (const field of REF_LORE_FIELDS) {
          assertFieldParity(
            newRef.lore,
            oldResult.lore,
            field,
            `[ref] ${label}`,
            counters,
            full.lore,
          );
        }

        // E-6: top-level passthrough (마스킹 대상 아님 — projection 결과 그대로)
        for (const f of LIST_TOP_FIELDS) {
          assert.deepEqual(
            newList[f],
            listItem[f],
            `[list] ${label} :: top-level ${f} 변형됨`,
          );
        }
        for (const f of REF_TOP_FIELDS) {
          assert.deepEqual(
            newRef[f],
            refItem[f],
            `[ref] ${label} :: top-level ${f} 변형됨`,
          );
        }
      }
    }
  }

  assert.ok(counters.checked > 0, "매트릭스가 비어 있음");
  assert.deepEqual(
    counters.newlyVisible,
    [],
    `기존에 가려지던 값이 새 경로에서 보이는 케이스 발견: ${counters.newlyVisible.join("; ")}`,
  );

  // 리포트용 요약 (테스트 출력에 매트릭스 규모 남김)
  console.log(
    `matrix checked: ${counters.checked} field-combos ` +
      `(${OVERRIDE_SCENARIOS.length} overrides × ${CHARACTER_VARIANTS.length} variants × ${CLEARANCES.length} clearances), newly-visible: 0`,
  );
});

test("E-4: optional 부재 필드는 양 경로 모두 결과에서 부재 (oracle 누출 방지)", () => {
  const full = agentChar(
    {},
    {
      nameNative: undefined,
      nickname: undefined,
      nameEn: undefined,
      loreTags: undefined,
      appearsInEvents: undefined,
    },
  );
  for (const clearance of ["U", "J", "G", "GM"]) {
    const old = filterCharacterByClearance(full, clearance);
    const listItem = projectDoc(full, LIST_TOP_FIELDS, LIST_LORE_FIELDS);
    const ref = projectDoc(full, REF_TOP_FIELDS, REF_LORE_FIELDS);
    const newList = filterCharacterForList(listItem, clearance);
    const newRef = filterCharacterForLoreLinks(ref, clearance);

    for (const f of ["nameNative", "nickname", "nameEn", "loreTags"]) {
      assert.equal(Object.hasOwn(old.lore, f), false, `full 경로 ${f} 부재`);
      assert.equal(Object.hasOwn(newList.lore, f), false, `list 경로 ${f} 부재 (clearance=${clearance})`);
    }
    for (const f of ["nameNative", "nickname", "nameEn", "appearsInEvents"]) {
      assert.equal(Object.hasOwn(newRef.lore, f), false, `ref 경로 ${f} 부재 (clearance=${clearance})`);
    }
  }
});

test("E-5: 입력 불변 — filterCharacterForList/ForLoreLinks 는 원본을 변형하지 않음", () => {
  const listItem = projectDoc(agentChar({ clearanceOverrides: { identity: "V" } }), LIST_TOP_FIELDS, LIST_LORE_FIELDS);
  const refItem = projectDoc(agentChar({ clearanceOverrides: { identity: "V" } }), REF_TOP_FIELDS, REF_LORE_FIELDS);
  const listSnapshot = JSON.stringify(listItem);
  const refSnapshot = JSON.stringify(refItem);

  filterCharacterForList(listItem, "U");
  filterCharacterForLoreLinks(refItem, "U");

  assert.equal(JSON.stringify(listItem), listSnapshot, "list 입력이 변형됨");
  assert.equal(JSON.stringify(refItem), refSnapshot, "ref 입력이 변형됨");
});

test("E-7: U 등급 절대 마스킹 보장 — full 경로와 무관하게 실명 3종은 REDACTED", () => {
  // full 경로와의 등가성만으로는 '양쪽이 함께 뚫리는' 회귀를 못 잡는다 —
  // 최저 등급의 절대 기준을 별도 고정.
  const listItem = projectDoc(agentChar(), LIST_TOP_FIELDS, LIST_LORE_FIELDS);
  const refItem = projectDoc(agentChar(), REF_TOP_FIELDS, REF_LORE_FIELDS);

  for (const clearance of ["U", "J"]) {
    const newList = filterCharacterForList(listItem, clearance);
    const newRef = filterCharacterForLoreLinks(refItem, clearance);
    for (const out of [newList.lore, newRef.lore]) {
      assert.equal(out.name, "[CLASSIFIED]", `clearance=${clearance} name`);
      assert.equal(out.nameNative, "[CLASSIFIED]", `clearance=${clearance} nameNative`);
      assert.equal(out.nameEn, "[CLASSIFIED]", `clearance=${clearance} nameEn`);
    }
    // nickname/mainImage 는 identity(U) 그룹 — 기본 정책에선 U 도 노출
    assert.equal(newList.lore.nickname, "스틸");
    assert.equal(newList.lore.mainImage, "/m.png");
  }

  // identity 상향 override 시 nickname/mainImage 도 잠김
  const gated = projectDoc(
    agentChar({ clearanceOverrides: { identity: "V" } }),
    LIST_TOP_FIELDS,
    LIST_LORE_FIELDS,
  );
  const gatedOut = filterCharacterForList(gated, "M");
  assert.equal(gatedOut.lore.nickname, "[CLASSIFIED]");
  assert.equal(gatedOut.lore.mainImage, "");
  assert.equal(gatedOut.lore.name, "[CLASSIFIED]");
});
