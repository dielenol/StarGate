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

  // 본인 보유 캐릭터는 자동 GM clearance — 자기 캐릭터의 전체 정보(스탯/어빌리티/메타)는
  // 권한 등급과 무관하게 볼 수 있어야 한다 (예: J 등급 플레이어가 본인 캐릭터 스탯 확인 가능).
  const isOwnCharacter =
    character.ownerId !== null &&
    character.ownerId === session.user.id;
  const clearance = isOwnCharacter
    ? "GM"
    : getUserClearance(session.user.role);

  const filtered = filterCharacterByClearance(character, clearance);
  const serialized = JSON.parse(JSON.stringify(filtered));

  return <DossierClient character={serialized} clearance={clearance} />;
}
