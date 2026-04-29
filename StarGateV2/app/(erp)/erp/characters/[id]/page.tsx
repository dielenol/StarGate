import { notFound, redirect } from "next/navigation";

import type { AgentCharacter } from "@/types/character";

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

  /**
   * Phase 3 — `/erp/characters` 라우트는 AGENT 전용. NPC 직접 접근 시 personnel dossier 로 redirect.
   * personnel dossier 는 lore-only readonly 라 게임 시트 노출이 없고, character 페이지의 PATCH/DELETE
   * 권한 체크와 무관한 경로다.
   */
  if (character.type === "NPC") {
    redirect(`/erp/personnel/${id}`);
  }

  const { id: userId, role } = session.user;
  const decision = canEditCharacter(userId, role, character);
  // 삭제는 admin(GM) 전용으로 계속 유지 — 자가삭제 도입은 별도 결정 필요.
  const canDelete = hasRole(role, "GM");

  /**
   * P8 — 변경 이력 패널 권한 결정. **GM 전용** (owner readonly 경로 폐지).
   *
   * - GM 한정 'gm' (revert + 삭제 가능). V+ 더라도 GM 미만이면 'none'.
   * - 그 외는 패널 자체를 숨기는 'none'.
   *
   * 권한 결정은 서버에서만. 클라이언트는 prop 그대로 사용 → drift 방지.
   * (서버 API 도 동일 게이트로 가드되므로 prop 변조해도 데이터 누출 X)
   */
  const changeLogsMode: ChangeLogsPanelMode = hasRole(role, "GM")
    ? "gm"
    : "none";

  // MongoDB ObjectId -> string 직렬화 (client 전달용). 위 type guard 로 AgentCharacter 확정.
  const serialized = JSON.parse(JSON.stringify(character)) as AgentCharacter;

  return (
    <CharacterDetailClient
      character={serialized}
      editMode={decision.mode}
      canDelete={canDelete}
      changeLogsMode={changeLogsMode}
      isGM={hasRole(role, "GM")}
    />
  );
}
