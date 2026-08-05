import { test } from "node:test";
import { strict as assert } from "node:assert";

import { planCodenameDocument } from "../character-codename-migration.ts";

test("canonical codename과 알려진 reverse refs를 함께 교체한다", () => {
  const character = planCodenameDocument(
    "characters",
    {
      _id: "character-1",
      codename: "OLD_CODE",
      lore: { relations: [{ targetCodename: "OLD_CODE" }] },
    },
    "OLD_CODE",
    "NEW_CODE",
  );
  assert.equal(character.blockers.length, 0);
  assert.equal(character.after.codename, "NEW_CODE");
  assert.equal(character.after.lore.relations[0].targetCodename, "NEW_CODE");

  const report = planCodenameDocument(
    "session_reports",
    {
      _id: "report-1",
      participants: ["OLD_CODE"],
      relatedPersonnelCodenames: ["OLD_CODE"],
    },
    "OLD_CODE",
    "NEW_CODE",
  );
  assert.equal(report.blockers.length, 0);
  assert.deepEqual(report.after.participants, ["NEW_CODE"]);
  assert.deepEqual(report.after.relatedPersonnelCodenames, ["NEW_CODE"]);
});

test("typed wiki link만 자동 변경하고 일반 산문·미분류 필드는 차단한다", () => {
  const typed = planCodenameDocument(
    "wiki_pages",
    { _id: "wiki-1", content: "[[personnel:OLD_CODE|요원]]" },
    "OLD_CODE",
    "NEW_CODE",
  );
  assert.equal(typed.blockers.length, 0);
  assert.equal(typed.after.content, "[[personnel:NEW_CODE|요원]]");

  const prose = planCodenameDocument(
    "wiki_pages",
    { _id: "wiki-2", content: "OLD_CODE가 등장한다." },
    "OLD_CODE",
    "NEW_CODE",
  );
  assert.equal(prose.changed, false);
  assert.equal(prose.blockers[0]?.reason, "embedded-reference-needs-review");

  const unknown = planCodenameDocument(
    "character_inventory",
    { _id: "inventory-1", characterCodename: "OLD_CODE" },
    "OLD_CODE",
    "NEW_CODE",
  );
  assert.equal(unknown.blockers[0]?.reason, "unsupported-exact-reference");
});
