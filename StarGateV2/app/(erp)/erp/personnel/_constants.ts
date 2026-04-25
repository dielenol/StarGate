import type { AgentLevel } from "@/types/character";

/* ── 세력/기관 보조 메타데이터 ──
   FACTIONS/INSTITUTIONS 기본 스키마(`shared-db`)에는 code/label/labelEn 만 있어
   UI 전용 추가 정보(교리·워터마크 로고·감독 영역)는 여기 로컬에 둔다.
   OrgCanvas(L1) 와 GroupHero(L2) 에서 공유. */

export const FACTION_LOGO: Record<string, string> = {
  COUNCIL: "/assets/faction/world_council_logo.webp",
  MILITARY: "/assets/faction/military_logo.webp",
  CIVIL: "/assets/faction/civil_society_logo.webp",
};

export const FACTION_DOCTRINE: Record<string, string> = {
  COUNCIL: "최고 의결 · 3권 균형 감시",
  MILITARY: "무력 통제 · 외적 방위",
  CIVIL: "시민 대표 · 사회 기반",
};

export const INSTITUTION_LOGO = "/assets/StarGate_logo_watermark.webp";

export const INSTITUTION_DOCTRINE: Record<string, string> = {
  SECRETARIAT: "의회 운영 · 행정 총괄",
  FINANCE: "재정 감독 · 자산 관리",
};

export const INSTITUTION_OVERSIGHT: Record<string, string | undefined> = {
  FINANCE: "예산 · 감사 · 조달",
};

/** DISTRIBUTION 분포 표기 순서 (상위 → 하위) */
export const LEVEL_ORDER: AgentLevel[] = ["V", "A", "M", "H", "G", "J", "U"];
