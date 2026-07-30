import type { RealtimeResource } from "@stargate/core/domain/realtime";
import type { QueryKey } from "@tanstack/react-query";

export const REALTIME_RESOURCE_QUERY_KEYS: Record<
  RealtimeResource,
  readonly QueryKey[]
> = {
  users: [
    ["users"],
    ["trades"],
    ["dashboard"],
    ["factions"],
    ["account"],
  ],
  characters: [
    ["characters"],
    ["character-change-logs"],
    ["character-edit-quota"],
    ["personnel"],
    ["trades"],
    ["dashboard"],
    ["factions"],
    ["account"],
  ],
  personnel: [["personnel"]],
  credits: [
    ["credits"],
    ["credits-admin"],
    ["trades"],
    ["dashboard"],
  ],
  inventory: [
    ["inventory"],
    ["trades"],
    ["shop"],
    ["equipment-shop"],
    ["admin-inventory-overview"],
  ],
  notifications: [["notifications"], ["dashboard"]],
  shop: [["shop"]],
  stocks: [["stocks"], ["trades"]],
  trades: [["trades"]],
  sessions: [["sessions"], ["dashboard"]],
  reports: [["session-reports"], ["dashboard"], ["factions"]],
  "equipment-shop": [["equipment-shop"]],
  wiki: [["wiki"], ["dashboard"], ["factions"]],
  factions: [["factions"]],
  "page-locks": [["erp-page-locks"]],
};

export function queryKeysForRealtimeResources(
  resources: readonly RealtimeResource[],
): QueryKey[] {
  const seen = new Set<string>();
  return resources
    .flatMap((resource) => REALTIME_RESOURCE_QUERY_KEYS[resource])
    .filter((queryKey) => {
      const signature = JSON.stringify(queryKey);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
}
