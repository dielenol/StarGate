import type { PublicAgentSheet, PublicAgentSummary } from "@/types/public-player";

import { listPublicCharactersByType } from "@/lib/db/characters";
import { listCharacterInventoryEntries } from "@/lib/db/inventory";
import {
  isPublicAgentWithSheet,
  toPublicAgentDetail,
  toPublicAgentSummary,
} from "@/lib/public-player";

import PlayerClient from "./PlayerClient";

export const revalidate = 300;

async function getAgents(): Promise<{
  agents: PublicAgentSummary[];
  initialAgentId: string;
  initialSheet?: PublicAgentSheet;
}> {
  const dbResult = await listPublicCharactersByType("AGENT");
  const publicAgents = dbResult.filter(isPublicAgentWithSheet);
  const selected = publicAgents[0];
  const selectedInventory = selected?._id
    ? await listCharacterInventoryEntries(String(selected._id))
    : null;

  return {
    agents: publicAgents.map(toPublicAgentSummary),
    initialAgentId: selected?._id?.toString() ?? "",
    initialSheet: selected
      ? toPublicAgentDetail(selected, selectedInventory?.entries).sheet
      : undefined,
  };
}

export default async function PlayerPage() {
  const data = await getAgents();
  return <PlayerClient {...data} />;
}
