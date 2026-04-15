import { useQuery } from "@tanstack/react-query";

import type { Character, CharacterType } from "@/types/character";

export const characterKeys = {
  all: ["characters"] as const,
  byType: (type: CharacterType | null) =>
    type ? (["characters", type] as const) : (["characters"] as const),
};

async function fetchCharacters(
  type?: CharacterType | null,
): Promise<Character[]> {
  const url = type
    ? `/api/erp/characters?type=${type}`
    : "/api/erp/characters";
  const res = await fetch(url);
  if (!res.ok) throw new Error("캐릭터 목록을 불러올 수 없습니다.");
  const data = await res.json();
  return data.characters;
}

export function useCharacters(
  type?: CharacterType | null,
  options?: { initialData?: Character[] },
) {
  return useQuery({
    queryKey: characterKeys.byType(type ?? null),
    queryFn: () => fetchCharacters(type),
    staleTime: 2 * 60 * 1000,
    initialData: options?.initialData,
  });
}
