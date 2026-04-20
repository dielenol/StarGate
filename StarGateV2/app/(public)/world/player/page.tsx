import type { AgentCharacter, Character } from "@/types/character";

import { listPublicCharactersByType } from "@/lib/db/characters";

import type { AgentForView } from "./PlayerClient";

import PlayerClient from "./PlayerClient";

export const revalidate = 300;

/**
 * DB에서 공개 에이전트를 조회. 실패 시 빈 배열 반환.
 */
async function getAgents(): Promise<AgentForView[]> {
  const dbResult = await listPublicCharactersByType("AGENT").catch(
    () => [] as Character[],
  );
  const dbAgents = dbResult.filter(
    (c): c is AgentCharacter => c.type === "AGENT",
  );

  return dbAgents.map((c) => ({
    id: c._id?.toString() ?? c.codename,
    codename: c.codename,
    role: c.role,
    previewImage: c.previewImage,
    pixelCharacterImage: c.pixelCharacterImage ?? "",
    warningVideo: c.warningVideo,
    sheet: c.sheet,
  }));
}

export default async function PlayerPage() {
  const agents = await getAgents();
  return <PlayerClient agents={agents} />;
}
