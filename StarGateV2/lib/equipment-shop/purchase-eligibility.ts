import {
  hasTowaskiBasicPurchaseAccess,
  type EquipmentLicenseRequirement,
  type EquipmentLicenseStatus,
} from "./licenses";

export type EquipmentPurchaseBlockCode =
  | "ITEM_NOT_AVAILABLE"
  | "BASIC_LICENSE_REQUIRED"
  | "LICENSE_REQUIRED"
  | "LICENSE_ALREADY_OWNED"
  | "INSUFFICIENT_BALANCE";

export interface EquipmentPurchaseEligibility {
  eligible: boolean;
  code: EquipmentPurchaseBlockCode | null;
  reason: string;
}

export function evaluateEquipmentPurchaseEligibility(args: {
  isGM: boolean;
  hasBasicLicense: boolean;
  available: boolean;
  price: number;
  balance: number;
  licenseOwned: boolean;
  licenseRequirement?: EquipmentLicenseRequirement;
  licenseStatus?: EquipmentLicenseStatus;
}): EquipmentPurchaseEligibility {
  if (!args.available) {
    return {
      eligible: false,
      code: "ITEM_NOT_AVAILABLE",
      reason: "현재 반출 가능한 품목이 아닙니다.",
    };
  }
  if (
    !hasTowaskiBasicPurchaseAccess({
      isGM: args.isGM,
      hasBasicLicense: args.hasBasicLicense,
      licenseStatus: args.licenseStatus,
    })
  ) {
    return {
      eligible: false,
      code: "BASIC_LICENSE_REQUIRED",
      reason: "기본 화기 라이센스 또는 해당 품목의 명시 적성 승인이 필요합니다.",
    };
  }
  if (args.licenseRequirement && !args.licenseStatus?.satisfied) {
    return {
      eligible: false,
      code: "LICENSE_REQUIRED",
      reason: `${args.licenseRequirement.licenseName}가 필요합니다.`,
    };
  }
  if (args.licenseOwned) {
    return {
      eligible: false,
      code: "LICENSE_ALREADY_OWNED",
      reason: "이미 발급된 라이센스입니다.",
    };
  }
  if (args.price > args.balance) {
    return {
      eligible: false,
      code: "INSUFFICIENT_BALANCE",
      reason: "잔액이 부족합니다.",
    };
  }
  return { eligible: true, code: null, reason: "현재 조건으로 즉시 반출할 수 있습니다." };
}
