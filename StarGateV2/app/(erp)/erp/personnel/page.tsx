import { redirect } from "next/navigation";

import type { AgentLevel } from "@/types/character";

import { auth } from "@/lib/auth/config";
import { listCharacters } from "@/lib/db/characters";
import { findUserById } from "@/lib/db/users";
import { getUserClearance, filterCharacterForList } from "@/lib/personnel";

import PersonnelClient from "./PersonnelClient";

export default async function PersonnelPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [characters, user] = await Promise.all([
    listCharacters().catch(() => []),
    findUserById(session.user.id).catch(() => null),
  ]);

  const ownedCharacters = characters.filter(
    (c) => c.ownerId === session.user.id,
  );

  const clearance = getUserClearance({
    userRole: session.user.role,
    securityClearance: (user?.securityClearance as AgentLevel) ?? undefined,
    characterLevels: ownedCharacters.map((c) => c.agentLevel ?? "J"),
  });

  const filtered = characters.map((c) => filterCharacterForList(c, clearance));

  return (
    <PersonnelClient initialCharacters={filtered} clearance={clearance} />
  );
}
