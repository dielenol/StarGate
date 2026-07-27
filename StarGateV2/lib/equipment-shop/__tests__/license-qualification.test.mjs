import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTowaskiLicenseQualificationStatus,
} from "../license-qualification.ts";

const NOW = new Date("2026-07-27T00:00:00.000Z");

test("legacy basic and precision licenses remain grandfathered", () => {
  for (const licenseSlug of [
    "towaski-license-basic-firearm",
    "towaski-license-precision-firearm",
  ]) {
    const status = resolveTowaskiLicenseQualificationStatus({
      licenseSlug,
      entry: { quantity: 1 },
      now: NOW,
    });
    assert.equal(status.state, "grandfathered");
    assert.equal(status.grantsPurchaseAccess, true);
    assert.equal(status.canTakeTest, false);
  }
});

test("unversioned advanced licenses can renew without losing access", () => {
  const status = resolveTowaskiLicenseQualificationStatus({
    licenseSlug: "towaski-license-sonic-equipment",
    entry: { quantity: 1 },
    now: NOW,
  });

  assert.equal(status.state, "renewal_due");
  assert.equal(status.grantsPurchaseAccess, true);
  assert.equal(status.canTakeTest, true);
  assert.equal(status.renewalDueAt, undefined);
});

test("advanced renewal keeps access for thirty days and blocks new purchase after", () => {
  const entry = {
    quantity: 1,
    licenseQualification: {
      authority: "TOWASKI",
      programVersion: 1,
      qualifiedAt: new Date("2026-07-01T00:00:00.000Z"),
      renewalDueAt: new Date("2026-08-26T00:00:00.000Z"),
    },
  };
  const due = resolveTowaskiLicenseQualificationStatus({
    licenseSlug: "towaski-license-heavy-weapon",
    entry,
    now: NOW,
  });
  assert.equal(due.state, "renewal_due");
  assert.equal(due.renewalDaysRemaining, 30);
  assert.equal(due.grantsPurchaseAccess, true);

  const overdue = resolveTowaskiLicenseQualificationStatus({
    licenseSlug: "towaski-license-heavy-weapon",
    entry,
    now: new Date("2026-08-26T00:00:00.000Z"),
  });
  assert.equal(overdue.state, "renewal_overdue");
  assert.equal(overdue.grantsPurchaseAccess, false);
  assert.equal(overdue.canTakeTest, true);
});

test("v2 qualification is active and does not offer another test", () => {
  const status = resolveTowaskiLicenseQualificationStatus({
    licenseSlug: "towaski-license-explosive-ordnance",
    entry: {
      quantity: 1,
      licenseQualification: {
        authority: "TOWASKI",
        programVersion: 2,
        qualifiedAt: NOW,
      },
    },
    now: NOW,
  });

  assert.equal(status.state, "active");
  assert.equal(status.grantsPurchaseAccess, true);
  assert.equal(status.canTakeTest, false);
});
