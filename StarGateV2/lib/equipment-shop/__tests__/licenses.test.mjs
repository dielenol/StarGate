import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getEquipmentLicenseRequirement,
  resolveEquipmentLicenseStatus,
} from "../licenses.ts";

const bigBoy = {
  codename: "BIG BOY",
  lore: { name: "박애솔", nickname: "빅보이", loreTags: ["빅보이"] },
  play: {
    abilityType: "화염방사기를 대폭 할인된 가격에 살 수 있는 능력.",
    weaponTraining: ["화염방사기"],
  },
};

const clown = {
  codename: "CLOWN",
  lore: {
    name: "스타크 일로니손",
    relations: [
      {
        targetCodename: "TOWASKI",
        targetName: "립 토와스키",
        label: "장비 조정",
        summary:
          "토와스키에게 시계형 나노테크놀로지 음파 방출기 장착과 시연 안내를 받았다.",
      },
    ],
  },
  play: {
    weaponTraining: ["권총"],
    abilities: [
      {
        name: "나노 테크놀로지 음파 방출기",
        effect: "중거리이며 맞은 적은 25의 SAN 피해를 입는다.",
      },
    ],
  },
};

test("catalog entries expose license requirements for gated weapons", () => {
  const requirement = getEquipmentLicenseRequirement({
    slug: "basic-sniper-rifle",
    name: "보급형 저격소총",
  });

  assert.equal(requirement?.licenseSlug, "towaski-license-precision-firearm");
  assert.equal(requirement?.label, "정밀 사격");
});

test("Park Aesol passes flamethrower license through Towaski exception", () => {
  const requirement = getEquipmentLicenseRequirement({
    slug: "basic-flamethrower",
    name: "보급형 화염방사기",
  });
  assert.ok(requirement);

  const status = resolveEquipmentLicenseStatus({
    character: bigBoy,
    requirement,
  });

  assert.equal(status.satisfied, true);
  assert.equal(status.source, "character_qualification");
  assert.equal(status.matchedKeyword, "박애솔 / 토와스키 화염방사기 특전");
});

test("character weapon training only satisfies matching weapon requirements", () => {
  const pistolRequirement = getEquipmentLicenseRequirement({
    slug: "basic-pistol",
    name: "보급형 권총",
  });
  const rifleRequirement = getEquipmentLicenseRequirement({
    slug: "basic-assault-rifle",
    name: "보급형 돌격소총",
  });
  assert.ok(pistolRequirement);
  assert.ok(rifleRequirement);

  assert.equal(
    resolveEquipmentLicenseStatus({
      character: clown,
      requirement: pistolRequirement,
    }).satisfied,
    true,
  );
  assert.equal(
    resolveEquipmentLicenseStatus({
      character: clown,
      requirement: rifleRequirement,
    }).satisfied,
    false,
  );
});

test("Starck's sonic emitter ability and Towaski relation satisfy sonic equipment", () => {
  const requirement = getEquipmentLicenseRequirement({
    slug: "basic-sonic-emitter",
    name: "보급형 음파 방출기",
  });
  assert.ok(requirement);

  const status = resolveEquipmentLicenseStatus({
    character: clown,
    requirement,
  });

  assert.equal(status.satisfied, true);
  assert.equal(status.source, "character_qualification");
});

test("owned or same-cart license satisfies a missing character qualification", () => {
  const requirement = getEquipmentLicenseRequirement({
    slug: "rocket-launcher",
    name: "로켓 런처",
  });
  assert.ok(requirement);

  const untrained = { codename: "UNTRAINED", play: { weaponTraining: [] } };
  assert.equal(
    resolveEquipmentLicenseStatus({
      character: untrained,
      requirement,
      ownedLicenseSlugs: new Set(["towaski-license-explosive-ordnance"]),
    }).source,
    "owned_license",
  );
  assert.equal(
    resolveEquipmentLicenseStatus({
      character: untrained,
      requirement,
      cartLicenseSlugs: new Set(["towaski-license-explosive-ordnance"]),
    }).source,
    "cart_license",
  );
});
