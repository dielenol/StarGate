import type { AgentCharacter } from "@/types/character";

import { listPublicCharactersByType } from "@/lib/db/characters";

import type { AgentForView } from "./PlayerClient";

import PlayerClient from "./PlayerClient";
import agentsJson from "./data/agents.json";

/**
 * DB에서 공개 에이전트를 조회. 비어있으면 정적 JSON 폴백.
 */
async function getAgents(): Promise<AgentForView[]> {
  try {
    const dbAgents = await listPublicCharactersByType("AGENT");

    if (dbAgents.length > 0) {
      return (dbAgents as AgentCharacter[]).map((c) => ({
        id: c._id?.toString() ?? c.codename,
        codename: c.codename,
        role: c.role,
        previewImage: c.previewImage,
        pixelCharacterImage: c.pixelCharacterImage ?? "",
        warningVideo: c.warningVideo,
        sheet: c.sheet,
      }));
    }
  } catch {
    // DB 연결 실패 시 JSON 폴백
  }

  return (agentsJson as AgentForView[]).map((a) => ({
    id: a.id,
    codename: a.codename,
    role: a.role,
    previewImage: a.previewImage,
    pixelCharacterImage: a.pixelCharacterImage,
    warningVideo: a.warningVideo,
    sheet: a.sheet,
  }));
}

export default async function PlayerPage() {
  const agents = await getAgents();
  return <PlayerClient agents={agents} />;
}
