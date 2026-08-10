import { Suspense } from "react";

import { redirect } from "next/navigation";

import type { UserRole } from "@/types/user";
import type { CharacterListItemDto } from "@/hooks/queries/useCharactersQuery";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { listCharacterListItems } from "@/lib/db/characters";
import {
  filterCharacterForList,
  filterCharacterForListForGuest,
  getUserClearance,
} from "@/lib/personnel";

import ERPLoading from "../loading";

import PersonnelClient from "./PersonnelClient";

async function PersonnelBody({
  role,
  isGuest,
}: {
  role: UserRole;
  isGuest: boolean;
}) {
  const rawCharacters = await listCharacterListItems().catch(() => []);
  const clearance = getUserClearance(role);
  const isGM = hasRole(role, "GM");

  // GM 외에는 isPublic=false 캐릭터(테스트 더미 등) 숨김.
  const characters = isGM
    ? rawCharacters
    : rawCharacters.filter((c) => c.isPublic !== false);

  // MongoDB ObjectId -> string 직렬화 (Client Component 전달용)
  const filtered: CharacterListItemDto[] = characters.map((c) => {
    const masked = isGuest
      ? filterCharacterForListForGuest(c)
      : filterCharacterForList(c, clearance);
    return {
      ...masked,
      _id: masked._id?.toString() ?? "",
    };
  });

  return (
    <PersonnelClient initialCharacters={filtered} clearance={clearance} />
  );
}

export default async function PersonnelPage() {
  const session = await getActiveSession();
  if (!session?.user) redirect("/login");

  return (
    <Suspense fallback={<ERPLoading />}>
      <PersonnelBody
        role={session.user.role}
        isGuest={session.user.isGuest === true}
      />
    </Suspense>
  );
}
