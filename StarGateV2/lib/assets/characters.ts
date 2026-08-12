import {
  buildStarGateV2AssetPath,
  type CharacterAssetRole,
} from "./spec.ts";

/** 핵심 WebP 3종을 모두 갖춘 플레이어블 캐릭터 슬러그. */
export const KNOWN_CHARACTER_ASSET_SLUGS = [
  "Accel",
  "BigBoy",
  "Clown",
  "Cronus",
  "InDexer",
  "Kimlee",
  "Leedongsik",
  "Malcolm",
  "Margaret",
  "Maria",
  "NeBeD",
  "Otilia",
  "Pinch",
  "Siyu",
  "WD",
  "Unyeon",
  "Valeria",
  "Yuhoe",
] as const;

export type CharacterAssetSlug = (typeof KNOWN_CHARACTER_ASSET_SLUGS)[number];

/** codename(DB) → 디스크 슬러그 명시 매핑. 정규화로 안 맞는 케이스만 등재한다. */
const EXPLICIT_CODENAME_TO_SLUG = {
  AEGIS: "Valeria",
  TIME: "Cronus",
  PIPETTE: "Pinch",
  TIGER298: "Siyu",
  "WD-(𝓃)": "WD",
  UNYEON: "Unyeon",
  YUHOE: "Yuhoe",
  네베드: "NeBeD",
} as const satisfies Record<string, CharacterAssetSlug>;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s\-_]+/g, "");
}

export function resolveCharacterAssetSlug(
  codename: string,
): CharacterAssetSlug | null {
  if (!codename) return null;
  const explicit =
    EXPLICIT_CODENAME_TO_SLUG[
      codename as keyof typeof EXPLICIT_CODENAME_TO_SLUG
    ];
  if (explicit) return explicit;
  const normalizedCodename = normalize(codename);
  return (
    KNOWN_CHARACTER_ASSET_SLUGS.find(
      (slug) => normalize(slug) === normalizedCodename,
    ) ?? null
  );
}

export function getCharacterAssetPath(
  codename: string,
  role: CharacterAssetRole,
): `/assets/${string}` | null {
  const entitySlug = resolveCharacterAssetSlug(codename);
  return entitySlug
    ? buildStarGateV2AssetPath({ domain: "character", entitySlug, role })
    : null;
}

export function getPixelCharacterPath(
  codename: string,
): `/assets/${string}` | null {
  return getCharacterAssetPath(codename, "pixel-character");
}

export function getPixelProfilePath(
  codename: string,
): `/assets/${string}` | null {
  return getCharacterAssetPath(codename, "pixel-profile");
}
