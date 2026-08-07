import type { Client } from "discord.js";

import {
  closeDueBureaucratVotes,
  publishPendingBureaucratVotes,
} from "../services/bureaucrat-vote-runtime.js";

const CHECK_INTERVAL_MS = 30_000;
const INITIAL_DELAY_MS = 5_000;

export interface BureaucratVoteCheckerHandle {
  stop(): void;
}

export function createBureaucratVoteTickRunner(
  runTick: () => Promise<void>,
  onError: (error: unknown) => void,
): () => void {
  let running = false;
  return () => {
    if (running) return;
    running = true;
    void runTick().catch(onError).finally(() => {
      running = false;
    });
  };
}

export function startBureaucratVoteChecker(
  client: Client,
): BureaucratVoteCheckerHandle {
  const tick = createBureaucratVoteTickRunner(
    async () => {
      await publishPendingBureaucratVotes(client);
      await closeDueBureaucratVotes(client);
    },
    (error) => console.error("[bureaucrat-vote] scheduler tick failed", error),
  );
  let intervalId: NodeJS.Timeout | null = null;
  const startTimeoutId = setTimeout(() => {
    tick();
    intervalId = setInterval(tick, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
  return {
    stop() {
      clearTimeout(startTimeoutId);
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    },
  };
}
