import type { Character } from "@/types/character";
import type { PublicAgentSummary } from "@/types/public-player";

import { listPublicCharactersByType } from "@/lib/db/characters";
import {
  isPublicAgentWithSheet,
  toPublicAgentSummary,
} from "@/lib/public-player";

import PlayerClient from "./PlayerClient";

export const revalidate = 300;

async function getAgents(): Promise<PublicAgentSummary[]> {
  const dbResult = await listPublicCharactersByType("AGENT").catch(
    () => [] as Character[],
  );

  return dbResult.filter(isPublicAgentWithSheet).map(toPublicAgentSummary);
}

export default async function PlayerPage() {
  const agents = await getAgents();
  return <PlayerClient agents={agents} />;
}
