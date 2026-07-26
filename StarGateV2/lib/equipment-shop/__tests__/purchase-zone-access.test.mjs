import assert from "node:assert/strict";
import test from "node:test";

import {
  hasEquipmentShopOperationalAccess,
  hasEquipmentShopZonePurchaseAccess,
  isAcheronSharedArmorZone,
  isEquipmentShopCatalogZoneMatch,
  requiresTowaskiBasicLicense,
} from "../purchase-zone-access.ts";

test("players can purchase Towaski and native Acheron catalog items", () => {
  assert.equal(
    hasEquipmentShopZonePurchaseAccess({
      purchaseZone: "towaski",
      sourceZone: "towaski",
      category: "WEAPON",
    }),
    true,
  );
  assert.equal(
    hasEquipmentShopZonePurchaseAccess({
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
  assert.equal(hasEquipmentShopZonePurchaseAccess(sharedArmor), true);

  assert.equal(
    hasEquipmentShopZonePurchaseAccess({
      purchaseZone: "acheron",
      sourceZone: "towaski",
      category: "WEAPON",
    }),
    false,
  );
});

test("players can purchase strategic catalog items", () => {
  const strategicItem = {
    purchaseZone: "strategic",
    sourceZone: "strategic",
    category: "SPECIAL",
  };
  assert.equal(
    hasEquipmentShopZonePurchaseAccess(strategicItem),
    true,
  );
});

test("locked equipment zones require an operational access bypass", () => {
  const lockedZone = {
    hasPlayerServiceTestAccess: false,
    hasLocalPreviewAccess: false,
    pageLocked: true,
  };
  assert.equal(
    hasEquipmentShopOperationalAccess({ isGM: false, ...lockedZone }),
    false,
  );
  assert.equal(
    hasEquipmentShopOperationalAccess({
      isGM: false,
      ...lockedZone,
      pageLocked: false,
    }),
    true,
  );
  assert.equal(
    hasEquipmentShopOperationalAccess({ isGM: true, ...lockedZone }),
    true,
  );
  assert.equal(
    hasEquipmentShopOperationalAccess({
      isGM: false,
      ...lockedZone,
      hasPlayerServiceTestAccess: true,
    }),
    true,
  );
  assert.equal(
    hasEquipmentShopOperationalAccess({
      isGM: false,
      ...lockedZone,
      hasLocalPreviewAccess: true,
    }),
    true,
  );
});

test("only Towaski purchases require the basic firearm license", () => {
  assert.equal(requiresTowaskiBasicLicense("towaski"), true);
  assert.equal(requiresTowaskiBasicLicense("acheron"), false);
  assert.equal(requiresTowaskiBasicLicense("strategic"), false);
});
