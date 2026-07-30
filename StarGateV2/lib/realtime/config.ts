import type { RealtimeClientMode } from "./client-context";

const REALTIME_CLIENT_MODES = new Set<RealtimeClientMode>([
  "off",
  "observe",
  "primary",
]);

export function getRealtimeClientMode(): RealtimeClientMode {
  const configured = process.env.REALTIME_CLIENT_MODE?.trim().toLowerCase();
  return REALTIME_CLIENT_MODES.has(configured as RealtimeClientMode)
    ? (configured as RealtimeClientMode)
    : "off";
}
