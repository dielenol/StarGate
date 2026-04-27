import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  npcDocSchema,
  npcFrontmatterSchema,
  loreSheetSchema,
  playSheetSchema,
} from "../../../dist/schemas/npc.schema.js";
import { toDbNpc } from "../../../dist/schemas/frontmatter.js";

const validLore = {
  name: "이름",
  nameEn: "Name",
  mainImage: "",
  quote: "q",
  gender: "",
  age: "",
  height: "",
  weight: "",
  appearance: "",
  personality: "",
  background: "",
};

test("loreSheetSchema: 필수 문자열 필드 검증", () => {
  assert.doesNotThrow(() => loreSheetSchema.parse(validLore));
  const missing = { ...validLore };
  delete missing.appearance;
  assert.throws(() => loreSheetSchema.parse(missing));
});

test("loreSheetSchema: 신규 옵션 필드 (nameNative, nickname, weight) 허용", () => {
  assert.doesNotThrow(() =>
    loreSheetSchema.parse({
      ...validLore,
      nameNative: "月城 葛葉",
      nickname: "쿠즈하",
      weight: "55kg",
    })
  );
});

test("playSheetSchema: AGENT play 필수 구조 검증", () => {
  assert.doesNotThrow(() =>
    playSheetSchema.parse({
      className: "관료",
      hp: 20,
      hpDelta: -30,
      san: 50,
      sanDelta: 0,
      def: 1,
      defDelta: 0,
      atk: 2,
      atkDelta: 0,
      abilityType: "",
      weaponTraining: [],
      skillTraining: ["설득"],
      credit: "0",
      equipment: [{ name: "권총", ammo: "5/5", grip: "한손" }],
      abilities: [
        { slot: "C1", name: "" },
        { slot: "C2", name: "" },
        { slot: "C3", name: "" },
        { slot: "P", name: "" },
        { slot: "A1", name: "" },
        { slot: "A2", name: "" },
        { slot: "A3", name: "" },
      ],
    })
  );

  assert.throws(() =>
    playSheetSchema.parse({
      className: "관료",
      hp: 20,
      hpDelta: 0,
      san: 50,
      sanDelta: 0,
      def: 1,
      defDelta: 0,
      atk: 2,
      atkDelta: 0,
      weaponTraining: "",
      skillTraining: [],
      credit: "0",
      equipment: [],
      abilities: [{ name: "slot 없음" }],
    })
  );
});

test("npcDocSchema: 최소 유효 NPC 문서", () => {
  const parsed = npcDocSchema.parse({
    codename: "REGISTRAR",
    type: "NPC",
    role: "비서",
    previewImage: "",
    isPublic: true,
    lore: validLore,
    ownerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal(parsed.codename, "REGISTRAR");
  assert.equal(parsed.ownerId, null);
});

test("npcDocSchema: type은 'NPC' 리터럴 고정", () => {
  assert.throws(() =>
    npcDocSchema.parse({
      codename: "FOO",
      type: "AGENT",
      role: "r",
      previewImage: "",
      isPublic: false,
      lore: validLore,
      ownerId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

test("npcDocSchema: previewImage 빈 문자열, 절대 URL, 서버 루트 상대경로 3종 허용", () => {
  const base = {
    codename: "FOO",
    type: "NPC",
    role: "r",
    isPublic: false,
    lore: validLore,
    ownerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 1) 절대 URL
  assert.doesNotThrow(() =>
    npcDocSchema.parse({
      ...base,
      previewImage: "https://example.com/a.png",
    })
  );

  // 2) 서버 루트 상대경로 (Next.js /public 전제)
  assert.doesNotThrow(() =>
    npcDocSchema.parse({
      ...base,
      previewImage: "/assets/peoples/Towaski-profile.png",
    })
  );

  // 3) 빈 문자열
  assert.doesNotThrow(() =>
    npcDocSchema.parse({
      ...base,
      previewImage: "",
    })
  );

  // 실패: '/'로 시작하지 않는 일반 문자열
  assert.throws(() =>
    npcDocSchema.parse({
      ...base,
      previewImage: "not-a-url",
    })
  );

  // 실패: 상대경로("./foo" 같은)는 루트 상대만 허용하므로 거부
  assert.throws(() =>
    npcDocSchema.parse({
      ...base,
      previewImage: "./assets/x.png",
    })
  );
});

test("npcDocSchema: ownerId null 허용, undefined 거부", () => {
  assert.doesNotThrow(() =>
    npcDocSchema.parse({
      codename: "FOO",
      type: "NPC",
      role: "r",
      previewImage: "",
      isPublic: false,
      lore: validLore,
      ownerId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
  assert.throws(() =>
    npcDocSchema.parse({
      codename: "FOO",
      type: "NPC",
      role: "r",
      previewImage: "",
      isPublic: false,
      lore: validLore,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

test("npcFrontmatterSchema: age/height는 string", () => {
  assert.doesNotThrow(() =>
    npcFrontmatterSchema.parse({
      codename: "FOO",
      type: "NPC",
      role: "r",
      nameKo: "이름",
      age: "32세",
      height: "168cm",
      isPublic: true,
    })
  );
  // parseFrontmatter는 숫자만 든 age를 number로 coerce 하므로 실패 시나리오
  assert.throws(() =>
    npcFrontmatterSchema.parse({
      codename: "FOO",
      type: "NPC",
      role: "r",
      nameKo: "이름",
      age: 32,
      isPublic: true,
    })
  );
});

test("toDbNpc: body 섹션 → lore 주입, 누락 섹션은 빈 문자열", () => {
  const doc = toDbNpc(
    {
      codename: "REGISTRAR",
      type: "NPC",
      role: "비서",
      nameKo: "아그네타",
      nameEn: "Agneta",
      isPublic: true,
      loreTags: ["행정"],
    },
    {
      quote: "q",
      appearance: "a",
      // personality / background / roleDetail / notes 누락
    }
  );
  assert.equal(doc.lore.quote, "q");
  assert.equal(doc.lore.appearance, "a");
  assert.equal(doc.lore.personality, ""); // 기본값
  assert.equal(doc.lore.background, "");
  assert.equal(doc.lore.name, "아그네타");
  assert.equal(doc.lore.nameEn, "Agneta");
  assert.deepEqual(doc.lore.loreTags, ["행정"]);
  assert.equal(doc.ownerId, null);
});

test("toDbNpc: nameNative / nickname / weight frontmatter → lore 매핑", () => {
  const doc = toDbNpc(
    {
      codename: "FOO",
      type: "NPC",
      role: "r",
      nameKo: "츠키시로 쿠즈하",
      nameNative: "月城 葛葉",
      nickname: "쿠즈하",
      weight: "55kg",
      isPublic: true,
    },
    {}
  );
  assert.equal(doc.lore.name, "츠키시로 쿠즈하");
  assert.equal(doc.lore.nameNative, "月城 葛葉");
  assert.equal(doc.lore.nickname, "쿠즈하");
  assert.equal(doc.lore.weight, "55kg");
});

test("toDbNpc: isPublic 누락 시 throw", () => {
  assert.throws(() =>
    toDbNpc(
      {
        codename: "X",
        type: "NPC",
        role: "r",
        nameKo: "이름",
      },
      {}
    )
  );
});
