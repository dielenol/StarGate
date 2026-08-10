import { findMainCharacterByOwnerCached as findMainCharacterByOwner } from "@/lib/db/characters";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { listCharacterInventoryEntries } from "@/lib/db/inventory";
import {
  getSimulatorEquippedWeapons,
  type SimulatorAttackerProfile,
  type SimulatorEquippedWeapon,
} from "@/lib/equipment-shop/simulator";
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

function simulatorStat(base: number, delta?: number): number {
  return Math.max(0, Math.trunc((Number(base) || 0) + (Number(delta) || 0)));
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
    def: 0,
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
  let mainCharacterId: string | null = null;
  try {
    const ownerId = getOwnedDataViewerId(session.user);
    const mainCharacter = ownerId
      ? await findMainCharacterByOwner(ownerId)
      : null;
    mainCharacterId = mainCharacter?._id ? String(mainCharacter._id) : null;
    if (mainCharacter?.type === "AGENT") {
      attacker = {
        codename: mainCharacter.codename,
        atk: simulatorStat(
          mainCharacter.play.atk,
          mainCharacter.play.atkDelta,
        ),
        def: simulatorStat(
          mainCharacter.play.def,
          mainCharacter.play.defDelta,
        ),
        hp: simulatorStat(
          mainCharacter.play.hp,
          mainCharacter.play.hpDelta,
        ),
        san: simulatorStat(
          mainCharacter.play.san,
          mainCharacter.play.sanDelta,
        ),
        ...simulatorCharacterAssets(mainCharacter),
        source: "agent",
      };
    } else if (mainCharacter) {
      attacker = {
        codename: mainCharacter.codename,
        atk: attacker.atk,
        def: attacker.def,
        hp: attacker.hp,
        san: attacker.san,
        ...simulatorCharacterAssets(mainCharacter),
        source: "sandbox",
      };
    }
  } catch (err) {
    console.error("[equipment-simulator] failed to load main character", err);
  }

  const [catalog, equippedWeapons] = await Promise.all([
    buildEquipmentShopCatalogResponse().catch(() => ({
      items: [],
      recentActivity: [],
      isOpen: true,
      mode: "open" as const,
      scheduledOpen: true,
      forceOpen: true,
      forceClosed: false,
    })),
    mainCharacterId
      ? listCharacterInventoryEntries(mainCharacterId)
          .then(({ entries }) => getSimulatorEquippedWeapons(entries))
          .catch((err) => {
            console.error(
              "[equipment-simulator] failed to load equipped weapons",
              err,
            );
            return [] as SimulatorEquippedWeapon[];
          })
      : Promise.resolve<SimulatorEquippedWeapon[]>([]),
  ]);

  return (
    <EquipmentSimulatorClient
      attacker={attacker}
      equippedWeapons={equippedWeapons}
      initialCatalog={catalog}
    />
  );
}
