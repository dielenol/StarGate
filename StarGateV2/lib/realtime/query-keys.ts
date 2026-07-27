import type { RealtimeResource } from "@stargate/core/domain/realtime";
import type { QueryKey } from "@tanstack/react-query";

export const REALTIME_RESOURCE_QUERY_KEYS: Record<
  RealtimeResource,
  readonly QueryKey[]
> = {
  users: [["users"]],
  characters: [
    ["characters"],
    ["character-change-logs"],
    ["character-edit-quota"],
  ],
  personnel: [["personnel"]],
  credits: [["credits"], ["credits-admin"]],
  inventory: [["inventory"]],
  notifications: [["notifications"]],
  shop: [["shop"]],
  stocks: [["stocks"]],
  trades: [["trades"]],
  sessions: [["sessions"]],
  reports: [["session-reports"]],
  "equipment-shop": [["equipment-shop"]],
  wiki: [["wiki"]],
  factions: [["factions"]],
  "page-locks": [["erp-page-locks"]],
};

export function queryKeysForRealtimeResources(
  resources: readonly RealtimeResource[],
): QueryKey[] {
  return resources.flatMap(
    (resource) => REALTIME_RESOURCE_QUERY_KEYS[resource],
  );
}
