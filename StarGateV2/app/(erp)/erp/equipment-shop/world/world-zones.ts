export type ArmoryWorldZoneKey =
  | "towaski"
  | "acheron"
  | "lab"
  | "simulator"
  | "strategic"
  | "custom";

export type ArmoryWorldAssetKey =
  | "buildingA"
  | "buildingE"
  | "buildingK"
  | "buildingN"
  | "buildingR"
  | "buildingU";

export interface ArmoryWorldPoint {
  x: number;
  z: number;
}

export interface ArmoryWorldZone {
  key: ArmoryWorldZoneKey;
  eyebrow: string;
  title: string;
  href: string;
  color: string;
  accent: string;
  position: ArmoryWorldPoint;
  approach: ArmoryWorldPoint;
  npcPosition: ArmoryWorldPoint;
  radius: number;
  assetKey: ArmoryWorldAssetKey;
  modelScale: number;
  modelRotation: number;
  npc: string;
  status: string;
  detail: string;
}

export interface ArmoryMoveRequest {
  id: number;
  target: ArmoryWorldPoint;
}

export interface ArmoryTravelRequest {
  id: number;
  zoneKey: ArmoryWorldZoneKey;
}

export const ARMORY_WORLD_BOUNDS = {
  minX: -8.8,
  maxX: 8.8,
  minZ: -6.2,
  maxZ: 6.4,
} as const;

export const ARMORY_PLAYER_START: ArmoryWorldPoint = {
  x: 0,
  z: 1.35,
};

export const DEFAULT_ARMORY_WORLD_ZONE: ArmoryWorldZoneKey = "towaski";

export const ARMORY_WORLD_ZONES: ArmoryWorldZone[] = [
  {
    key: "towaski",
    eyebrow: "TOWASKI",
    title: "토와스키 건샵",
    href: "/erp/equipment-shop/towaski",
    color: "#c9a85a",
    accent: "#f0d486",
    position: { x: -5.45, z: -0.85 },
    approach: { x: -4.15, z: 0.4 },
    npcPosition: { x: -4.65, z: 0.85 },
    radius: 1.55,
    assetKey: "buildingA",
    modelScale: 0.78,
    modelRotation: Math.PI / 2,
    npc: "립 토와스키",
    status: "표준 화기 반출",
    detail: "총기 진열 격납고에서 화기와 방어구 카탈로그를 확인합니다.",
  },
  {
    key: "acheron",
    eyebrow: "ACHERON",
    title: "아케론 대장간",
    href: "/erp/equipment-shop/acheron",
    color: "#d46b4a",
    accent: "#ffb08d",
    position: { x: 5.35, z: -0.95 },
    approach: { x: 4.0, z: 0.35 },
    npcPosition: { x: 4.55, z: 0.95 },
    radius: 1.55,
    assetKey: "buildingE",
    modelScale: 0.76,
    modelRotation: -Math.PI / 2,
    npc: "아케론 관리관",
    status: "냉병기 제작",
    detail: "용광로와 작업대에서 근접무기 제작 구역으로 진입합니다.",
  },
  {
    key: "lab",
    eyebrow: "LAB",
    title: "신체증강 연구소",
    href: "/erp/equipment-shop/lab",
    color: "#62bfd2",
    accent: "#a8efff",
    position: { x: -4.2, z: -4.2 },
    approach: { x: -2.95, z: -3.15 },
    npcPosition: { x: -3.48, z: -2.65 },
    radius: 1.65,
    assetKey: "buildingK",
    modelScale: 0.82,
    modelRotation: Math.PI / 2,
    npc: "연구 담당관",
    status: "강화 연구",
    detail: "개인 연구와 팀 연구 테크트리를 장기 프로젝트로 관리합니다.",
  },
  {
    key: "simulator",
    eyebrow: "RANGE",
    title: "훈련장",
    href: "/erp/equipment-shop/simulator",
    color: "#78b05a",
    accent: "#c4f28a",
    position: { x: 1.25, z: 4.55 },
    approach: { x: 0.55, z: 3.2 },
    npcPosition: { x: 0.1, z: 3.75 },
    radius: 1.6,
    assetKey: "buildingN",
    modelScale: 0.72,
    modelRotation: Math.PI,
    npc: "시험장 관제관",
    status: "장비 시험",
    detail: "표적 타워와 탄도 패널로 보급형 장비 흐름을 시뮬레이션합니다.",
  },
  {
    key: "strategic",
    eyebrow: "STRATEGIC",
    title: "전략 장비 보급소",
    href: "/erp/equipment-shop/strategic",
    color: "#8a80d6",
    accent: "#c0b9ff",
    position: { x: 4.75, z: -4.15 },
    approach: { x: 3.25, z: -3.25 },
    npcPosition: { x: 3.75, z: -2.72 },
    radius: 1.7,
    assetKey: "buildingR",
    modelScale: 0.78,
    modelRotation: -Math.PI / 2,
    npc: "전략 물자 담당관",
    status: "전략 물자",
    detail: "차량 패드, 레이더, 작전급 장비 후보를 확인합니다.",
  },
  {
    key: "custom",
    eyebrow: "CUSTOM",
    title: "공방",
    href: "/erp/equipment-shop/custom",
    color: "#d9d3bd",
    accent: "#fff3c2",
    position: { x: -3.15, z: 4.35 },
    approach: { x: -2.2, z: 3.0 },
    npcPosition: { x: -2.85, z: 3.35 },
    radius: 1.55,
    assetKey: "buildingU",
    modelScale: 0.72,
    modelRotation: Math.PI,
    npc: "제작 담당관",
    status: "제작 의뢰",
    detail: "홀로그램 제작대에서 캐릭터 전용무기 의뢰로 이동합니다.",
  },
];

export function clampArmoryPoint(point: ArmoryWorldPoint): ArmoryWorldPoint {
  return {
    x: Math.min(ARMORY_WORLD_BOUNDS.maxX, Math.max(ARMORY_WORLD_BOUNDS.minX, point.x)),
    z: Math.min(ARMORY_WORLD_BOUNDS.maxZ, Math.max(ARMORY_WORLD_BOUNDS.minZ, point.z)),
  };
}

export function getArmoryWorldZone(key: ArmoryWorldZoneKey): ArmoryWorldZone {
  return (
    ARMORY_WORLD_ZONES.find((zone) => zone.key === key) ??
    ARMORY_WORLD_ZONES[0]
  );
}

export function getArmoryZoneAtPoint(
  point: ArmoryWorldPoint,
): ArmoryWorldZone | null {
  return (
    ARMORY_WORLD_ZONES.find((zone) => {
      const dx = point.x - zone.approach.x;
      const dz = point.z - zone.approach.z;
      return Math.hypot(dx, dz) <= zone.radius;
    }) ?? null
  );
}
