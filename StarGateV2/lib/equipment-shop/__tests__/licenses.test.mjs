import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getEquipmentLicenseRequirement,
  resolveEquipmentCatalogLicenseContext,
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

test("catalog context locks unqualified items and exposes character aptitude exceptions", () => {
  const items = [
    {
      key: "basic-sniper-rifle",
      slug: "basic-sniper-rifle",
      name: "보급형 저격소총",
      category: "WEAPON",
      zone: "towaski",
      price: 500,
      effect: "피해 장거리 20 물리",
      description: "저격소총",
      stock: 1,
      available: true,
      licenseRequirement: {
        licenseSlug: "towaski-license-precision-firearm",
        licenseName: "토와스키 정밀 사격 라이센스",
        label: "정밀 사격",
        reason: "장거리 정밀 화기 반출",
      },
    },
    {
      key: "basic-sonic-emitter",
      slug: "basic-sonic-emitter",
      name: "보급형 음파 방출기",
      category: "WEAPON",
      zone: "towaski",
      price: 500,
      effect: "피해 중거리 15 소리",
      description: "음파 방출기",
      stock: 1,
      available: true,
      licenseRequirement: {
        licenseSlug: "towaski-license-sonic-equipment",
        licenseName: "토와스키 음파 장비 라이센스",
        label: "음파 장비",
        reason: "음파 장비 출력 봉인 반출",
      },
    },
  ];

  const context = { character: clown, ownedLicenseSlugs: new Set() };
  const sniper = resolveEquipmentCatalogLicenseContext(items[0], context);
  const sonic = resolveEquipmentCatalogLicenseContext(items[1], context);

  assert.equal(sniper.licenseStatus.satisfied, false);
  assert.equal(sonic.licenseStatus.satisfied, true);
  assert.equal(sonic.licenseStatus.source, "character_qualification");
});

test("catalog context marks owned licenses and unlocks their equipment", () => {
  const ownedLicenseSlugs = new Set(["towaski-license-precision-firearm"]);
  const [licenseItem, sniperItem] = [
    {
      key: "towaski-license-precision-firearm",
      slug: "towaski-license-precision-firearm",
      name: "토와스키 정밀 사격 라이센스",
      category: "SPECIAL",
      zone: "towaski",
      price: 120,
      effect: "저격소총 반출 자격",
      description: "정밀 사격 라이센스",
      stock: 1,
      available: true,
    },
    {
      key: "basic-sniper-rifle",
      slug: "basic-sniper-rifle",
      name: "보급형 저격소총",
      category: "WEAPON",
      zone: "towaski",
      price: 500,
      effect: "피해 장거리 20 물리",
      description: "저격소총",
      stock: 1,
      available: true,
      licenseRequirement: {
        licenseSlug: "towaski-license-precision-firearm",
        licenseName: "토와스키 정밀 사격 라이센스",
        label: "정밀 사격",
        reason: "장거리 정밀 화기 반출",
      },
    },
  ];
  const context = {
    character: { codename: "UNTRAINED" },
    ownedLicenseSlugs,
  };
  const license = resolveEquipmentCatalogLicenseContext(licenseItem, context);
  const sniper = resolveEquipmentCatalogLicenseContext(sniperItem, context);

  assert.equal(license.licenseOwned, true);
  assert.equal(sniper.licenseStatus.satisfied, true);
  assert.equal(sniper.licenseStatus.source, "owned_license");
});
