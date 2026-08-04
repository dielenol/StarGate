import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ABILITY_SLOTS,
  initAbilities,
} from "../../../app/(erp)/erp/characters/_form-utils.ts";

const POSTER_HERO_URL = new URL(
  "../../../app/(erp)/erp/characters/[id]/PosterHero.tsx",
  import.meta.url,
);
const IMPORT_CLIENT_URL = new URL(
  "../../../app/(erp)/erp/admin/characters/import/ImportClient.tsx",
  import.meta.url,
);
const PATCH_ROUTE_URL = new URL(
  "../../../app/api/erp/characters/[id]/route.ts",
  import.meta.url,
);
const WIKI_PAYLOAD_URL = new URL(
  "../../../scripts/seed-payloads/wiki-ultimate-ability-rule-2026-08-03.json",
  import.meta.url,
);
const TIME_MIGRATION_URL = new URL(
  "../../../scripts/seed-payloads/agent-time-r-ultimate-slot-2026-08-03.json",
  import.meta.url,
);
const SEED_RUNNER_URL = new URL(
  "../../../scripts/upsert-seed-payload.ts",
  import.meta.url,
);
const LORE_URL = new URL(
  "../../../../docs/lore/concept/ultimate-ability.md",
  import.meta.url,
);

test("캐릭터 폼은 R을 마지막 궁극기 슬롯으로 초기화한다", () => {
  assert.equal(ABILITY_SLOTS.length, 12);
  assert.equal(ABILITY_SLOTS.at(-1), "R");

  const abilities = initAbilities([
    { slot: "R", code: "R", name: "시간 왜곡" },
  ]);
  assert.equal(abilities.length, 12);
  assert.deepEqual(abilities.at(-1), {
    slot: "R",
    code: "R",
    name: "시간 왜곡",
  });
});

test("캐릭터 상세와 관리자 import가 R 슬롯을 같은 계약으로 사용한다", async () => {
  const [posterHero, importClient, patchRoute] = await Promise.all([
    readFile(POSTER_HERO_URL, "utf8"),
    readFile(IMPORT_CLIENT_URL, "utf8"),
    readFile(PATCH_ROUTE_URL, "utf8"),
  ]);

  assert.match(posterHero, /"R"/);
  assert.match(posterHero, /"ULTIMATE"/);
  assert.match(importClient, /ABILITY_SLOTS/);
  assert.match(patchRoute, /\(playAllowed \|\| isPlayer\)/);
  assert.match(patchRoute, /playSheetSchema\.shape\.abilities\.safeParse/);
});

test("궁극기 규정과 TIME 변환 payload가 R 슬롯 계약을 보존한다", async () => {
  const [wikiPayload, migration, seedRunner, lore] = await Promise.all([
    readFile(WIKI_PAYLOAD_URL, "utf8").then(JSON.parse),
    readFile(TIME_MIGRATION_URL, "utf8").then(JSON.parse),
    readFile(SEED_RUNNER_URL, "utf8"),
    readFile(LORE_URL, "utf8"),
  ]);

  const wikiText = wikiPayload[0].update[0].$set.content.$ifNull[1];
  assert.equal(wikiPayload[0].filter.slug, "ultimate-ability");
  assert.equal(wikiPayload[0].upsert, true);
  assert.match(wikiText, /R 슬롯/);
  assert.match(wikiText, /캐릭터 하나.*최대 하나/);
  assert.equal(wikiPayload[1].filter.slug, "novus-ordo-rules");
  assert.match(JSON.stringify(wikiPayload[1].update), /## 궁극기/);
  assert.match(JSON.stringify(wikiPayload[1].update), /\[\[궁극기\]\]/);
  assert.match(lore, /열두 번째 어빌리티 슬롯/);

  assert.equal(migration.filter.codename, "TIME");
  assert.equal(migration.filter["play.abilities"].$elemMatch.slot, "A5");
  assert.match(JSON.stringify(migration.update), /\"slot\":\"R\"/);
  assert.equal(migration.update[0].$set.bulkUpdatedAt, "$$NOW");
  assert.equal(migration.update[0].$set.updatedAt, "$$NOW");
  assert.match(seedRunner, /writtenId = existing\?\._id/);
  assert.match(seedRunner, /matchedCount \+ result\.upsertedCount !== 1/);
  assert.match(seedRunner, /findOne\(\{ _id: writtenId \}\)/);
});
