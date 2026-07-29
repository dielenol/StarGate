import { findMainCharacterByOwnerCached as findMainCharacterByOwner } from "@/lib/db/characters";
import type { SimulatorAttackerProfile } from "@/lib/equipment-shop/simulator";
import { preferOptimizedPublicImagePath } from "@/lib/asset-path";
import {
  getPixelCharacterPath,
  getPixelProfilePath,
} from "@/lib/format/character-asset";

import EquipmentShopComingSoon from "../EquipmentShopComingSoon";
import { requireEquipmentShopSession } from "../_access";
import { buildEquipmentShopCatalogResponse } from "../_data";

import EquipmentSimulatorClient from "./EquipmentSimulatorClient";

export const metadata = {
  title: "훈련장 · 병기부 · Stargate ERP",
};

const REGISTRAR_SIMULATOR_ASSETS = {
  portraitUrl: "/assets/npcs/Registrar-pixel-profile.webp",
  characterUrl: "/assets/npcs/Registrar-pixel-character.webp",
} as const;
const DEFAULT_TRAINING_AGENT_PORTRAIT =
  "/assets/npcs/Sector-C-Field-Agent-profile.webp";

function optimizedAssetPath(value?: string | null): string | undefined {
  const path = value?.trim();
  return path ? preferOptimizedPublicImagePath(path) : undefined;
}

function simulatorCharacterAssets(character: {
  codename: string;
  previewImage?: string | null;
  pixelCharacterImage?: string | null;
}): Pick<SimulatorAttackerProfile, "portraitUrl" | "characterUrl"> {
  const registrarAssets =
    character.codename.toUpperCase() === "REGISTRAR"
      ? REGISTRAR_SIMULATOR_ASSETS
      : undefined;
  const portraitUrl =
    registrarAssets?.portraitUrl ??
    getPixelProfilePath(character.codename) ??
    optimizedAssetPath(character.previewImage);
  const characterUrl =
    registrarAssets?.characterUrl ??
    getPixelCharacterPath(character.codename) ??
    optimizedAssetPath(character.pixelCharacterImage);

  return {
    ...(portraitUrl ? { portraitUrl } : {}),
    ...(characterUrl ? { characterUrl } : {}),
  };
}

function fallbackAttackerProfile(sessionUser: {
  displayName?: string | null;
  username?: string | null;
}): SimulatorAttackerProfile {
  const codename =
    sessionUser.displayName ?? sessionUser.username ?? "훈련 요원";
  const assets = simulatorCharacterAssets({ codename });

  return {
    codename,
    atk: 0,
    hp: 20,
    san: 20,
    ...assets,
    portraitUrl: assets.portraitUrl ?? DEFAULT_TRAINING_AGENT_PORTRAIT,
    source: "sandbox",
  };
}

export default async function EquipmentShopSimulatorPage() {
  const { session, canPreview } = await requireEquipmentShopSession("/erp/equipment-shop/simulator");
  if (!canPreview) {
    return <EquipmentShopComingSoon />;
  }

  let attacker = fallbackAttackerProfile(session.user);
  try {
    const mainCharacter = await findMainCharacterByOwner(session.user.id);
    if (mainCharacter?.type === "AGENT") {
      attacker = {
        codename: mainCharacter.codename,
        atk: mainCharacter.play.atk,
        hp: mainCharacter.play.hp,
        san: mainCharacter.play.san,
        ...simulatorCharacterAssets(mainCharacter),
        source: "agent",
      };
    } else if (mainCharacter) {
      attacker = {
        codename: mainCharacter.codename,
        atk: attacker.atk,
        hp: attacker.hp,
        san: attacker.san,
        ...simulatorCharacterAssets(mainCharacter),
        source: "sandbox",
      };
    }
  } catch (err) {
    console.error("[equipment-simulator] failed to load main character", err);
  }

  const catalog = await buildEquipmentShopCatalogResponse().catch(() => ({
    items: [],
    recentActivity: [],
    isOpen: true,
    mode: "open" as const,
    scheduledOpen: true,
    forceOpen: true,
    forceClosed: false,
  }));

  return <EquipmentSimulatorClient attacker={attacker} initialCatalog={catalog} />;
}
