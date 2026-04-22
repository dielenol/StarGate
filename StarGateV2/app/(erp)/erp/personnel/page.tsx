import { redirect } from "next/navigation";

import type { Character } from "@/types/character";

import { auth } from "@/lib/auth/config";
import { listCharacters } from "@/lib/db/characters";
import { getUserClearance, filterCharacterForList } from "@/lib/personnel";

import PersonnelClient from "./PersonnelClient";

export default async function PersonnelPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const characters = await listCharacters().catch(() => []);

  const clearance = getUserClearance(session.user.role);

  // MongoDB ObjectId -> string 직렬화 (Client Component 전달용)
  const filtered = characters.map((c) => {
    const masked = filterCharacterForList(c, clearance);
    return {
      ...masked,
      _id: masked._id?.toString() ?? "",
    };
  }) as unknown as Character[];

  return (
    <PersonnelClient initialCharacters={filtered} clearance={clearance} />
  );
}
