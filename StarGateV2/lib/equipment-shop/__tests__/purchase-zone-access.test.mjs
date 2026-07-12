import assert from "node:assert/strict";
import test from "node:test";

import {
  hasEquipmentShopZonePurchaseAccess,
  isAcheronSharedArmorZone,
  isEquipmentShopCatalogZoneMatch,
  requiresTowaskiBasicLicense,
} from "../purchase-zone-access.ts";

test("players can purchase Towaski and native Acheron catalog items", () => {
  assert.equal(
    hasEquipmentShopZonePurchaseAccess({
      isGM: false,
      purchaseZone: "towaski",
      sourceZone: "towaski",
      category: "WEAPON",
    }),
    true,
  );
  assert.equal(
    hasEquipmentShopZonePurchaseAccess({
      isGM: false,
      purchaseZone: "acheron",
      sourceZone: "acheron",
      category: "WEAPON",
    }),
    true,
  );
});

test("Acheron accepts shared Towaski armor but not cross-zone weapons", () => {
  const sharedArmor = {
    purchaseZone: "acheron",
    sourceZone: "towaski",
    category: "ARMOR",
  };
  assert.equal(isAcheronSharedArmorZone(sharedArmor), true);
  assert.equal(isEquipmentShopCatalogZoneMatch(sharedArmor), true);
  assert.equal(
    hasEquipmentShopZonePurchaseAccess({ isGM: false, ...sharedArmor }),
    true,
  );

  assert.equal(
    hasEquipmentShopZonePurchaseAccess({
      isGM: false,
      purchaseZone: "acheron",
      sourceZone: "towaski",
      category: "WEAPON",
    }),
    false,
  );
});

test("strategic catalog remains GM-only", () => {
  const strategicItem = {
    purchaseZone: "strategic",
    sourceZone: "strategic",
    category: "SPECIAL",
  };
  assert.equal(
    hasEquipmentShopZonePurchaseAccess({ isGM: false, ...strategicItem }),
    false,
  );
  assert.equal(
    hasEquipmentShopZonePurchaseAccess({ isGM: true, ...strategicItem }),
    true,
  );
});

test("only Towaski purchases require the basic firearm license", () => {
  assert.equal(requiresTowaskiBasicLicense("towaski"), true);
  assert.equal(requiresTowaskiBasicLicense("acheron"), false);
  assert.equal(requiresTowaskiBasicLicense("strategic"), false);
});
