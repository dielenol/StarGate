import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { canEditCharacter, hasRole } from "@/lib/auth/rbac";
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

  const { id: userId, role } = session.user;
  const decision = canEditCharacter(userId, role, character);
  // 삭제는 admin(GM) 전용으로 계속 유지 — 자가삭제 도입은 별도 결정 필요.
  const canDelete = hasRole(role, "GM");

  // MongoDB ObjectId -> string 직렬화 (client 전달용)
  const serialized = JSON.parse(JSON.stringify(character)) as typeof character;

  return (
    <CharacterDetailClient
      character={serialized}
      editMode={decision.mode}
      canDelete={canDelete}
    />
  );
}
