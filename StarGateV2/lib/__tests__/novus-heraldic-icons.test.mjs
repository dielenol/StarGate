import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const master = read("docs/design/novus-icons.html");
const orgSource = read("app/(erp)/erp/personnel/_components/OrgIcon.tsx");
const normalize = (body) => body.trim().replace(/>\s+</g, "><").replace(/ \/>/g, "/>");
const svgBody = (svg) => normalize(svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? "");

const ICONS = [
  ["character", "ic_character.svg"],
  ["main", "org_scope_main.svg", "MAIN"],
  ["mini", "org_scope_mini.svg", "MINI"],
  ["subject", "ic_subject.svg"],
  ["bureaucrat", "ic_bureaucrat.svg"],
  ["soldier", "ic_soldier.svg"],
  ["scientist", "ic_scientist.svg"],
  ["profile", "ic_profile.svg"],
  ["personality", "ic_personality.svg"],
  ["background", "ic_background.svg"],
  ["activeWeapon", "ic_active-weapon.svg"],
  ["activeArmor", "ic_active-armor.svg"],
  ["swordShield", "ic_sword-shield.svg"],
  ["secretariat", "org_institution_secretariat.svg", "SECRETARIAT"],
  ["manus", "org_institution_manus.svg", "MANUS"],
  ["control", "org_subunit_control.svg", "CONTROL"],
  ["finance", "org_subunit_finance.svg", "FINANCE"],
  ["sectorA", "org_subunit_sector_a.svg", "SECTOR_A"],
  ["sectorB", "org_subunit_sector_b.svg", "SECTOR_B"],
  ["sectorC", "org_subunit_sector_c.svg", "SECTOR_C"],
  ["sectorD", "org_subunit_sector_d.svg", "SECTOR_D"],
  ["sectorE", "org_subunit_sector_e.svg", "SECTOR_E"],
  ["board", "org_faction_council.svg", "COUNCIL"],
  ["military", "org_faction_military.svg", "MILITARY"],
  ["civil", "org_faction_civil.svg", "CIVIL"],
  ["extNoga", "org_extorg_noga.svg", "NOGA"],
  ["extUsa", "org_extorg_usa.svg", "USA"],
  ["extRussia", "org_extorg_russia.svg", "RUSSIA"],
  ["hostile", "org_faction_hostile.svg", "HOSTILE"],
  ["extGoldenDawn", "org_extorg_golden_dawn.svg", "GOLDEN_DAWN"],
  ["extAhnenerbe", "org_extorg_ahnenerbe.svg", "AHNENERBE"],
];

for (const [key, asset, code] of ICONS) {
  test(`${key}: fill-only SVG와 마스터/OrgIcon 본문을 동기화한다`, () => {
    const svg = read(`public/assets/svg/${asset}`);
    const body = svgBody(svg);
    assert.ok(body, `${asset}에 SVG 본문이 있어야 한다`);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /width="24"/);
    assert.match(svg, /height="24"/);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(body, /fill="currentColor"/);
    assert.match(body, /stroke="none"/);
    assert.doesNotMatch(svg, /\bstroke="(?!none")[^"]+"/);
    assert.doesNotMatch(svg, /\bfill="(?!(?:none|currentColor)")[^"]+"/);
    const tags = [...svg.matchAll(/<(?!\/)([a-zA-Z]+)\b/g)].map((match) => match[1]);
    assert.ok(tags.every((tag) => ["svg", "g", "path"].includes(tag)));

    const entry = master.match(new RegExp(`^  ${key}: \\{[\\s\\S]*?^  \\},`, "m"))?.[0];
    assert.ok(entry, `${key} 마스터 항목이 있어야 한다`);
    assert.match(entry, /fill: 'currentColor', stroke: 'none'/);
    assert.equal(normalize(entry.match(/svg: '([^']+)'/)?.[1] ?? ""), body);

    if (code) {
      const inline = orgSource.match(new RegExp(`${code}: \\{[\\s\\S]*?body: \x60([^\x60]+)\x60`))?.[1];
      assert.equal(normalize(inline ?? ""), body, `${code} source와 공개 mirror가 같아야 한다`);
    }
  });
}

test("31개 문장은 서로 다른 실루엣 소스를 유지한다", () => {
  const bodies = ICONS.map(([, asset]) => svgBody(read(`public/assets/svg/${asset}`)));
  assert.equal(new Set(bodies).size, ICONS.length);
});

test("재무·적대세력의 공용 export도 조직도 mirror와 동일하다", () => {
  for (const [app, org] of [
    ["ic_finance.svg", "org_subunit_finance.svg"],
    ["ic_hostile.svg", "org_faction_hostile.svg"],
  ]) {
    assert.equal(svgBody(read(`public/assets/svg/${app}`)), svgBody(read(`public/assets/svg/${org}`)));
  }
});

test("캐릭터 내비게이션과 무기·방어구 슬롯은 전용 아이콘을 사용한다", () => {
  const navigation = read("components/erp/nav-config.ts");
  const equipment = read("app/(erp)/erp/characters/[id]/CharacterEquipmentPanel.tsx");
  const exports = read("components/icons/index.ts");
  assert.match(navigation, /label: "캐릭터"[^\n]+icon: IconCharacter/);
  assert.match(master, /icon: 'character', label: '캐릭터', route: '\/erp\/characters'/);
  assert.match(equipment, /const SlotIcon = slot === "WEAPON" \? IconActiveWeapon : IconActiveArmor/);
  assert.doesNotMatch(equipment, /IconInventoryEquipment/);
  assert.match(exports, /IconActiveWeapon.*ic_active-weapon\.svg/);
  assert.match(exports, /IconActiveArmor.*ic_active-armor\.svg/);
});

test("마스터 페이지 그룹에 누락된 아이콘이나 렌더링 host가 없다", () => {
  const definitions = new Set([...master.matchAll(/^  (\w+): \{\n    idx:/gm)].map((match) => match[1]));
  const groups = master.match(/const GROUPS = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  const assigned = new Set();
  for (const [, group, ids] of groups.matchAll(/^  (\w+):\s*\[([^\]]*)\]/gm)) {
    assert.ok(master.includes(`id="grid-${group}"`), `${group} grid host가 있어야 한다`);
    for (const [, id] of ids.matchAll(/'([^']+)'/g)) {
      assert.ok(definitions.has(id), `${group}의 ${id} 아이콘이 정의되어야 한다`);
      assigned.add(id);
    }
  }
  for (const id of definitions) {
    assert.ok(assigned.has(id), `${id} 아이콘이 적어도 한 그룹에서 렌더링되어야 한다`);
  }
});

test("활성 장비와 기존 인벤토리·위키 장비 아이콘의 소비처를 구분한다", () => {
  const inventory = read("app/(erp)/erp/inventory/[characterId]/InventoryClient.tsx");
  const wiki = read("app/(erp)/erp/wiki/WikiClient.tsx");
  assert.match(inventory, /value: "EQUIPMENT", label: "장비", icon: IconInventoryEquipment/);
  assert.match(wiki, /장비: IconInventoryEquipment/);
  assert.match(master, /inventory:\s*\[[^\]]*'inventoryEquipment'/);
  assert.match(master, /wiki:\s*\[[^\]]*'inventoryEquipment'/);
  assert.match(master, /catalog:\s*\[[^\]]*'equipment'/);
});
