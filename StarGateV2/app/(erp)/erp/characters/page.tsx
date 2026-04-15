import { redirect } from "next/navigation";

import type { CharacterType } from "@/types/character";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  listCharacters,
  listCharactersByType,
} from "@/lib/db/characters";

import CharactersClient from "./CharactersClient";

const VALID_TYPES: CharacterType[] = ["AGENT", "NPC"];

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function CharactersPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  const isGMOrAbove = hasRole(role, "GM");

  const params = await searchParams;
  const typeFilter =
    params.type && VALID_TYPES.includes(params.type as CharacterType)
      ? (params.type as CharacterType)
      : null;

  const characters = await (typeFilter
    ? listCharactersByType(typeFilter)
    : listCharacters()
  ).catch(() => []);

  return (
    <CharactersClient
      initialCharacters={characters}
      typeFilter={typeFilter}
      isGMOrAbove={isGMOrAbove}
    />
  );
}
