import { redirect, notFound } from "next/navigation";
import { ObjectId } from "mongodb";

import { auth } from "@/lib/auth/config";
import { findCharacterById, listCharactersByOwner } from "@/lib/db/characters";
import { findUserById } from "@/lib/db/users";
import { getUserClearance, filterCharacterByClearance } from "@/lib/personnel";

import type { AgentLevel } from "@/types/character";

import DossierClient from "./DossierClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PersonnelDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const [character, user, ownedCharacters] = await Promise.all([
    findCharacterById(id),
    findUserById(session.user.id).catch(() => null),
    listCharactersByOwner(session.user.id).catch(() => []),
  ]);

  if (!character) notFound();

  const clearance = getUserClearance({
    userRole: session.user.role,
    securityClearance: (user?.securityClearance as AgentLevel) ?? undefined,
    characterLevels: ownedCharacters.map((c) => c.agentLevel ?? "J"),
  });

  const filtered = filterCharacterByClearance(character, clearance);
  const serialized = JSON.parse(JSON.stringify(filtered));

  return <DossierClient character={serialized} clearance={clearance} />;
}
