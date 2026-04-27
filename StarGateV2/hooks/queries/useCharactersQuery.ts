import { useQuery } from "@tanstack/react-query";

import type {
  AgentCharacter,
  Character,
  CharacterTier,
} from "@/types/character";

export type AgentTierFilter = CharacterTier | "ALL";

/**
 * 캐시 키 매트릭스 (Phase 4)
 *
 *  ["characters"]                      — 호환 root 키. 모든 invalidate 의 prefix.
 *  ["characters", "agent"]             — `/erp/characters` AGENT 카탈로그 root
 *  ["characters", "agent", tier]       — tier 별 AGENT 카탈로그
 *  ["characters", "agent", "id", id]   — 개별 AGENT detail
 *  ["personnel"]                       — `/erp/personnel` 마스킹 카탈로그
 *  ["personnel", id]                   — 개별 dossier
 */

export const characterKeys = {
  /** prefix invalidate 용 root — agent / personnel 모두 무효화. */
  all: ["characters"] as const,
  agent: {
    all: ["characters", "agent"] as const,
    byTier: (tier: AgentTierFilter) =>
      ["characters", "agent", tier] as const,
    byId: (id: string) => ["characters", "agent", "id", id] as const,
  },
  /** 호환 — 기존 호출처(byTier) 가 그대로 동작하도록 alias 유지. */
  byTier: (tier: AgentTierFilter) =>
    ["characters", "agent", tier] as const,
} as const;

export const personnelKeys = {
  all: ["personnel"] as const,
  byId: (id: string) => ["personnel", id] as const,
} as const;

/* ── Fetchers ── */

async function fetchAgentCharacters(
  tier: AgentTierFilter,
): Promise<Character[]> {
  const res = await fetch(`/api/erp/characters?tier=${tier}`);
  if (!res.ok) throw new Error("캐릭터 목록을 불러올 수 없습니다.");
  const data = await res.json();
  return data.characters;
}

async function fetchAgentCharacterById(id: string): Promise<AgentCharacter> {
  const res = await fetch(`/api/erp/characters/${id}`);
  if (!res.ok) throw new Error("캐릭터를 불러올 수 없습니다.");
  const data = await res.json();
  return data.character as AgentCharacter;
}

async function fetchPersonnelCharacters(): Promise<Character[]> {
  const res = await fetch("/api/erp/personnel");
  if (!res.ok) throw new Error("신원조회 목록을 불러올 수 없습니다.");
  const data = await res.json();
  return data.characters;
}

async function fetchPersonnelCharacterById(id: string): Promise<Character> {
  const res = await fetch(`/api/erp/personnel/${id}`);
  if (!res.ok) throw new Error("dossier 를 불러올 수 없습니다.");
  const data = await res.json();
  return data.character as Character;
}

/* ── Hooks ── */

/** AGENT 캐릭터 카탈로그 — `/erp/characters` 카탈로그에서 사용. */
export function useAgentCharactersQuery(
  tier: AgentTierFilter,
  options?: { initialData?: Character[] },
) {
  return useQuery({
    queryKey: characterKeys.agent.byTier(tier),
    queryFn: () => fetchAgentCharacters(tier),
    staleTime: 2 * 60 * 1000,
    initialData: options?.initialData,
  });
}

/** 개별 AGENT 캐릭터 detail. */
export function useAgentCharacterQuery(
  id: string,
  options?: { initialData?: AgentCharacter; enabled?: boolean },
) {
  return useQuery({
    queryKey: characterKeys.agent.byId(id),
    queryFn: () => fetchAgentCharacterById(id),
    staleTime: 2 * 60 * 1000,
    initialData: options?.initialData,
    enabled: options?.enabled ?? true,
  });
}

/** Personnel 카탈로그 — AGENT + NPC + lore 마스킹 결과. */
export function usePersonnelQuery(options?: { initialData?: Character[] }) {
  return useQuery({
    queryKey: personnelKeys.all,
    queryFn: fetchPersonnelCharacters,
    staleTime: 2 * 60 * 1000,
    initialData: options?.initialData,
  });
}

/** 개별 Personnel dossier. */
export function usePersonnelByIdQuery(
  id: string,
  options?: { initialData?: Character; enabled?: boolean },
) {
  return useQuery({
    queryKey: personnelKeys.byId(id),
    queryFn: () => fetchPersonnelCharacterById(id),
    staleTime: 2 * 60 * 1000,
    initialData: options?.initialData,
    enabled: options?.enabled ?? true,
  });
}
