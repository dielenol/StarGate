import type {
  DialogueEntry,
  DialogueLintIssue,
  DialogueLintReport,
  DialogueSourceDiagnostic,
} from "./types.ts";

export interface DialogueLintOptions {
  maximumCharacters: number;
  sentenceWarningCount: number;
  sameStartMinimum: number;
  endingMinimumCount: number;
  endingConcentrationRatio: number;
}

export const DEFAULT_DIALOGUE_LINT_OPTIONS: DialogueLintOptions = {
  maximumCharacters: 120,
  sentenceWarningCount: 3,
  sameStartMinimum: 3,
  endingMinimumCount: 5,
  endingConcentrationRatio: 0.3,
};

const SENTENCE_SEGMENTER = new Intl.Segmenter("ko", {
  granularity: "sentence",
});
const KOREAN_PATTERN = /[가-힣]/u;
const ENDINGS = [
  "하겠습니다",
  "겠습니다",
  "마십시오",
  "하십시오",
  "주세요",
  "드립니다",
  "입니까",
  "습니까",
  "입니다",
  "됩니다",
  "합니다",
  "습니다",
  "거예요",
  "이에요",
  "예요",
  "인가요",
  "할까요",
  "볼까요",
  "하세요",
  "으세요",
  "세요",
  "네요",
  "군요",
  "나요",
  "해요",
  "돼요",
  "아요",
  "어요",
  "죠",
  "지요",
  "다",
  "야",
  "지",
  "까",
] as const;

function sentences(text: string): string[] {
  return Array.from(SENTENCE_SEGMENTER.segment(text), ({ segment }) =>
    segment.trim(),
  ).filter((segment) => KOREAN_PATTERN.test(segment));
}

function normalizeDuplicateKey(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function startWord(text: string): string | null {
  const withoutPlaceholder = text.replace(/^\s*\$\{[^{}]+\}\s*[,,:-]?\s*/u, "");
  const match = withoutPlaceholder.match(/[가-힣A-Za-z]+(?:-[A-Za-z0-9]+)?/u);
  return match?.[0]?.normalize("NFKC").toLocaleLowerCase("ko") ?? null;
}

function endingOf(sentence: string): string | null {
  const normalized = sentence
    .normalize("NFKC")
    .replace(/[\s.!?…,'"”’」』)\]]+$/gu, "");
  return ENDINGS.find((ending) => normalized.endsWith(ending)) ?? null;
}

function groupBy<T>(
  values: readonly T[],
  keyOf: (value: T) => string | null,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    if (key === null) continue;
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function issue(
  rule: DialogueLintIssue["rule"],
  speakerId: string,
  message: string,
  entryIds: string[],
  value?: string | number,
): DialogueLintIssue {
  return {
    rule,
    severity: "warning",
    speakerId,
    message,
    entryIds,
    ...(value === undefined ? {} : { value }),
  };
}

function analyzeIndividualLines(
  entries: readonly DialogueEntry[],
  options: DialogueLintOptions,
): DialogueLintIssue[] {
  const issues: DialogueLintIssue[] = [];

  for (const entry of entries) {
    const sentenceCount = sentences(entry.text).length;
    if (sentenceCount >= options.sentenceWarningCount) {
      issues.push(
        issue(
          "three-or-more-sentences",
          entry.speakerId,
          `한 대사에 ${sentenceCount}개 문장이 들어 있습니다. 호흡을 나눌지 검토하세요.`,
          [entry.id],
          sentenceCount,
        ),
      );
    }
    if (entry.text.length > options.maximumCharacters) {
      issues.push(
        issue(
          "length",
          entry.speakerId,
          `대사 길이가 ${entry.text.length}자로 기준 ${options.maximumCharacters}자를 넘습니다.`,
          [entry.id],
          entry.text.length,
        ),
      );
    }
  }

  return issues;
}

function analyzeDuplicates(entries: readonly DialogueEntry[]): DialogueLintIssue[] {
  const issues: DialogueLintIssue[] = [];
  const bySpeaker = groupBy(entries, (entry) => entry.speakerId);

  for (const [speakerId, speakerEntries] of bySpeaker) {
    const duplicateGroups = groupBy(speakerEntries, (entry) =>
      normalizeDuplicateKey(entry.text),
    );
    for (const duplicateEntries of duplicateGroups.values()) {
      if (duplicateEntries.length < 2) continue;
      issues.push(
        issue(
          "duplicate",
          speakerId,
          `동일한 대사가 ${duplicateEntries.length}번 등록되어 있습니다.`,
          duplicateEntries.map((entry) => entry.id),
          duplicateEntries.length,
        ),
      );
    }
  }

  return issues;
}

function analyzeStarts(
  entries: readonly DialogueEntry[],
  options: DialogueLintOptions,
): DialogueLintIssue[] {
  const issues: DialogueLintIssue[] = [];
  const bySpeaker = groupBy(entries, (entry) => entry.speakerId);

  for (const [speakerId, speakerEntries] of bySpeaker) {
    const starts = groupBy(speakerEntries, (entry) => startWord(entry.text));
    for (const [word, sameStartEntries] of starts) {
      if (sameStartEntries.length < options.sameStartMinimum) continue;
      issues.push(
        issue(
          "same-start",
          speakerId,
          `시작어 “${word}”가 ${sameStartEntries.length}개 대사에 반복됩니다.`,
          sameStartEntries.map((entry) => entry.id),
          word,
        ),
      );
    }
  }

  return issues;
}

function analyzeEndings(
  entries: readonly DialogueEntry[],
  options: DialogueLintOptions,
): DialogueLintIssue[] {
  const issues: DialogueLintIssue[] = [];
  const bySpeaker = groupBy(entries, (entry) => entry.speakerId);

  for (const [speakerId, speakerEntries] of bySpeaker) {
    const occurrences = speakerEntries.flatMap((entry) =>
      sentences(entry.text).map((sentence) => ({
        entry,
        ending: endingOf(sentence),
      })),
    );
    const endingGroups = groupBy(occurrences, (value) => value.ending);
    const sorted = [...endingGroups.entries()].sort(
      (left, right) => right[1].length - left[1].length,
    );
    const top = sorted[0];
    if (!top) continue;
    const [ending, endingOccurrences] = top;
    const ratio = endingOccurrences.length / Math.max(occurrences.length, 1);
    if (
      endingOccurrences.length < options.endingMinimumCount ||
      ratio < options.endingConcentrationRatio
    ) {
      continue;
    }

    issues.push(
      issue(
        "ending-concentration",
        speakerId,
        `종결어미 “${ending}”가 ${endingOccurrences.length}/${occurrences.length}문장 (${Math.round(ratio * 100)}%)에 집중됩니다.`,
        [...new Set(endingOccurrences.map(({ entry }) => entry.id))],
        ending,
      ),
    );
  }

  return issues;
}

function analyzeEndingRuns(
  entries: readonly DialogueEntry[],
): DialogueLintIssue[] {
  const issues: DialogueLintIssue[] = [];
  const bySpeaker = groupBy(entries, (entry) => entry.speakerId);

  for (const [speakerId, speakerEntries] of bySpeaker) {
    const occurrences = speakerEntries.flatMap((entry) =>
      sentences(entry.text).map((sentence) => ({
        entry,
        ending: endingOf(sentence),
      })),
    );
    let runStart = 0;
    while (runStart < occurrences.length) {
      const ending = occurrences[runStart]?.ending ?? null;
      let runEnd = runStart + 1;
      while (
        ending !== null &&
        runEnd < occurrences.length &&
        occurrences[runEnd]?.ending === ending
      ) {
        runEnd += 1;
      }
      const runLength = runEnd - runStart;
      if (ending !== null && runLength >= 3) {
        const runEntries = occurrences.slice(runStart, runEnd);
        issues.push(
          issue(
            "same-ending-run",
            speakerId,
            `종결어미 “${ending}”가 소스 순서에서 ${runLength}문장 연속됩니다.`,
            [...new Set(runEntries.map(({ entry }) => entry.id))],
            ending,
          ),
        );
      }
      runStart = runEnd;
    }
  }

  return issues;
}

export function analyzeDialogueEntries(
  entries: readonly DialogueEntry[],
  diagnostics: readonly DialogueSourceDiagnostic[] = [],
  overrides: Partial<DialogueLintOptions> = {},
): DialogueLintReport {
  const options = { ...DEFAULT_DIALOGUE_LINT_OPTIONS, ...overrides };
  const issues = [
    ...analyzeIndividualLines(entries, options),
    ...analyzeDuplicates(entries),
    ...analyzeStarts(entries, options),
    ...analyzeEndingRuns(entries),
    ...analyzeEndings(entries, options),
  ];

  return {
    generatedAt: new Date().toISOString(),
    sourceCount: new Set(entries.map((entry) => entry.sourcePath)).size,
    entryCount: entries.length,
    protectedTokenCount: entries.reduce(
      (count, entry) => count + entry.protectedTokens.length,
      0,
    ),
    entries: [...entries],
    issues,
    diagnostics: [...diagnostics],
  };
}
