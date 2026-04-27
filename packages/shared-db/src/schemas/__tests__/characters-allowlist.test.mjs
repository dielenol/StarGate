import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/* updateCharacter 의 ALLOWED_CHARACTER_FIELDS 에 핵심 필드들이 포함되어
   있는지 소스 레벨에서 static assertion. 실제 updateCharacter 는 mongodb
   client 를 요구해 import 하면 부수효과가 크기 때문에 set 내용을 소스에서
   추출해서 검사한다. */

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHARACTERS_SRC = resolve(__dirname, "../../crud/characters.ts");

test("ALLOWED_CHARACTER_FIELDS 에 핵심 필드 (lore/play sub-doc 루트 + 조직 코드) 포함", () => {
  const src = readFileSync(CHARACTERS_SRC, "utf8");
  const setMatch = /(?:export\s+)?const ALLOWED_CHARACTER_FIELDS\s*=\s*new Set(?:<[^>]+>)?\(\[([\s\S]*?)\]\)/m.exec(
    src
  );
  assert.ok(setMatch, "ALLOWED_CHARACTER_FIELDS set 선언을 찾지 못함");
  const listed = (setMatch[1].match(/"([^"]+)"/g) ?? []).map((s) =>
    s.slice(1, -1)
  );

  for (const needed of [
    "lore",
    "play",
    "factionCode",
    "institutionCode",
  ]) {
    assert.ok(
      listed.includes(needed),
      `필드 ${needed} 가 화이트리스트에 없음. updateCharacter 경로에서 저장이 거부됨.`
    );
  }
});

test("ALLOWED_CHARACTER_FIELDS 에 중복 엔트리 없음", () => {
  const src = readFileSync(CHARACTERS_SRC, "utf8");
  const setMatch = /(?:export\s+)?const ALLOWED_CHARACTER_FIELDS\s*=\s*new Set(?:<[^>]+>)?\(\[([\s\S]*?)\]\)/m.exec(
    src
  );
  const listed = (setMatch[1].match(/"([^"]+)"/g) ?? []).map((s) =>
    s.slice(1, -1)
  );
  const dedup = new Set(listed);
  assert.equal(dedup.size, listed.length, `중복 필드: ${listed.join(",")}`);
});
