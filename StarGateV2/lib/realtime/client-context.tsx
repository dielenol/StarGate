"use client";

import { createContext, useContext } from "react";

export type RealtimeClientMode = "off" | "observe" | "primary";
export type RealtimeConnectionState =
  | "connecting"
  | "connected"
  | "degraded"
  | "disabled";

export interface RealtimeClientStatus {
  mode: RealtimeClientMode;
  state: RealtimeConnectionState;
}

const RealtimeClientContext = createContext<RealtimeClientStatus>({
  mode: "off",
  state: "disabled",
});

export function RealtimeClientContextProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: RealtimeClientStatus;
}) {
  return (
    <RealtimeClientContext.Provider value={value}>
      {children}
    </RealtimeClientContext.Provider>
  );
}

export function useRealtimeClient(): RealtimeClientStatus {
  return useContext(RealtimeClientContext);
}

export function useRealtimeRefetchInterval(
  fallbackIntervalMs: number,
): number | false {
  const { mode, state } = useRealtimeClient();
  return mode === "primary" && state === "connected"
    ? false
    : fallbackIntervalMs;
}
