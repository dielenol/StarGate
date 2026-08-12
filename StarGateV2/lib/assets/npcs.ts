import type {
  EquipmentWorkshopComputedStatus,
  EquipmentWorkshopSpecialist,
} from "../equipment-shop/workshop-request.ts";
import type { AmeriMood } from "../equipment-shop/ameri-dialogue.ts";
import type { StrategicMood } from "../equipment-shop/strategic-dialogue.ts";
import type { SutureMood } from "../equipment-shop/suture-dialogue.ts";
import type { TemperMood } from "../equipment-shop/temper-dialogue.ts";

import {
  buildStarGateV2AssetPath,
  withPublicAssetVersion,
} from "./spec.ts";

const npcCore = (
  entitySlug: string,
  role: "main-image" | "pixel-character" | "pixel-profile" | "profile",
) => buildStarGateV2AssetPath({ domain: "npc", entitySlug, role });

const npcMood = (entitySlug: string, variant: string) =>
  buildStarGateV2AssetPath({
    domain: "npc",
    entitySlug,
    role: "mood",
    variant,
  });

export const AMERI_PROFILE_SRC = npcCore("Ameri", "main-image");
export const RATCHET_PROFILE_SRC = npcCore(
  "Mateo-Rivas-Ratchet",
  "profile",
);
export const SUTURE_PROFILE_SRC = npcCore(
  "Irena-Vukovic-Suture",
  "profile",
);
export const TEMPER_PROFILE_SRC = npcCore(
  "Brigid-Kane-Temper",
  "profile",
);
export const TOWASKI_PROFILE_SRC = withPublicAssetVersion(
  npcCore("Towaski", "profile"),
  "cutout-1",
);
export const TOWASKI_PORTRAIT_SRC = TOWASKI_PROFILE_SRC;
export const VERNIER_PROFILE_SRC = npcCore(
  "Ada-Schreiber-Vernier",
  "profile",
);
export const REGISTRAR_PIXEL_CHARACTER_SRC = npcCore(
  "Registrar",
  "pixel-character",
);
export const REGISTRAR_PIXEL_PROFILE_SRC = npcCore(
  "Registrar",
  "pixel-profile",
);
export const SECTOR_C_FIELD_AGENT_PROFILE_SRC = npcCore(
  "Sector-C-Field-Agent",
  "profile",
);
export const GENERAL_COMBATANT_PROFILE_SRC = npcCore(
  "General-Combatant",
  "profile",
);

export const WORKSHOP_SPECIALIST_PORTRAITS = {
  VERNIER: VERNIER_PROFILE_SRC,
  TEMPER: TEMPER_PROFILE_SRC,
  TOWASKI: TOWASKI_PROFILE_SRC,
  SUTURE: SUTURE_PROFILE_SRC,
  RATCHET: RATCHET_PROFILE_SRC,
} as const satisfies Record<EquipmentWorkshopSpecialist, string>;

export const AMERI_MOOD_ASSETS = {
  welcome: npcMood("Ameri", "welcome"),
  routing: npcMood("Ameri", "routing"),
  review: npcMood("Ameri", "review"),
  blocked: npcMood("Ameri", "blocked"),
  idle: npcMood("Ameri", "idle"),
} as const satisfies Record<AmeriMood, string>;

export const RATCHET_MOOD_ASSETS = {
  welcome: RATCHET_PROFILE_SRC,
  inspect: npcMood("Mateo-Rivas-Ratchet", "inspect"),
  systems: npcMood("Mateo-Rivas-Ratchet", "systems"),
  dispatch: npcMood("Mateo-Rivas-Ratchet", "dispatch"),
  checkout: npcMood("Mateo-Rivas-Ratchet", "checkout"),
  blocked: npcMood("Mateo-Rivas-Ratchet", "blocked"),
  idle: npcMood("Mateo-Rivas-Ratchet", "idle"),
} as const satisfies Record<StrategicMood, string>;

export const TEMPER_MOOD_ASSETS = {
  welcome: TEMPER_PROFILE_SRC,
  inspect: npcMood("Brigid-Kane-Temper", "inspect"),
  balance: npcMood("Brigid-Kane-Temper", "balance"),
  cart: npcMood("Brigid-Kane-Temper", "cart"),
  checkout: npcMood("Brigid-Kane-Temper", "checkout"),
  blocked: npcMood("Brigid-Kane-Temper", "blocked"),
  idle: npcMood("Brigid-Kane-Temper", "idle"),
} as const satisfies Record<TemperMood, string>;

export const SUTURE_MOOD_ASSETS = {
  welcome: npcMood("Irena-Vukovic-Suture", "welcome"),
  assessment: npcMood("Irena-Vukovic-Suture", "assessment"),
  protocol: npcMood("Irena-Vukovic-Suture", "protocol"),
  funding: npcMood("Irena-Vukovic-Suture", "funding"),
  procedure: npcMood("Irena-Vukovic-Suture", "procedure"),
  recovery: npcMood("Irena-Vukovic-Suture", "recovery"),
  blocked: withPublicAssetVersion(
    npcMood("Irena-Vukovic-Suture", "blocked"),
    "clean-stop-2",
  ),
  idle: npcMood("Irena-Vukovic-Suture", "idle"),
} as const satisfies Record<SutureMood, string>;

export const TOWASKI_MOOD_ASSETS = {
  welcome: withPublicAssetVersion(npcMood("Towaski", "welcome"), "cutout-1"),
  inspect: withPublicAssetVersion(npcMood("Towaski", "inspect"), "cutout-1"),
  stock: withPublicAssetVersion(npcMood("Towaski", "stock"), "cutout-1"),
  cart: withPublicAssetVersion(npcMood("Towaski", "cart"), "cutout-1"),
  license: withPublicAssetVersion(
    npcMood("Towaski", "checkout"),
    "cutout-1",
  ),
  checkout: withPublicAssetVersion(
    npcMood("Towaski", "checkout"),
    "cutout-1",
  ),
  range: withPublicAssetVersion(npcMood("Towaski", "blocked"), "cutout-1"),
  rangeFailed: withPublicAssetVersion(
    npcMood("Towaski", "blocked"),
    "cutout-1",
  ),
  blocked: withPublicAssetVersion(
    npcMood("Towaski", "blocked"),
    "cutout-1",
  ),
  idle: withPublicAssetVersion(npcMood("Towaski", "idle"), "cutout-1"),
} as const;

export type TowaskiMood = keyof typeof TOWASKI_MOOD_ASSETS;

export function workshopPortrait(
  specialist: EquipmentWorkshopSpecialist,
  status: EquipmentWorkshopComputedStatus,
): string {
  const blocked = ["CANCELLED", "DECLINED", "REJECTED"].includes(status);

  if (specialist === "TEMPER") {
    if (blocked) return TEMPER_MOOD_ASSETS.blocked;
    if (status === "QUOTED") return TEMPER_MOOD_ASSETS.balance;
    if (status === "IN_PROGRESS") return TEMPER_MOOD_ASSETS.cart;
    return TEMPER_MOOD_ASSETS.checkout;
  }
  if (specialist === "TOWASKI") {
    if (blocked) return TOWASKI_MOOD_ASSETS.blocked;
    if (status === "QUOTED") return TOWASKI_MOOD_ASSETS.inspect;
    return TOWASKI_MOOD_ASSETS.checkout;
  }
  if (specialist === "SUTURE") {
    if (blocked) return SUTURE_MOOD_ASSETS.blocked;
    if (status === "QUOTED") return SUTURE_MOOD_ASSETS.assessment;
    if (status === "IN_PROGRESS") return SUTURE_MOOD_ASSETS.procedure;
    return SUTURE_MOOD_ASSETS.recovery;
  }
  if (specialist === "RATCHET") {
    if (blocked) return RATCHET_MOOD_ASSETS.blocked;
    if (status === "QUOTED") return RATCHET_MOOD_ASSETS.inspect;
    if (status === "IN_PROGRESS") return RATCHET_MOOD_ASSETS.dispatch;
    return RATCHET_MOOD_ASSETS.checkout;
  }
  return VERNIER_PROFILE_SRC;
}
