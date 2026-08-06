import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { finalCharacterStat } from "../stats.ts";

const SHARED_DB_CHARACTERS_URL = new URL(
  "../../../../packages/shared-db/src/crud/characters.ts",
  import.meta.url,
);
const CHARACTERS_CLIENT_URL = new URL(
  "../../../app/(erp)/erp/characters/CharactersClient.tsx",
  import.meta.url,
);
const POSTER_HERO_URL = new URL(
  "../../../app/(erp)/erp/characters/[id]/PosterHero.tsx",
  import.meta.url,
);

test("캐릭터 카드 최종 능력치는 기본값과 포인트 보정값을 합산한다", () => {
  assert.equal(finalCharacterStat(50, 3), 53);
  assert.equal(finalCharacterStat(30, -7), 23);
  assert.equal(finalCharacterStat(5), 5);
  assert.equal(finalCharacterStat(2, -10), 0);
});

test("캐릭터 목록 projection은 HP/SAN/ATK/DEF와 각 보정값을 모두 제공한다", async () => {
  const source = await readFile(SHARED_DB_CHARACTERS_URL, "utf8");
  const projection = source.slice(
    source.indexOf("export async function listAgentCharacterCards"),
    source.indexOf("export async function listPublicCharacters"),
  );

  for (const field of [
    "hp",
    "hpDelta",
    "san",
    "sanDelta",
    "atk",
    "atkDelta",
    "def",
    "defDelta",
  ]) {
    assert.match(projection, new RegExp(`"play\\.${field}": 1`));
  }
});

test("캐릭터 카드는 네 능력치를 최종값으로 렌더한다", async () => {
  const source = await readFile(CHARACTERS_CLIENT_URL, "utf8");

  assert.match(source, /const hp = finalCharacterStat\(c\.play\.hp, c\.play\.hpDelta\)/);
  assert.match(source, /const san = finalCharacterStat\(c\.play\.san, c\.play\.sanDelta\)/);
  assert.match(source, /const atk = finalCharacterStat\(c\.play\.atk, c\.play\.atkDelta\)/);
  assert.match(source, /const def = finalCharacterStat\(c\.play\.def, c\.play\.defDelta\)/);
  assert.match(source, /<CombatStat label="ATK" value=\{atk\} \/>/);
  assert.match(source, /<CombatStat label="DEF" value=\{def\} \/>/);
});

test("캐릭터 상세 VITALS도 네 능력치를 최종값으로 렌더한다", async () => {
  const source = await readFile(POSTER_HERO_URL, "utf8");
  const compactSource = source.replace(/\s+/g, " ");

  for (const stat of ["hp", "san", "def", "atk"]) {
    assert.match(
      compactSource,
      new RegExp(
        `value=\\{finalCharacterStat\\(playSheet\\.${stat}, playSheet\\.${stat}Delta\\)\\}`,
      ),
    );
  }

  assert.match(
    compactSource,
    /finalCharacterStat\(playSheet\.san, playSheet\.sanDelta\) < 30/,
  );
});
