import type {
  TowaskiLicenseTestResponse,
} from "@/lib/equipment-shop/license-test";
import type {
  TowaskiLicenseV2StepInput,
} from "@/lib/equipment-shop/license-test-v2";

export type TowaskiLicenseV2ActiveResponse = Extract<
  TowaskiLicenseTestResponse,
  { status: "active"; step: number }
>;

export interface TowaskiLicenseV2GameProps {
  challenge: TowaskiLicenseV2ActiveResponse;
  disabled: boolean;
  onResolve: (input: TowaskiLicenseV2StepInput) => void;
}

export function remainingStepSeconds(deadlineAt: string): number {
  const deadline = Date.parse(deadlineAt);
  return Number.isFinite(deadline)
    ? Math.max(0, Math.ceil((deadline - Date.now()) / 1_000))
    : 0;
}
