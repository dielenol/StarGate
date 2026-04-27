/**
 * 이주 NPC MD round-trip 테스트
 *
 * 레거시 docs/civil-society/*, docs/spec/npc/npc-*-spec.md 를 신 규격으로 이주한
 * docs/spec/npc/{registrar,dominique-lee,towaski}.md 의 파싱·스키마 통과를 확인한다.
 *
 * 기대 결과: 기본 52개 + 본 파일 3개 = 55개 테스트.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseFrontmatter,
  parseMdBody,
  toDbNpc,
} from "../../../dist/schemas/frontmatter.js";
import { npcFrontmatterSchema, npcDocSchema } from "../../../dist/schemas/npc.schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// `../../../../../` = 5단계 상승: __tests__ → schemas → src → shared-db → packages → <repo root>
// 그 뒤에 StarGateV2/docs/spec/npc 로 내려간다. 이주 MD 3종은 모두 StarGateV2 쪽에 있음.
const MIGRATED_DIR = resolve(
  __dirname,
  "../../../../../StarGateV2/docs/spec/npc",
);

/** 이주 문서 3종 + 기대 factionCode/institutionCode/codename 스팟체크. */
const MIGRATED_FILES = [
  {
    file: "registrar.md",
    codename: "REGISTRAR",
    factionCode: "COUNCIL",
    institutionCode: "SECRETARIAT",
    expectedSections: ["appearance", "personality", "background", "roleDetail", "notes", "quote"],
  },
  {
    file: "dominique-lee.md",
    codename: "STAR_MART",
    factionCode: "CIVIL",
    // institutionCode 는 빈 값이므로 frontmatter에서는 빈 문자열, toDbNpc 후 undefined
    institutionCode: undefined,
    expectedSections: ["appearance", "personality", "background", "roleDetail", "notes", "quote"],
  },
  {
    file: "towaski.md",
    codename: "TOWASKI",
    factionCode: "CIVIL",
    institutionCode: undefined,
    expectedSections: ["appearance", "personality", "background", "roleDetail", "notes", "quote"],
  },
];

for (const entry of MIGRATED_FILES) {
  test(`MIGRATION: ${entry.file} → parseFrontmatter + parseMdBody + toDbNpc + npcDocSchema`, () => {
    const raw = readFileSync(resolve(MIGRATED_DIR, entry.file), "utf8");

    // 1. frontmatter 구분자 필수 (allowMissing: false)
    const { data, body } = parseFrontmatter(raw, {
      allowMissing: false,
      fileName: entry.file,
    });

    // 2. frontmatter 스키마 통과
    const frontmatter = npcFrontmatterSchema.parse(data);
    assert.equal(frontmatter.codename, entry.codename, "codename 불일치");
    assert.equal(
      frontmatter.factionCode,
      entry.factionCode,
      "factionCode 불일치",
    );

    // 3. 본문 섹션 파싱 + 기대 섹션 모두 존재
    const sections = parseMdBody(body);
    for (const sectionKey of entry.expectedSections) {
      assert.ok(
        sections[sectionKey] && sections[sectionKey].length > 0,
        `섹션 누락: ${sectionKey} (file=${entry.file})`,
      );
    }

    // 4. DB 문서 빌드 + 최종 스키마 검증 (body 원문을 loreMd에 보존)
    const doc = toDbNpc(frontmatter, sections, body);
    const parsed = npcDocSchema.parse(doc);

    assert.equal(parsed.codename, entry.codename);
    assert.equal(parsed.type, "NPC");
    assert.equal(parsed.factionCode, entry.factionCode);
    assert.equal(parsed.institutionCode, entry.institutionCode);
    assert.ok(parsed.lore.appearance.length > 0, "lore.appearance 비어 있음");
    assert.ok(parsed.lore.background.length > 0, "lore.background 비어 있음");

    // loreMd에 body 전체가 보존되는지 확인 (섹션 파서가 흡수하지 않는 '## 관계' '## 데이터 연동' 등
    // 참고 섹션도 원본 문자열에는 살아 있어야 한다)
    assert.ok(
      typeof parsed.loreMd === "string" && parsed.loreMd.length > 0,
      "loreMd 비어 있음 (body 원문이 보존되지 않음)",
    );
    if (entry.codename === "STAR_MART" || entry.codename === "TOWASKI") {
      assert.ok(
        parsed.loreMd.includes("## 관계 (참고)"),
        `loreMd에 '## 관계 (참고)' 섹션 원문 누락 (file=${entry.file})`,
      );
      assert.ok(
        parsed.loreMd.includes("## 데이터 연동 (참고)"),
        `loreMd에 '## 데이터 연동 (참고)' 섹션 원문 누락 (file=${entry.file})`,
      );
    }
  });
}
