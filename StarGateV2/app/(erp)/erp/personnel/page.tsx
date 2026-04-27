import { Suspense } from "react";

import { redirect } from "next/navigation";

import type { Character } from "@/types/character";
import type { UserRole } from "@/types/user";

import { auth } from "@/lib/auth/config";
import { listCharacters } from "@/lib/db/characters";
import { getUserClearance, filterCharacterByClearance } from "@/lib/personnel";

import ERPLoading from "../loading";

import PersonnelClient from "./PersonnelClient";

async function PersonnelBody({ role }: { role: UserRole }) {
  const characters = await listCharacters().catch(() => []);
  const clearance = getUserClearance(role);

  // MongoDB ObjectId -> string 직렬화 (Client Component 전달용)
  const filtered = characters.map((c) => {
    const masked = filterCharacterByClearance(c, clearance);
    return {
      ...masked,
      _id: masked._id?.toString() ?? "",
    };
  }) as unknown as Character[];

  return (
    <PersonnelClient initialCharacters={filtered} clearance={clearance} />
  );
}

export default async function PersonnelPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Suspense fallback={<ERPLoading />}>
      <PersonnelBody role={session.user.role} />
    </Suspense>
  );
}
