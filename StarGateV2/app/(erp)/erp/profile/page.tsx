import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { listProfileCharactersByOwner } from "@/lib/db/characters";
import { findUserById } from "@/lib/db/users";

import ProfileClient, { type ProfileCharacter } from "./ProfileClient";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await findUserById(session.user.id);

  if (!user) {
    redirect("/login");
  }

  const ownedRaw = await listProfileCharactersByOwner(session.user.id).catch(
    () => [],
  );

  // ObjectId / lore 직렬화 — Client Component 전달용.
  // shared-db 계약상 previewImage / lore.name / lore.mainImage 는 required string —
  // 도큐먼트 무결성이 깨진 경우(legacy 데이터)에 대비해 빈 문자열 fallback 만 적용.
  const characters: ProfileCharacter[] = ownedRaw.map((c) => ({
    _id: c._id?.toString() ?? "",
    codename: c.codename,
    type: c.type,
    role: c.role,
    agentLevel: c.agentLevel,
    previewImage: c.previewImage ?? "",
    lore: {
      name: c.lore?.name ?? "",
      posterImage: c.lore?.posterImage,
      mainImage: c.lore?.mainImage ?? "",
    },
  }));

  return (
    <ProfileClient
      characters={characters}
      userDisplayName={user.displayName || user.username}
    />
  );
}
