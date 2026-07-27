import type { CharacterInventory } from "@stargate/shared-db/types";

import { TOWASKI_LICENSE_PROGRAM_VERSION } from "./license-test-v2.ts";
import type { TowaskiLicenseSlug } from "./licenses";

export type TowaskiLicenseQualificationState =
  | "missing"
  | "active"
  | "grandfathered"
  | "renewal_due"
  | "renewal_overdue";

export interface TowaskiLicenseQualificationStatus {
  state: TowaskiLicenseQualificationState;
  owned: boolean;
  grantsPurchaseAccess: boolean;
  canTakeTest: boolean;
  programVersion?: number;
  qualifiedAt?: string;
  renewalDueAt?: string;
  renewalDaysRemaining?: number;
}

export const TOWASKI_ADVANCED_LICENSE_SLUGS = [
  "towaski-license-heavy-weapon",
  "towaski-license-flame-weapon",
  "towaski-license-sonic-equipment",
  "towaski-license-explosive-ordnance",
] as const satisfies readonly TowaskiLicenseSlug[];

const ADVANCED_LICENSES = new Set<TowaskiLicenseSlug>(
  TOWASKI_ADVANCED_LICENSE_SLUGS,
);

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function isTowaskiAdvancedLicenseSlug(
  licenseSlug: TowaskiLicenseSlug,
): boolean {
  return ADVANCED_LICENSES.has(licenseSlug);
}

export function resolveTowaskiLicenseQualificationStatus(args: {
  licenseSlug: TowaskiLicenseSlug;
  entry: Pick<
    CharacterInventory,
    "quantity" | "licenseQualification"
  > | null;
  now?: Date;
}): TowaskiLicenseQualificationStatus {
  const { licenseSlug, entry } = args;
  if (!entry || entry.quantity <= 0) {
    return {
      state: "missing",
      owned: false,
      grantsPurchaseAccess: false,
      canTakeTest: true,
    };
  }

  const qualification = entry.licenseQualification;
  if (
    qualification?.authority === "TOWASKI" &&
    qualification.programVersion >= TOWASKI_LICENSE_PROGRAM_VERSION
  ) {
    return {
      state: "active",
      owned: true,
      grantsPurchaseAccess: true,
      canTakeTest: false,
      programVersion: qualification.programVersion,
      qualifiedAt: toIso(qualification.qualifiedAt),
    };
  }

  if (!isTowaskiAdvancedLicenseSlug(licenseSlug)) {
    return {
      state: "grandfathered",
      owned: true,
      grantsPurchaseAccess: true,
      canTakeTest: false,
      ...(qualification?.programVersion
        ? { programVersion: qualification.programVersion }
        : {}),
      ...(toIso(qualification?.qualifiedAt)
        ? { qualifiedAt: toIso(qualification?.qualifiedAt) }
        : {}),
    };
  }

  const now = args.now ?? new Date();
  const renewalDueAt = qualification?.renewalDueAt;
  const dueTime = renewalDueAt
    ? new Date(renewalDueAt).getTime()
    : Number.POSITIVE_INFINITY;
  const overdue = Number.isFinite(dueTime) && dueTime <= now.getTime();
  const renewalDaysRemaining = Number.isFinite(dueTime)
    ? Math.max(0, Math.ceil((dueTime - now.getTime()) / 86_400_000))
    : undefined;

  return {
    state: overdue ? "renewal_overdue" : "renewal_due",
    owned: true,
    grantsPurchaseAccess: !overdue,
    canTakeTest: true,
    ...(qualification?.programVersion
      ? { programVersion: qualification.programVersion }
      : {}),
    ...(toIso(qualification?.qualifiedAt)
      ? { qualifiedAt: toIso(qualification?.qualifiedAt) }
      : {}),
    ...(toIso(renewalDueAt) ? { renewalDueAt: toIso(renewalDueAt) } : {}),
    ...(renewalDaysRemaining !== undefined ? { renewalDaysRemaining } : {}),
  };
}
