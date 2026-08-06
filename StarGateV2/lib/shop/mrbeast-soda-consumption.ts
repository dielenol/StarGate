import { MRBEAST_SODA_SLUG } from "./mrbeast-lottery.ts";

export type MrBeastSodaConsumptionOutcomeCode = "DEFECTIVE" | "NORMAL";

export interface MrBeastSodaConsumptionOutcome {
  unit: number;
  code: MrBeastSodaConsumptionOutcomeCode;
  hpRecovery: number;
  sanRecovery: number;
}

const DEFECTIVE_THRESHOLD = 0.2;
const DEFECTIVE_RECOVERY = 1;
const NORMAL_RECOVERY = 10;

export function resolveMrBeastSodaConsumptionOutcomes(
  quantity: number,
  random: () => number = Math.random,
): MrBeastSodaConsumptionOutcome[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error("quantity must be a positive safe integer");
  }

  return Array.from({ length: quantity }, (_, index) => {
    const defective = random() < DEFECTIVE_THRESHOLD;
    const recovery = defective ? DEFECTIVE_RECOVERY : NORMAL_RECOVERY;
    return {
      unit: index + 1,
      code: defective ? "DEFECTIVE" : "NORMAL",
      hpRecovery: recovery,
      sanRecovery: recovery,
    };
  });
}

export function resolveConsumableOutcomes(
  slug: string | undefined,
  quantity: number,
  random: () => number = Math.random,
): MrBeastSodaConsumptionOutcome[] {
  return slug === MRBEAST_SODA_SLUG
    ? resolveMrBeastSodaConsumptionOutcomes(quantity, random)
    : [];
}
