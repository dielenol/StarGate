import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";

import CharacterDetailClient from "./CharacterDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CharacterDetailPage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  if (!isValidObjectId(id)) notFound();
  const character = await findCharacterById(id);

  if (!character) {
    notFound();
  }

  const { role } = session.user;
  const isGMOrAbove = hasRole(role, "GM");
  const isAdmin = hasRole(role, "ADMIN");

  // MongoDB ObjectId -> string 직렬화 (client 전달용)
  const serialized = JSON.parse(JSON.stringify(character)) as typeof character;

  return (
    <CharacterDetailClient
      character={serialized}
      canEdit={isGMOrAbove}
      canDelete={isAdmin}
    />
  );
}
