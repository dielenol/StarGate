/**
 * P1 검증 — S6: posterImage frontmatter 진입 경로
 *
 * P1 변경에서 추가된 NPC posterImage 필드(와이드 포스터, mainImage와 별개)의
 * 처리 경로를 검증:
 *   - frontmatter schema에서 정의된 3종 형식(절대 URL / 루트 상대경로 / 빈 문자열) 허용
 *   - toDbNpc 변환 후 sheet.posterImage 에 정확히 반영
 *   - 빈 문자열은 emptyToUndefined 정규화로 undefined 매핑
 *   - frontmatter에 posterImage 키 자체가 없으면 sheet.posterImage === undefined
 *   - 잘못된 형식("./상대" 등)은 schema parse에서 거부
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  npcDocSchema,
  npcFrontmatterSchema,
  npcSheetSchema,
} from "../../../dist/schemas/npc.schema.js";
import { toDbNpc } from "../../../dist/schemas/frontmatter.js";

const baseFrontmatter = {
  codename: "POSTER_NPC",
  type: "NPC",
  role: "검증 대상",
  nameKo: "포스터",
  nameEn: "Poster",
  isPublic: true,
};

const emptyBody = {};

test("S6: npcFrontmatterSchema — posterImage에 절대 URL 허용", () => {
  const parsed = npcFrontmatterSchema.parse({
    ...baseFrontmatter,
    posterImage: "https://cdn.example.com/poster-wide.png",
  });
  assert.equal(parsed.posterImage, "https://cdn.example.com/poster-wide.png");
});

test("S6: npcFrontmatterSchema — posterImage에 서버 루트 상대경로 허용", () => {
  const parsed = npcFrontmatterSchema.parse({
    ...baseFrontmatter,
    posterImage: "/assets/peoples/wexler-poster.png",
  });
  assert.equal(parsed.posterImage, "/assets/peoples/wexler-poster.png");
});

test("S6: npcFrontmatterSchema — posterImage 빈 문자열 허용 (템플릿 빈 라인)", () => {
  const parsed = npcFrontmatterSchema.parse({
    ...baseFrontmatter,
    posterImage: "",
  });
  assert.equal(parsed.posterImage, "");
});

test("S6: npcFrontmatterSchema — posterImage 키 자체 미존재 OK (optional)", () => {
  const parsed = npcFrontmatterSchema.parse(baseFrontmatter);
  assert.equal(parsed.posterImage, undefined);
});

test("S6: npcFrontmatterSchema — '/'로 시작하지 않는 일반 문자열 거부", () => {
  assert.throws(() =>
    npcFrontmatterSchema.parse({
      ...baseFrontmatter,
      posterImage: "not-a-url",
    })
  );
});

test("S6: npcFrontmatterSchema — './상대경로' 거부 (루트 상대만 허용)", () => {
  assert.throws(() =>
    npcFrontmatterSchema.parse({
      ...baseFrontmatter,
      posterImage: "./assets/p.png",
    })
  );
});

test("S6: npcSheetSchema — posterImage optional 명시", () => {
  // sheet 단독 schema에서도 posterImage가 optional이어야 (없어도 통과)
  const minimalSheet = {
    codename: "POSTER_NPC",
    name: "포스터",
    nameEn: "Poster",
    mainImage: "",
    quote: "q",
    gender: "",
    age: "",
    height: "",
    appearance: "",
    personality: "",
    background: "",
    roleDetail: "",
    notes: "",
  };
  assert.doesNotThrow(() => npcSheetSchema.parse(minimalSheet));

  // posterImage 명시도 허용
  assert.doesNotThrow(() =>
    npcSheetSchema.parse({
      ...minimalSheet,
      posterImage: "/assets/wide.png",
    })
  );
});

test("S6: toDbNpc — frontmatter에 posterImage 명시 시 sheet.posterImage 동일 반영", () => {
  const doc = toDbNpc(
    {
      ...baseFrontmatter,
      posterImage: "/assets/peoples/wexler-poster.png",
    },
    emptyBody
  );
  assert.equal(doc.sheet.posterImage, "/assets/peoples/wexler-poster.png");

  // npcDocSchema 통과 여부도 보장
  const validated = npcDocSchema.parse(doc);
  assert.equal(validated.sheet.posterImage, "/assets/peoples/wexler-poster.png");
});

test("S6: toDbNpc — 절대 URL posterImage 반영", () => {
  const doc = toDbNpc(
    {
      ...baseFrontmatter,
      posterImage: "https://cdn.example.com/poster.png",
    },
    emptyBody
  );
  assert.equal(doc.sheet.posterImage, "https://cdn.example.com/poster.png");
});

test("S6: toDbNpc — frontmatter에 posterImage 미존재 시 sheet.posterImage === undefined", () => {
  const doc = toDbNpc(baseFrontmatter, emptyBody);
  assert.equal(doc.sheet.posterImage, undefined);

  // npcDocSchema 통과 (optional)
  const validated = npcDocSchema.parse(doc);
  assert.equal(validated.sheet.posterImage, undefined);
});

test("S6: toDbNpc — 빈 문자열 posterImage는 emptyToUndefined로 undefined 정규화", () => {
  const doc = toDbNpc(
    {
      ...baseFrontmatter,
      posterImage: "",
    },
    emptyBody
  );
  // emptyToUndefined가 빈 문자열을 undefined로 변환하는지 검증
  assert.equal(
    doc.sheet.posterImage,
    undefined,
    "빈 문자열 posterImage는 sheet.posterImage === undefined로 정규화되어야 함"
  );
});

test("S6: toDbNpc — mainImage와 posterImage 독립성 (서로 영향 없음)", () => {
  const doc = toDbNpc(
    {
      ...baseFrontmatter,
      posterImage: "/assets/wide.png",
    },
    emptyBody
  );
  // mainImage는 toDbNpc에서 항상 ""로 초기화 (frontmatter에 main image는 없음)
  assert.equal(doc.sheet.mainImage, "");
  // posterImage는 frontmatter 값이 그대로 반영
  assert.equal(doc.sheet.posterImage, "/assets/wide.png");
});
