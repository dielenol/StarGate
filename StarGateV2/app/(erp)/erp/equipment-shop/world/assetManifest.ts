import type { ArmoryWorldAssetKey } from "./world-zones";

const KENNEY_CITY_KIT_BASE = "/assets/equipment-shop/world/kenney-city-kit";

export const ARMORY_WORLD_ASSETS: Record<
  ArmoryWorldAssetKey,
  {
    path: string;
    label: string;
    source: string;
    license: string;
  }
> = {
  buildingA: {
    path: `${KENNEY_CITY_KIT_BASE}/building-type-a.glb`,
    label: "Kenney City Kit building A",
    source: "Kenney City Kit Suburban 2.0",
    license: "Creative Commons Zero, CC0",
  },
  buildingE: {
    path: `${KENNEY_CITY_KIT_BASE}/building-type-e.glb`,
    label: "Kenney City Kit building E",
    source: "Kenney City Kit Suburban 2.0",
    license: "Creative Commons Zero, CC0",
  },
  buildingK: {
    path: `${KENNEY_CITY_KIT_BASE}/building-type-k.glb`,
    label: "Kenney City Kit building K",
    source: "Kenney City Kit Suburban 2.0",
    license: "Creative Commons Zero, CC0",
  },
  buildingN: {
    path: `${KENNEY_CITY_KIT_BASE}/building-type-n.glb`,
    label: "Kenney City Kit building N",
    source: "Kenney City Kit Suburban 2.0",
    license: "Creative Commons Zero, CC0",
  },
  buildingR: {
    path: `${KENNEY_CITY_KIT_BASE}/building-type-r.glb`,
    label: "Kenney City Kit building R",
    source: "Kenney City Kit Suburban 2.0",
    license: "Creative Commons Zero, CC0",
  },
  buildingU: {
    path: `${KENNEY_CITY_KIT_BASE}/building-type-u.glb`,
    label: "Kenney City Kit building U",
    source: "Kenney City Kit Suburban 2.0",
    license: "Creative Commons Zero, CC0",
  },
};

export const ARMORY_WORLD_PROP_ASSETS = {
  pathLong: `${KENNEY_CITY_KIT_BASE}/path-long.glb`,
  pathShort: `${KENNEY_CITY_KIT_BASE}/path-short.glb`,
  drivewayLong: `${KENNEY_CITY_KIT_BASE}/driveway-long.glb`,
  fenceLow: `${KENNEY_CITY_KIT_BASE}/fence-low.glb`,
  planter: `${KENNEY_CITY_KIT_BASE}/planter.glb`,
  treeLarge: `${KENNEY_CITY_KIT_BASE}/tree-large.glb`,
  treeSmall: `${KENNEY_CITY_KIT_BASE}/tree-small.glb`,
} as const;

export const ARMORY_WORLD_GLB_PATHS = [
  ...Object.values(ARMORY_WORLD_ASSETS).map((asset) => asset.path),
  ...Object.values(ARMORY_WORLD_PROP_ASSETS),
] as const;
