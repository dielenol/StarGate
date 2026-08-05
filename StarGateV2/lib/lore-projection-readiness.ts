export interface LoreSignalProjectionReadinessInput {
  generationReady: boolean;
  latestStatus?: string;
  latestStartedAt?: Date;
  wikiCount: number;
  reportCount: number;
  projectedWikiCount: number;
  projectedReportCount: number;
  wikiChangedAfterGeneration: boolean;
  reportChangedAfterGeneration: boolean;
}

/**
 * A projection can serve aggregate signals only when it is the newest complete
 * generation, covers every source row, and no domain row changed afterward.
 */
export function isLoreSignalProjectionReady(
  input: LoreSignalProjectionReadinessInput,
): boolean {
  return (
    input.generationReady &&
    input.latestStatus === "succeeded" &&
    input.latestStartedAt instanceof Date &&
    input.wikiCount === input.projectedWikiCount &&
    input.reportCount === input.projectedReportCount &&
    !input.wikiChangedAfterGeneration &&
    !input.reportChangedAfterGeneration
  );
}
