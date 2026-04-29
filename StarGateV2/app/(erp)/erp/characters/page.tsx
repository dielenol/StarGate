import { redirect } from "next/navigation";

import type { Character, CharacterTier } from "@/types/character";
import { CHARACTER_TIERS } from "@/types/character";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listAgentCharacters } from "@/lib/db/characters";

import CharactersClient from "./CharactersClient";

interface PageProps {
  searchParams: Promise<{ tier?: string }>;
}

export default async function CharactersPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  const isGMOrAbove = hasRole(role, "V");

  const params = await searchParams;
  const tierFilter: CharacterTier | null =
    params.tier &&
    (CHARACTER_TIERS as readonly string[]).includes(params.tier)
      ? (params.tier as CharacterTier)
      : null;

  // 카탈로그 탭 카운트(ALL/MAIN/MINI)를 정확히 계산하려면 항상 전체 fetch.
  // tier 필터는 CharactersClient 가 클라이언트 측 표시 필터로 처리.
  const characters = await listAgentCharacters(null).catch(() => []);

  // MongoDB ObjectId -> string 직렬화 (Client Component 전달용)
  const serializedCharacters = characters.map((c) => ({
    ...c,
    _id: c._id?.toString() ?? "",
  })) as unknown as Character[];

  return (
    <CharactersClient
      initialCharacters={serializedCharacters}
      tierFilter={tierFilter}
      isGMOrAbove={isGMOrAbove}
    />
  );
}
