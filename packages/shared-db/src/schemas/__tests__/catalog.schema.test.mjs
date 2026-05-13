/**
 * Equipment / Consumable 카탈로그 스키마 + 어댑터 테스트.
 *
 * 검증 범위:
 *  - equipmentFrontmatterSchema / equipmentDocSchema / equipmentLoreSchema
 *  - consumableFrontmatterSchema / consumableDocSchema / consumableLoreSchema
 *  - toDbEquipment / toDbConsumable 어댑터 (description body 폴백, lore pickCatalogLore,
 *    previewImage undefined 보존, loreMd 빈-body → undefined, category 검증)
 *  - ITEM_CATEGORIES SSOT 정합 (Zod enum 값이 ITEM_CATEGORIES tuple 의 부분집합)
 *  - 카탈로그 round-trip: 템플릿 MD 의 frontmatter 가 스키마를 통과하는지
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFrontmatter, toDbEquipment, toDbConsumable } from "../../../dist/schemas/frontmatter.js";
import {
  equipmentDocSchema,
  equipmentFrontmatterSchema,
  equipmentLoreSchema,
} from "../../../dist/schemas/equipment.schema.js";
import {
  consumableDocSchema,
  consumableFrontmatterSchema,
  consumableLoreSchema,
} from "../../../dist/schemas/consumable.schema.js";
import { ITEM_CATEGORIES } from "../../../dist/types/inventory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(
  __dirname,
  "../../../../../StarGateV2/docs/spec/templates",
);

/* ── 공용 fixture ── */

const validEquipmentFm = {
  code: "STANDARD_PISTOL",
  slug: "standard-pistol",
  name: "표준 권총",
  nameEn: "Standard Pistol",
  category: "WEAPON",
  price: 1000,
  damage: "9mm / 단발",
  description: "표준 사이드암.",
  isAvailable: true,
  isPublic: true,
};

const validConsumableFm = {
  code: "HP_POTION_S",
  slug: "hp-potion-s",
  name: "소형 회복제",
  nameEn: "Small HP Potion",
  category: "CONSUMABLE",
  price: 500,
  effect: "HP +30",
  description: "기본 회복제.",
  isAvailable: true,
  isPublic: true,
};

/* ── ITEM_CATEGORIES SSOT 정합 ── */

test("CATALOG: ITEM_CATEGORIES SSOT — WEAPON/ARMOR/CONSUMABLE 모두 포함", () => {
  // equipment Zod enum 의 값들이 ITEM_CATEGORIES 의 부분집합
  for (const cat of ["WEAPON", "ARMOR"]) {
    assert.ok(
      ITEM_CATEGORIES.includes(cat),
      `ITEM_CATEGORIES SSOT에 ${cat} 가 누락됨 — equipment.schema 와 drift`,
    );
  }
  assert.ok(
    ITEM_CATEGORIES.includes("CONSUMABLE"),
    "ITEM_CATEGORIES SSOT에 CONSUMABLE 누락 — consumable.schema 와 drift",
  );
});

/* ── equipmentFrontmatterSchema ── */

test("equipmentFrontmatterSchema: 정상 frontmatter 통과", () => {
  assert.doesNotThrow(() =>
    equipmentFrontmatterSchema.parse(validEquipmentFm),
  );
});

test("equipmentFrontmatterSchema: description optional (body 폴백 시나리오)", () => {
  const { description: _omit, ...rest } = validEquipmentFm;
  assert.doesNotThrow(() => equipmentFrontmatterSchema.parse(rest));
});

test("equipmentFrontmatterSchema: category=CONSUMABLE 거부 (WEAPON/ARMOR 만 허용)", () => {
  assert.throws(() =>
    equipmentFrontmatterSchema.parse({
      ...validEquipmentFm,
      category: "CONSUMABLE",
    }),
  );
});

test("equipmentFrontmatterSchema: category=MATERIAL 거부", () => {
  assert.throws(() =>
    equipmentFrontmatterSchema.parse({
      ...validEquipmentFm,
      category: "MATERIAL",
    }),
  );
});

test("equipmentFrontmatterSchema: price 음수 거부", () => {
  assert.throws(() =>
    equipmentFrontmatterSchema.parse({ ...validEquipmentFm, price: -1 }),
  );
});

test("equipmentFrontmatterSchema: price 문자열 coerce", () => {
  const parsed = equipmentFrontmatterSchema.parse({
    ...validEquipmentFm,
    price: "1500",
  });
  assert.equal(parsed.price, 1500);
});

/* ── consumableFrontmatterSchema ── */

test("consumableFrontmatterSchema: 정상 frontmatter 통과", () => {
  assert.doesNotThrow(() =>
    consumableFrontmatterSchema.parse(validConsumableFm),
  );
});

test("consumableFrontmatterSchema: category=WEAPON 거부", () => {
  assert.throws(() =>
    consumableFrontmatterSchema.parse({
      ...validConsumableFm,
      category: "WEAPON",
    }),
  );
});

test("consumableFrontmatterSchema: category=ARMOR 거부", () => {
  assert.throws(() =>
    consumableFrontmatterSchema.parse({
      ...validConsumableFm,
      category: "ARMOR",
    }),
  );
});

test("consumableFrontmatterSchema: effect optional 처리", () => {
  const { effect: _omit, ...rest } = validConsumableFm;
  assert.doesNotThrow(() => consumableFrontmatterSchema.parse(rest));
});

test("consumableFrontmatterSchema: description optional (body 폴백 시나리오)", () => {
  const { description: _omit, ...rest } = validConsumableFm;
  assert.doesNotThrow(() => consumableFrontmatterSchema.parse(rest));
});

/* ── DocSchema 검증 ── */

test("equipmentDocSchema: description 빈 문자열 거부 (min(1))", () => {
  assert.throws(() =>
    equipmentDocSchema.parse({
      ...validEquipmentFm,
      description: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
});

test("consumableDocSchema: description 빈 문자열 거부", () => {
  assert.throws(() =>
    consumableDocSchema.parse({
      ...validConsumableFm,
      description: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
});

test("equipmentLoreSchema: 모든 필드 optional", () => {
  assert.doesNotThrow(() => equipmentLoreSchema.parse({}));
  assert.doesNotThrow(() =>
    equipmentLoreSchema.parse({ background: "b", acquisition: "a", notes: "n" }),
  );
});

test("consumableLoreSchema: 모든 필드 optional", () => {
  assert.doesNotThrow(() => consumableLoreSchema.parse({}));
});

/* ── toDbEquipment 어댑터 ── */

test("toDbEquipment: description frontmatter 우선 사용", () => {
  const doc = toDbEquipment(validEquipmentFm, "");
  assert.equal(doc.description, "표준 사이드암.");
});

test("toDbEquipment: description 없으면 body '## 설명' 폴백", () => {
  const fm = { ...validEquipmentFm };
  delete fm.description;
  const body = "## 설명\nbody 폴백 설명입니다.\n";
  const doc = toDbEquipment(fm, body);
  assert.equal(doc.description, "body 폴백 설명입니다.");
});

test("toDbEquipment: description 둘 다 없으면 throw", () => {
  const fm = { ...validEquipmentFm };
  delete fm.description;
  assert.throws(
    () => toDbEquipment(fm, ""),
    /description/i,
    "description 누락 시 명시적 에러 기대",
  );
});

test("toDbEquipment: '## 설명' 헤더만 있고 본문 없으면 throw (parseMdBody 가 빈 섹션 흡수)", () => {
  const fm = { ...validEquipmentFm };
  delete fm.description;
  // 헤더만 있고 내용 비어있으면 parseMdBody 가 content === "" 이라 result 에 등록 안 함 → sections.description undefined
  const body = "## 설명\n\n## 배경\n뭔가 있음\n";
  assert.throws(
    () => toDbEquipment(fm, body),
    /description/i,
  );
});

test("toDbEquipment: previewImage 미지정 시 undefined 보존 (NPC 와 다른 정책)", () => {
  const doc = toDbEquipment(validEquipmentFm, "");
  assert.equal(doc.previewImage, undefined);
});

test("toDbEquipment: previewImage 빈 문자열 보존 (스키마 z.literal('') 통과)", () => {
  const doc = toDbEquipment(
    { ...validEquipmentFm, previewImage: "" },
    "",
  );
  assert.equal(doc.previewImage, "");
});

test("toDbEquipment: lore 섹션 모두 비면 lore 자체가 undefined", () => {
  const doc = toDbEquipment(validEquipmentFm, "");
  assert.equal(doc.lore, undefined);
});

test("toDbEquipment: lore 섹션 하나라도 있으면 lore object 포함", () => {
  const body = "## 배경\n알파 부대 표준 장비.\n";
  const doc = toDbEquipment(validEquipmentFm, body);
  assert.ok(doc.lore, "lore object 가 있어야 함");
  assert.equal(doc.lore?.background, "알파 부대 표준 장비.");
  assert.equal(doc.lore?.acquisition, undefined);
  assert.equal(doc.lore?.notes, undefined);
});

test("toDbEquipment: loreMd — body 비어있으면 undefined", () => {
  const doc = toDbEquipment(validEquipmentFm, "");
  assert.equal(doc.loreMd, undefined);
});

test("toDbEquipment: loreMd — body 공백 only 면 undefined", () => {
  const doc = toDbEquipment(validEquipmentFm, "   \n\n  ");
  assert.equal(doc.loreMd, undefined);
});

test("toDbEquipment: loreMd — body 있으면 원본 보존", () => {
  const body = "## 배경\n역사 설명\n## 비고\n메모\n";
  const doc = toDbEquipment(validEquipmentFm, body);
  assert.equal(doc.loreMd, body);
});

test("toDbEquipment: createdAt/updatedAt ISO 문자열 → Date 변환", () => {
  const doc = toDbEquipment(
    {
      ...validEquipmentFm,
      createdAt: "2026-04-20T00:00:00Z",
      updatedAt: "2026-05-13T00:00:00Z",
    },
    "",
  );
  assert.ok(doc.createdAt instanceof Date);
  assert.ok(doc.updatedAt instanceof Date);
  assert.equal(doc.createdAt.toISOString(), "2026-04-20T00:00:00.000Z");
});

test("toDbEquipment: createdAt 누락 시 현재 시각 폴백", () => {
  const before = Date.now();
  const doc = toDbEquipment(validEquipmentFm, "");
  const after = Date.now();
  assert.ok(doc.createdAt instanceof Date);
  assert.ok(doc.createdAt.getTime() >= before && doc.createdAt.getTime() <= after);
});

/* ── toDbConsumable 어댑터 ── */

test("toDbConsumable: description frontmatter 우선 사용", () => {
  const doc = toDbConsumable(validConsumableFm, "");
  assert.equal(doc.description, "기본 회복제.");
});

test("toDbConsumable: description body 폴백", () => {
  const fm = { ...validConsumableFm };
  delete fm.description;
  const doc = toDbConsumable(fm, "## 설명\n현장 회복용.\n");
  assert.equal(doc.description, "현장 회복용.");
});

test("toDbConsumable: description 둘 다 없으면 throw", () => {
  const fm = { ...validConsumableFm };
  delete fm.description;
  assert.throws(() => toDbConsumable(fm, ""), /description/i);
});

test("toDbConsumable: previewImage 미지정 → undefined", () => {
  const doc = toDbConsumable(validConsumableFm, "");
  assert.equal(doc.previewImage, undefined);
});

test("toDbConsumable: lore 섹션 모두 비면 lore undefined", () => {
  const doc = toDbConsumable(validConsumableFm, "");
  assert.equal(doc.lore, undefined);
});

test("toDbConsumable: lore acquisition 만 있어도 lore object 포함", () => {
  const doc = toDbConsumable(
    validConsumableFm,
    "## 획득 경로\n편의점에서 구매.\n",
  );
  assert.ok(doc.lore);
  assert.equal(doc.lore?.acquisition, "편의점에서 구매.");
  assert.equal(doc.lore?.background, undefined);
});

test("toDbConsumable: category WEAPON 입력은 frontmatter schema 단계에서 throw", () => {
  assert.throws(() =>
    toDbConsumable({ ...validConsumableFm, category: "WEAPON" }, ""),
  );
});

test("toDbConsumable: effect optional — 미지정 시 undefined 보존", () => {
  const fm = { ...validConsumableFm };
  delete fm.effect;
  const doc = toDbConsumable(fm, "");
  assert.equal(doc.effect, undefined);
});

/* ── 카탈로그 템플릿 round-trip ── */

test("CATALOG TEMPLATE: equipment.template.md frontmatter 가 schema 통과", () => {
  const raw = readFileSync(resolve(TEMPLATES, "equipment.template.md"), "utf8");
  const { data, body } = parseFrontmatter(raw, {
    allowMissing: false,
    fileName: "equipment.template.md",
  });
  const fm = equipmentFrontmatterSchema.parse(data);
  assert.equal(fm.category, "WEAPON");
  assert.equal(fm.code, "EXAMPLE_EQUIPMENT");
  // 템플릿 description 은 frontmatter 에 있음 → 어댑터도 정상 통과 기대
  const doc = toDbEquipment(fm, body);
  assert.ok(doc.description.length > 0);
});

test("CATALOG TEMPLATE: consumable.template.md frontmatter 가 schema 통과", () => {
  const raw = readFileSync(resolve(TEMPLATES, "consumable.template.md"), "utf8");
  const { data, body } = parseFrontmatter(raw, {
    allowMissing: false,
    fileName: "consumable.template.md",
  });
  const fm = consumableFrontmatterSchema.parse(data);
  assert.equal(fm.category, "CONSUMABLE");
  assert.equal(fm.code, "EXAMPLE_CONSUMABLE");
  const doc = toDbConsumable(fm, body);
  assert.ok(doc.description.length > 0);
});
