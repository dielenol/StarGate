import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { canEditCharacter, hasRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";

import type { ChangeLogsPanelMode } from "./ChangeLogsPanel";
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

  /**
   * P8 — 변경 이력 패널 권한 결정.
   *
   * - GM 한정 'gm' (revert 가능). V+ 더라도 GM 미만이면 'gm' 모드 아님.
   * - 'gm' 미해당이면서 본인 소유 캐릭터면 readonly 'owner'.
   * - 그 외는 패널 자체를 숨기는 'none'.
   *
   * 권한 결정은 서버에서만. 클라이언트는 prop 그대로 사용 → drift 방지.
   * (서버 API 도 동일 게이트로 가드되므로 prop 변조해도 데이터 누출 X)
   */
  let changeLogsMode: ChangeLogsPanelMode = "none";
  if (hasRole(role, "GM")) {
    changeLogsMode = "gm";
  } else if (character.ownerId && character.ownerId === userId) {
    changeLogsMode = "owner";
  }

  // MongoDB ObjectId -> string 직렬화 (client 전달용)
  const serialized = JSON.parse(JSON.stringify(character)) as typeof character;

  return (
    <CharacterDetailClient
      character={serialized}
      editMode={decision.mode}
      canDelete={canDelete}
      changeLogsMode={changeLogsMode}
    />
  );
}
