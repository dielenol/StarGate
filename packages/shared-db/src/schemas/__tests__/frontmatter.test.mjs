import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import {
  parseFrontmatter,
  parseMdBody,
  toDbNpc,
  toDbFaction,
  toDbInstitution,
} from "../../../dist/schemas/frontmatter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __tests__ → schemas → src → shared-db → packages → StarGate → StarGateV2
const TEMPLATES = resolve(
  __dirname,
  "../../../../../StarGateV2/docs/spec/templates"
);

test("parseFrontmatter: 정상 frontmatter 파싱", () => {
  const { data, body } = parseFrontmatter(
    `---
codename: FOO
isPublic: true
---
body content`
  );
  assert.deepEqual(data, { codename: "FOO", isPublic: true });
  assert.equal(body, "body content");
});

test("parseFrontmatter: frontmatter 없으면 data {} + 원본 body", () => {
  const raw = "no frontmatter here\nhello";
  const { data, body } = parseFrontmatter(raw);
  assert.deepEqual(data, {});
  assert.equal(body, raw);
});

test("parseFrontmatter: boolean true/false", () => {
  const { data } = parseFrontmatter(`---\na: true\nb: false\n---\n`);
  assert.equal(data.a, true);
  assert.equal(data.b, false);
});

test("parseFrontmatter: 따옴표 제거", () => {
  const { data } = parseFrontmatter(
    `---\nsingle: 'hello'\ndouble: "world"\n---\n`
  );
  assert.equal(data.single, "hello");
  assert.equal(data.double, "world");
});

test("parseFrontmatter: 인라인 배열 [] 빈", () => {
  const { data } = parseFrontmatter(`---\ntags: []\n---\n`);
  assert.deepEqual(data.tags, []);
});

test("parseFrontmatter: 인라인 배열 [a, b, c]", () => {
  const { data } = parseFrontmatter(`---\ntags: [사무총장실, 행정, 일정관리]\n---\n`);
  assert.deepEqual(data.tags, ["사무총장실", "행정", "일정관리"]);
});

test("parseFrontmatter: 중첩 객체 throw", () => {
  assert.throws(() => parseFrontmatter(`---\nparent:\n  child: x\n---\n`));
});

test("parseFrontmatter: trailing whitespace trim", () => {
  const { data } = parseFrontmatter(`---\nrole:   padded value   \n---\n`);
  assert.equal(data.role, "padded value");
});

test("parseFrontmatter: ISO datetime은 문자열 유지", () => {
  const { data } = parseFrontmatter(`---\ncreatedAt: 2026-04-20T00:00:00Z\n---\n`);
  assert.equal(data.createdAt, "2026-04-20T00:00:00Z");
  assert.equal(typeof data.createdAt, "string");
});

test("parseMdBody: 한글 섹션 alias 인식", () => {
  const sections = parseMdBody(
    `## 대사\n> q\n## 외형\nappearance\n## 성격\np\n## 배경\nb\n## 역할 상세\nrd\n## 이름 설명\nn\n`
  );
  assert.equal(sections.quote, "> q");
  assert.equal(sections.appearance, "appearance");
  assert.equal(sections.personality, "p");
  assert.equal(sections.background, "b");
  assert.equal(sections.roleDetail, "rd");
  assert.equal(sections.notes, "n");
});

test("parseMdBody: 영어 alias 인식 + 대소문자 무시", () => {
  const sections = parseMdBody(`## Appearance\nA\n## IDEOLOGY\nB\n`);
  assert.equal(sections.appearance, "A");
  assert.equal(sections.ideology, "B");
});

test("parseMdBody: 등록되지 않은 섹션은 무시", () => {
  const sections = parseMdBody(`## UnknownHeading\nfoo\n## 관계 (참고)\nx\n`);
  assert.equal(Object.keys(sections).length, 0);
});

/* ──────────────────────────────────────────────────────────────
   ↓↓↓ 여기서부터는 발견된 버그를 고정(pin)하는 테스트.
   의도대로라면 PASS 해야 하지만 현재 구현 결함으로 FAIL 예상.
   Overseer 보고에 "현재 FAIL 상태" 로 명시된다. 수정 후 PASS.
   ────────────────────────────────────────────────────────────── */

test("BUG-P1: HTML 주석으로 시작하는 템플릿도 frontmatter 인식해야 함", () => {
  const raw = `<!-- leading comment -->
---
codename: FOO
isPublic: true
---
body`;
  const { data } = parseFrontmatter(raw);
  assert.equal(
    data.codename,
    "FOO",
    `parseFrontmatter가 첫 줄 '<!--' 주석 때문에 frontmatter를 못 찾음 (FRONTMATTER_RE에 ^--- 강제). 실제 템플릿 3개 + 예시 1개 모두 이 패턴.`
  );
});

test("BUG-P1: 빈 값 (key:) 은 빈 문자열이어야 하지 빈 배열이 아니어야 함", () => {
  const { data } = parseFrontmatter(
    `---\ninstitutionCode:\ndepartment:\npreviewImage:\n---\n`
  );
  // 현재 구현은 [] 로 flush — Zod schema가 expected string에서 실패
  assert.equal(
    typeof data.institutionCode,
    "string",
    `빈 값 'institutionCode:' 가 빈 배열 []로 파싱됨 → z.string().optional() 스키마가 throw. ` +
      `블록 배열 수집 로직이 다음 line 도착까지 currentKey/blockList를 유지한 뒤 bare key에 flush하는 패턴.`
  );
  assert.equal(typeof data.department, "string");
  assert.equal(typeof data.previewImage, "string");
});

test("BUG-P1: 따옴표 안의 콤마가 split되면 안 됨", () => {
  const { data } = parseFrontmatter(
    `---\ntags: [alpha, "beta, gamma", delta]\n---\n`
  );
  assert.deepEqual(
    data.tags,
    ["alpha", "beta, gamma", "delta"],
    `CSV naive split 때문에 "beta, gamma"가 2개로 쪼개짐. parser가 현재 "beta, "gamma" 같은 기형 생성.`
  );
});

test("BUG-P1: age/height는 문자열로 유지되어야 함 (template age: 32)", () => {
  // 템플릿 원본은 age: 32 / height: 168cm. 숫자만 든 age는 parseScalar가 number 강제 → Zod expected string 실패
  const { data } = parseFrontmatter(`---\nage: 32\nheight: 168cm\n---\n`);
  assert.equal(
    typeof data.age,
    "string",
    `'32'가 parseScalar에서 Number로 coerce됨. npc.schema.age는 z.string()이라 런타임 throw.`
  );
});

/* ──────────────────────────────────────────────────────────────
   Round-trip: 실제 템플릿 + 예시
   ────────────────────────────────────────────────────────────── */

function roundTripNpc(file) {
  const raw = readFileSync(resolve(TEMPLATES, file), "utf8");
  const { data, body } = parseFrontmatter(raw);
  const sections = parseMdBody(body);
  return toDbNpc(data, sections);
}

test("ROUND-TRIP: npc.template.md → toDbNpc 성공 (현재 FAIL 예상)", () => {
  assert.doesNotThrow(
    () => roundTripNpc("npc.template.md"),
    `현재 parseFrontmatter가 HTML 주석 leading 때문에 frontmatter를 못 읽어 data={}로 나오고 ` +
      `npcFrontmatterSchema.parse(data)에서 codename/type/role/nameKo/isPublic 모두 undefined throw.`
  );
});

test("ROUND-TRIP: examples/npc-registrar.example.md → toDbNpc 성공 (현재 FAIL 예상)", () => {
  assert.doesNotThrow(() => roundTripNpc("examples/npc-registrar.example.md"));
});

test("ROUND-TRIP: faction.template.md → toDbFaction 성공 (현재 FAIL 예상)", () => {
  const raw = readFileSync(resolve(TEMPLATES, "faction.template.md"), "utf8");
  const { data, body } = parseFrontmatter(raw);
  assert.doesNotThrow(() => toDbFaction(data, body));
});

test("ROUND-TRIP: institution.template.md → toDbInstitution 성공 (현재 FAIL 예상)", () => {
  const raw = readFileSync(
    resolve(TEMPLATES, "institution.template.md"),
    "utf8"
  );
  const { data, body } = parseFrontmatter(raw);
  assert.doesNotThrow(() => toDbInstitution(data, body));
});
