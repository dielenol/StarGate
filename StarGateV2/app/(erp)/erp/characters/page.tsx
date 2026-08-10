import { redirect } from "next/navigation";

import type { CharacterTier } from "@/types/character";
import { CHARACTER_TIERS } from "@/types/character";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { listAgentCharacterCards } from "@/lib/db/characters";
import {
  filterAgentCharacterCardForClient,
  filterAgentCharacterCardForGuest,
} from "@/lib/personnel";

import CharactersClient from "./CharactersClient";

interface PageProps {
  searchParams: Promise<{ tier?: string; q?: string }>;
}

export default async function CharactersPage({ searchParams }: PageProps) {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  const isGMOrAbove = hasRole(role, "V");
  const isGM = hasRole(role, "GM");

  const params = await searchParams;
  const tierFilter: CharacterTier | null =
    params.tier &&
    (CHARACTER_TIERS as readonly string[]).includes(params.tier)
      ? (params.tier as CharacterTier)
      : null;
  const searchQuery = typeof params.q === "string" ? params.q : "";

  // 카탈로그 탭 카운트(ALL/MAIN/MINI)를 정확히 계산하려면 항상 전체 fetch.
  // tier 필터는 CharactersClient 가 클라이언트 측 표시 필터로 처리.
  const rawCharacters = await listAgentCharacterCards(null).catch(() => []);

  // GM 외에는 isPublic=false 캐릭터(테스트 더미 등) 숨김.
  let characters = isGM
    ? rawCharacters
    : rawCharacters.filter((c) => c.isPublic !== false);
  characters = characters.map((character) =>
    session.user.isGuest
      ? filterAgentCharacterCardForGuest(character)
      : filterAgentCharacterCardForClient(character),
  );

  // MongoDB ObjectId -> string 직렬화 (Client Component 전달용)
  const serializedCharacters = characters.map((c) => ({
    ...c,
    _id: c._id?.toString() ?? "",
  }));

  return (
    <CharactersClient
      initialCharacters={serializedCharacters}
      tierFilter={tierFilter}
      initialSearchQuery={searchQuery}
      isGMOrAbove={isGMOrAbove}
      canToggleGmTestCharacters={isGM}
      viewerUserId={session.user.id}
    />
  );
}
