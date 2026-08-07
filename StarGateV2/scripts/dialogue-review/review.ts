import {
  DIALOGUE_CRITIC_MODEL,
  DIALOGUE_WRITER_MODEL,
  preflightOllamaCloud,
  reviewDialogueBatch,
} from "./ollama-client.ts";
import type {
  DialogueEntry,
  DialogueLintIssue,
  DialogueLintReport,
  DialogueReviewReport,
} from "./types.ts";

const REVIEW_BATCH_SIZE = 12;
const ENDING_CONCENTRATION_SAMPLE_SIZE = 12;

type FetchImplementation = typeof fetch;

function selectIssueEntryIds(issues: readonly DialogueLintIssue[]): Set<string> {
  const selected = new Set<string>();
  for (const issue of issues) {
    if (issue.rule === "duplicate") {
      for (const entryId of issue.entryIds.slice(1)) selected.add(entryId);
      continue;
    }
    if (issue.rule === "same-start") {
      for (const entryId of issue.entryIds.slice(2)) selected.add(entryId);
      continue;
    }
    if (issue.rule === "ending-concentration") {
      for (const entryId of issue.entryIds.slice(
        0,
        ENDING_CONCENTRATION_SAMPLE_SIZE,
      )) {
        selected.add(entryId);
      }
      continue;
    }
    for (const entryId of issue.entryIds) selected.add(entryId);
  }
  return selected;
}

export function selectReviewEntries(
  lintReport: DialogueLintReport,
  selection: DialogueReviewReport["selection"],
): DialogueEntry[] {
  const relevantIssues = lintReport.issues.filter(
    (issue) =>
      selection.mode === "all" || issue.speakerId === selection.speakerId,
  );
  const selectedIds = selectIssueEntryIds(relevantIssues);
  return lintReport.entries.filter(
    (entry) =>
      selectedIds.has(entry.id) &&
      (selection.mode === "all" || entry.speakerId === selection.speakerId),
  );
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    result.push(values.slice(start, start + size));
  }
  return result;
}

export function selectSpeakerContext(
  speakerEntries: readonly DialogueEntry[],
): DialogueEntry[] {
  if (speakerEntries.length < 8) {
    throw new Error("Ollama 리뷰에는 같은 화자의 context가 최소 8문장 필요합니다.");
  }
  const contextSize = Math.min(12, speakerEntries.length);
  if (speakerEntries.length === contextSize) return [...speakerEntries];

  return Array.from({ length: contextSize }, (_, index) => {
    const sourceIndex = Math.floor((index * speakerEntries.length) / contextSize);
    return speakerEntries[sourceIndex] ?? speakerEntries[0];
  });
}

export async function runDialogueReview(options: {
  apiKey: string;
  lintReport: DialogueLintReport;
  selection: DialogueReviewReport["selection"];
  fetchImpl?: FetchImplementation;
}): Promise<DialogueReviewReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  await preflightOllamaCloud({ apiKey: options.apiKey, fetchImpl });

  const selectedEntries = selectReviewEntries(
    options.lintReport,
    options.selection,
  );
  const speakerIds = [
    ...new Set(selectedEntries.map((entry) => entry.speakerId)),
  ];
  const batches = [];

  for (const speakerId of speakerIds) {
    const speakerEntries = selectedEntries.filter(
      (entry) => entry.speakerId === speakerId,
    );
    const contextEntries = selectSpeakerContext(
      options.lintReport.entries.filter(
        (entry) => entry.speakerId === speakerId,
      ),
    );
    for (const entryBatch of chunks(speakerEntries, REVIEW_BATCH_SIZE)) {
      batches.push(
        await reviewDialogueBatch({
          apiKey: options.apiKey,
          speakerId,
          entries: entryBatch,
          contextEntries,
          issues: options.lintReport.issues,
          fetchImpl,
        }),
      );
    }
  }

  const relevantIssues = options.lintReport.issues.filter(
    (issue) =>
      options.selection.mode === "all" ||
      issue.speakerId === options.selection.speakerId,
  );
  const relevantEntries = options.lintReport.entries.filter(
    (entry) =>
      options.selection.mode === "all" ||
      entry.speakerId === options.selection.speakerId,
  );
  const relevantDiagnostics = options.lintReport.diagnostics.filter(
    (diagnostic) =>
      options.selection.mode === "all" ||
      diagnostic.speakerId === options.selection.speakerId,
  );

  return {
    generatedAt: new Date().toISOString(),
    selection: options.selection,
    models: {
      writer: DIALOGUE_WRITER_MODEL,
      critic: DIALOGUE_CRITIC_MODEL,
    },
    sourceCount: new Set(relevantEntries.map((entry) => entry.sourcePath)).size,
    entryCount: relevantEntries.length,
    reviewedEntryCount: selectedEntries.length,
    lintIssues: relevantIssues,
    sourceDiagnostics: relevantDiagnostics,
    batches,
  };
}
