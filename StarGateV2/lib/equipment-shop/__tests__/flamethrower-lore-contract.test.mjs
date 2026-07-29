import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STATUS_DESCRIPTION =
  "뜨거운 물질(물, 기름, 불), 화학물질, 전기, 마찰, 방사선 등으로 인해 피부와 조직이 손상되는 것을 말";
const STATUS_EFFECT =
  "매 라운드 동안 N의 수치에 해당하는 지속 피해를 입게 되며 방어력은 -N만큼 유지";
const STACK_EFFECT = "방어력에 적용되는 -N이 누적";
const SUMMARY_EFFECT = "매 라운드 N의 지속 피해와 방어력 -N";
const SUMMARY_STACK = "중복 시 방어력 감소가 누적";

const EQUIPMENT_SPEC_URL = new URL(
  "../../../docs/spec/equipment/basic-flamethrower.md",
  import.meta.url,
);
const EQUIPMENT_PAYLOAD_URL = new URL(
  "../../../scripts/seed-payloads/equipment-basic-armory-catalog-2026-07-06.json",
  import.meta.url,
);
const STATUS_PAYLOAD_URL = new URL(
  "../../../scripts/seed-payloads/wiki-status-effects.json",
  import.meta.url,
);
const BIG_BOY_PAYLOAD_URL = new URL(
  "../../../scripts/seed-payloads/agent-big-boy-park-aesol.json",
  import.meta.url,
);

test("flamethrower spec and durable payload share the canonical burn rule", async () => {
  const [spec, equipmentPayload] = await Promise.all([
    readFile(EQUIPMENT_SPEC_URL, "utf8"),
    readFile(EQUIPMENT_PAYLOAD_URL, "utf8").then(JSON.parse),
  ]);
  const flamethrower = equipmentPayload.find(
    (entry) => entry.payload?.slug === "basic-flamethrower",
  )?.payload;

  assert.ok(flamethrower);
  for (const text of [spec, flamethrower.loreMd, flamethrower.lore.notes]) {
    assert.match(text, new RegExp(STATUS_EFFECT));
    assert.match(text, new RegExp(STACK_EFFECT));
  }
  assert.match(flamethrower.description, new RegExp(SUMMARY_EFFECT));
  assert.match(flamethrower.description, new RegExp(SUMMARY_STACK));
  assert.match(spec, new RegExp(STATUS_DESCRIPTION.replace(/[()]/g, "\\$&")));
  assert.match(
    flamethrower.loreMd,
    new RegExp(STATUS_DESCRIPTION.replace(/[()]/g, "\\$&")),
  );
});

test("status wiki and BIG BOY equipment mirror the corrected burn description", async () => {
  const [statusPayload, bigBoyPayload] = await Promise.all([
    readFile(STATUS_PAYLOAD_URL, "utf8").then(JSON.parse),
    readFile(BIG_BOY_PAYLOAD_URL, "utf8").then(JSON.parse),
  ]);
  const statusPage = statusPayload.find(
    (entry) => entry.payload?.slug === "status-effects",
  )?.payload;
  const bigBoyEquipment = bigBoyPayload.payload?.play?.equipment?.find(
    (item) => item.name === "보급형 화염방사기",
  );

  assert.ok(statusPage);
  assert.ok(bigBoyEquipment);
  assert.match(
    statusPage.content,
    new RegExp(STATUS_DESCRIPTION.replace(/[()]/g, "\\$&")),
  );
  assert.match(statusPage.content, new RegExp(STATUS_EFFECT));
  assert.match(statusPage.content, new RegExp(STACK_EFFECT));
  assert.match(bigBoyEquipment.description, new RegExp(SUMMARY_EFFECT));
  assert.match(bigBoyEquipment.description, new RegExp(SUMMARY_STACK));
  assert.match(bigBoyPayload.payload.loreMd, new RegExp(SUMMARY_EFFECT));
});
