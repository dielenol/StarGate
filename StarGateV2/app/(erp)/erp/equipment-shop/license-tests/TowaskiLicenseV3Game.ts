import type { TowaskiLicenseTestResponse } from "@/lib/equipment-shop/license-test";
import type { TowaskiLicenseV3StepInput } from "@/lib/equipment-shop/license-test-v3";

export type TowaskiLicenseV3ActiveResponse = Extract<
  TowaskiLicenseTestResponse,
  { status: "active"; programVersion: 3 }
>;

export interface TowaskiLicenseV3GameProps {
  challenge: TowaskiLicenseV3ActiveResponse;
  disabled: boolean;
  onResolve: (input: TowaskiLicenseV3StepInput) => void;
  sonicStageFeedback?: {
    successful: boolean;
    targetHits: number;
    protectedHit: boolean;
  } | null;
}
