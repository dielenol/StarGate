import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  npcDocSchema,
  npcFrontmatterSchema,
  npcSheetSchema,
} from "../../../dist/schemas/npc.schema.js";
import { toDbNpc } from "../../../dist/schemas/frontmatter.js";

const validSheet = {
  codename: "FOO",
  name: "이름",
  nameEn: "Name",
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

test("npcSheetSchema: 전체 문자열 필드 필수", () => {
  assert.doesNotThrow(() => npcSheetSchema.parse(validSheet));
  const missing = { ...validSheet };
  delete missing.notes;
  assert.throws(() => npcSheetSchema.parse(missing));
});

test("npcDocSchema: 최소 유효 NPC 문서", () => {
  const parsed = npcDocSchema.parse({
    codename: "REGISTRAR",
    type: "NPC",
    role: "비서",
    previewImage: "",
    isPublic: true,
    sheet: validSheet,
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
      sheet: validSheet,
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
    sheet: validSheet,
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
      sheet: validSheet,
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
      sheet: validSheet,
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

test("toDbNpc: body 섹션 → sheet 주입, 누락 섹션은 빈 문자열", () => {
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
  assert.equal(doc.sheet.quote, "q");
  assert.equal(doc.sheet.appearance, "a");
  assert.equal(doc.sheet.personality, ""); // 기본값
  assert.equal(doc.sheet.background, "");
  assert.equal(doc.sheet.name, "아그네타");
  assert.deepEqual(doc.loreTags, ["행정"]);
  assert.equal(doc.ownerId, null);
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
