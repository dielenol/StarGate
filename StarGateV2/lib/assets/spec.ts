export const PUBLIC_ASSET_FORMATS = [
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
] as const;

export type PublicAssetFormat = (typeof PUBLIC_ASSET_FORMATS)[number];
export type RasterAssetFormat = Exclude<PublicAssetFormat, "svg">;
export type CharacterAssetRole =
  | "main-image"
  | "pixel-character"
  | "pixel-profile"
  | "poster";
export type NpcCoreAssetRole =
  | "main-image"
  | "pixel-character"
  | "pixel-profile"
  | "profile";
export type CatalogAssetCategory =
  | "consumables"
  | "equipment"
  | "samples"
  | "special";
export type ShopAssetSection = "events" | "hud" | "items";

export type StarGateV2AssetSpec =
  | {
      domain: "character";
      entitySlug: string;
      role: CharacterAssetRole;
      format?: "png" | "webp";
    }
  | {
      domain: "npc";
      entitySlug: string;
      role: NpcCoreAssetRole;
      format?: "png" | "webp";
    }
  | {
      domain: "npc";
      entitySlug: string;
      role: "mood";
      variant: string;
      format?: "png" | "webp";
    }
  | {
      collection: "portraits" | "relationship";
      domain: "npc-collection";
      entitySlug: string;
      format?: "png" | "webp";
      variant: string;
    }
  | {
      category: CatalogAssetCategory;
      domain: "catalog";
      entitySlug: string;
      format?: PublicAssetFormat;
    }
  | {
      domain: "shop";
      entitySlug: string;
      format?: RasterAssetFormat;
      section: ShopAssetSection;
    }
  | {
      domain: "equipment-shop";
      entitySlug: string;
      format?: RasterAssetFormat;
      section: "rooms" | "simulator";
    }
  | {
      domain: "research";
      entitySlug: string;
      format?: RasterAssetFormat;
    }
  | {
      domain: "session-report";
      entitySlug: string;
      format?: RasterAssetFormat;
      sessionSlug: string;
    }
  | {
      domain: "wiki";
      entitySlug: string;
      format?: RasterAssetFormat;
      section: "entities" | "places";
    }
  | {
      domain: "world-view";
      entitySlug: string;
      format?: RasterAssetFormat;
    };

const PASCAL_PATH_SLUG =
  /^[A-Z0-9][A-Za-z0-9]*(?:-[A-Z0-9][A-Za-z0-9]*)*$/;
const LOWER_KEBAB_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHOP_SLUG = /^[a-z0-9]+(?:(?:-|_)[a-z0-9]+)*$/;

function assertSlug(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) {
    throw new Error(`${label} 형식이 올바르지 않습니다: ${value}`);
  }
  return value;
}

function formatExtension(format: PublicAssetFormat | undefined): string {
  return format ?? "webp";
}

/**
 * StarGateV2에서 실제로 소비하는 public URL을 계산한다.
 * 생성 방식(cutout, Maria style 등)은 경로에 넣지 않고 엔티티와 UI 역할만 사용한다.
 */
export function buildStarGateV2AssetPath(
  spec: StarGateV2AssetSpec,
): `/assets/${string}` {
  const extension = formatExtension(spec.format);

  switch (spec.domain) {
    case "character": {
      const slug = assertSlug(
        spec.entitySlug,
        PASCAL_PATH_SLUG,
        "character entitySlug",
      );
      return `/assets/peoples/${slug}-${spec.role}.${extension}`;
    }
    case "npc": {
      const slug = assertSlug(
        spec.entitySlug,
        PASCAL_PATH_SLUG,
        "npc entitySlug",
      );
      const role =
        spec.role === "mood"
          ? assertSlug(spec.variant, LOWER_KEBAB_SLUG, "npc mood variant")
          : spec.role;
      return `/assets/npcs/${slug}-${role}.${extension}`;
    }
    case "npc-collection": {
      const slug = assertSlug(
        spec.entitySlug,
        LOWER_KEBAB_SLUG,
        "npc collection entitySlug",
      );
      const variant = assertSlug(
        spec.variant,
        LOWER_KEBAB_SLUG,
        "npc collection variant",
      );
      return `/assets/npcs/${slug}/${spec.collection}/${variant}.${extension}`;
    }
    case "catalog": {
      const slug = assertSlug(
        spec.entitySlug,
        LOWER_KEBAB_SLUG,
        "catalog entitySlug",
      );
      return `/assets/catalog/${spec.category}/${slug}.${extension}`;
    }
    case "shop": {
      const slug = assertSlug(spec.entitySlug, SHOP_SLUG, "shop entitySlug");
      return `/assets/shop/${spec.section}/${slug}.${extension}`;
    }
    case "equipment-shop": {
      const slug = assertSlug(
        spec.entitySlug,
        LOWER_KEBAB_SLUG,
        "equipment-shop entitySlug",
      );
      return `/assets/equipment-shop/${spec.section}/${slug}.${extension}`;
    }
    case "research": {
      const slug = assertSlug(
        spec.entitySlug,
        LOWER_KEBAB_SLUG,
        "research entitySlug",
      );
      return `/assets/research/${slug}.${extension}`;
    }
    case "session-report": {
      const sessionSlug = assertSlug(
        spec.sessionSlug,
        LOWER_KEBAB_SLUG,
        "session-report sessionSlug",
      );
      const slug = assertSlug(
        spec.entitySlug,
        LOWER_KEBAB_SLUG,
        "session-report entitySlug",
      );
      return `/assets/session-reports/${sessionSlug}/${slug}.${extension}`;
    }
    case "wiki": {
      const slug = assertSlug(
        spec.entitySlug,
        LOWER_KEBAB_SLUG,
        "wiki entitySlug",
      );
      return `/assets/wiki/${spec.section}/${slug}.${extension}`;
    }
    case "world-view": {
      const slug = assertSlug(
        spec.entitySlug,
        LOWER_KEBAB_SLUG,
        "world-view entitySlug",
      );
      return `/assets/world-view/${slug}.${extension}`;
    }
  }
}

export function withPublicAssetVersion(
  assetPath: `/assets/${string}`,
  version: string,
): `${typeof assetPath}?v=${string}` {
  const normalizedVersion = version.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(normalizedVersion)) {
    throw new Error(`asset version 형식이 올바르지 않습니다: ${version}`);
  }
  return `${assetPath}?v=${normalizedVersion}`;
}
