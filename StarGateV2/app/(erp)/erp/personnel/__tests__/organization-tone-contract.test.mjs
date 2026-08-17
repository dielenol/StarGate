import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(relativePath) {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

test("외부 조직 tone은 최상위 그룹으로 정규화해 세 팔레트로 제한", () => {
  const constants = read("../_constants.ts");
  const client = read("../PersonnelClient.tsx");
  const crumbs = read("../_components/OrgDrillCrumbs.tsx");
  const accordion = read("../_components/SubUnitAccordion.tsx");

  assert.match(
    constants,
    /export type PersonnelOrgTone = "military" \| "civil" \| "hostile";/,
  );
  assert.match(constants, /getTopLevelGroup\(code \?\? undefined\)/);
  assert.match(constants, /topLevelGroup === "MILITARY"\) return "military"/);
  assert.match(constants, /topLevelGroup === "CIVIL"\) return "civil"/);
  assert.match(constants, /topLevelGroup === "HOSTILE"\) return "hostile"/);

  assert.doesNotMatch(client, /function getOrgTone/);
  assert.match(client, /data-tone=\{selectedTone\}/);
  assert.match(client, /tone: getPersonnelOrgTone\(selectedGroup\)/);
  assert.match(client, /tone: getPersonnelOrgTone\(expandedSubUnit\)/);
  assert.match(accordion, /const tone = getPersonnelOrgTone\(code\)/);
  assert.match(crumbs, /tone\?: PersonnelOrgTone/);
});

test("외부 조직 팔레트는 strip부터 hero, accordion, card까지 cascade", () => {
  const pageCss = read("../page.module.css");
  const stripCss = read("../_components/ClearanceStrip.module.css");
  const hero = read("../_components/GroupHero.tsx");
  const heroCss = read("../_components/GroupHero.module.css");
  const accordionCss = read("../_components/SubUnitAccordion.module.css");
  const cardCss = read("../_components/PersonnelCard.module.css");

  assert.match(pageCss, /\.personnelPage\[data-tone="hostile"\]/);
  assert.match(pageCss, /\.personnelPage\[data-tone="military"\]/);
  assert.match(pageCss, /--personnel-accent: #7fa6c9/);
  assert.match(pageCss, /\.personnelPage\[data-tone="civil"\]/);
  assert.match(pageCss, /--personnel-accent: rgb\(255 255 255 \/ 0\.72\)/);

  assert.match(
    stripCss,
    /--strip-accent:[\s\S]*?--personnel-accent,[\s\S]*?--dossier-accent, var\(--gold\)/,
  );
  assert.match(stripCss, /border-left: 2px solid var\(--strip-accent\)/);
  assert.match(stripCss, /\.strip__level \{[\s\S]*?color: var\(--strip-accent\)/);

  assert.match(
    heroCss,
    /--hero-accent: var\(--personnel-accent, var\(--gold\)\)/,
  );
  assert.match(hero, /data-tone=\{tone\}/);
  assert.match(heroCss, /\.hero\[data-tone\] \.subUnitChip--clickable:hover/);
  assert.match(heroCss, /\.hero\[data-tone\] \.subUnitChip--on/);
  assert.match(heroCss, /\.hero\[data-tone\] \.sections/);
  assert.match(
    accordionCss,
    /--subunit-accent: var\(--personnel-accent, var\(--gold\)\)/,
  );
  assert.match(accordionCss, /\.subunit\[data-tone\]\.subunit--open/);
  assert.match(accordionCss, /\.subunit\[data-tone\] \.head:focus-visible/);
  assert.match(
    cardCss,
    /--card-accent: var\(--personnel-accent, var\(--gold\)\)/,
  );
  assert.ok(
    cardCss.indexOf(".card--archived") > cardCss.indexOf(".card--hostile"),
    "archived palette must continue to override hostile and organization tones",
  );
});

test("breadcrumb와 직접 구성원 패널은 hover, focus, active 상태에 같은 tone 사용", () => {
  const pageCss = read("../page.module.css");
  const crumbCss = read("../_components/OrgDrillCrumbs.module.css");

  for (const tone of ["military", "civil", "hostile"]) {
    assert.match(crumbCss, new RegExp(`\\.crumb\\[data-tone="${tone}"\\]`));
  }

  assert.match(crumbCss, /\.crumb\[data-tone\]\.crumb--clickable:hover/);
  assert.match(
    crumbCss,
    /\.crumb\[data-tone\]\.crumb--clickable:focus-visible/,
  );
  assert.match(crumbCss, /\.crumb\[data-tone\]\.crumb--on/);
  assert.match(pageCss, /\.directMembers\[data-tone\]/);
  assert.match(
    pageCss,
    /\.directMembers\[data-tone\] \.directMembers__meta/,
  );
});
