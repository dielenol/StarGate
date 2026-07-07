export type ArmoryWorldZoneKey =
  | "towaski"
  | "acheron"
  | "lab"
  | "simulator"
  | "strategic"
  | "custom";

export interface ArmoryWorldZone {
  key: ArmoryWorldZoneKey;
  eyebrow: string;
  title: string;
  href: string;
  color: string;
  accent: string;
  position: [number, number, number];
  footprint: [number, number];
  npc: string;
  status: string;
  detail: string;
}

export const DEFAULT_ARMORY_WORLD_ZONE: ArmoryWorldZoneKey = "towaski";

export const ARMORY_WORLD_ZONES: ArmoryWorldZone[] = [
  {
    key: "towaski",
    eyebrow: "TOWASKI",
    title: "토와스키 건샵",
    href: "/erp/equipment-shop/towaski",
    color: "#c9a85a",
    accent: "#f0d486",
    position: [-3.8, 0, 0.8],
    footprint: [1.65, 1.25],
    npc: "립 토와스키",
    status: "표준 화기 반출",
    detail: "화기와 방어구 카탈로그를 열람하고 크레딧으로 즉시 반출합니다.",
  },
  {
    key: "acheron",
    eyebrow: "ACHERON",
    title: "아케론 대장간",
    href: "/erp/equipment-shop/acheron",
    color: "#d46b4a",
    accent: "#ffb08d",
    position: [3.8, 0, 0.9],
    footprint: [1.55, 1.35],
    npc: "아케론 관리관",
    status: "냉병기 제작",
    detail: "근접무기와 냉병기류를 별도 대장간 카탈로그에서 반출합니다.",
  },
  {
    key: "lab",
    eyebrow: "LAB",
    title: "신체증강 연구소",
    href: "/erp/equipment-shop/lab",
    color: "#62bfd2",
    accent: "#a8efff",
    position: [-1.8, 0, -2.7],
    footprint: [1.5, 1.15],
    npc: "연구 담당관",
    status: "강화 연구",
    detail: "개인 연구와 팀 연구 테크트리를 확인하고 장기 연구를 진행합니다.",
  },
  {
    key: "simulator",
    eyebrow: "RANGE",
    title: "장비 시뮬레이터",
    href: "/erp/equipment-shop/simulator",
    color: "#78b05a",
    accent: "#c4f28a",
    position: [1.8, 0, 2.9],
    footprint: [1.7, 1.1],
    npc: "시험장 관제관",
    status: "장비 시험",
    detail: "보급형 장비의 사거리, 탄환 운용, 공격 흐름을 시뮬레이션합니다.",
  },
  {
    key: "strategic",
    eyebrow: "STRATEGIC",
    title: "전략 장비 판매점",
    href: "/erp/equipment-shop/strategic",
    color: "#8a80d6",
    accent: "#c0b9ff",
    position: [2.6, 0, -2.55],
    footprint: [1.55, 1.15],
    npc: "전략 물자 담당관",
    status: "전략 물자",
    detail: "차량, 전투보조, 작전급 장비 후보를 확인합니다.",
  },
  {
    key: "custom",
    eyebrow: "CUSTOM",
    title: "전용무기 제작소",
    href: "/erp/equipment-shop/custom",
    color: "#d9d3bd",
    accent: "#fff3c2",
    position: [-2.4, 0, 2.75],
    footprint: [1.5, 1.05],
    npc: "제작 담당관",
    status: "제작 의뢰",
    detail: "캐릭터 전용무기 제작 요청과 상담형 의뢰를 관리합니다.",
  },
];

export function getArmoryWorldZone(key: ArmoryWorldZoneKey): ArmoryWorldZone {
  return (
    ARMORY_WORLD_ZONES.find((zone) => zone.key === key) ??
    ARMORY_WORLD_ZONES[0]
  );
}
