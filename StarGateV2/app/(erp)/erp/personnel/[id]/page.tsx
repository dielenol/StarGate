import { redirect, notFound } from "next/navigation";
import { ObjectId } from "mongodb";

import { auth } from "@/lib/auth/config";
import { findCharacterById } from "@/lib/db/characters";
import { getUserClearance, filterCharacterByClearance } from "@/lib/personnel";

import DossierClient from "./DossierClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PersonnelDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const character = await findCharacterById(id);

  if (!character) notFound();

  const clearance = getUserClearance(session.user.role);

  const filtered = filterCharacterByClearance(character, clearance);
  const serialized = JSON.parse(JSON.stringify(filtered));

  return <DossierClient character={serialized} clearance={clearance} />;
}
