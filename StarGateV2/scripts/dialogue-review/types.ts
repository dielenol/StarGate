export type ProtectedTokenKind =
  | "number"
  | "quoted-label"
  | "placeholder"
  | "proper-noun";

export interface ProtectedToken {
  kind: ProtectedTokenKind;
  value: string;
}

export interface DialogueSourceDefinition {
  speakerId: string;
  displayName: string;
  voiceCard: string;
  allowedProperNouns: readonly string[];
  relativePath: string;
  minimumCharacters?: number;
  propertyNames?: readonly string[];
  variableNames?: readonly string[];
}

export interface DialogueEntry {
  id: string;
  speakerId: string;
  speakerName: string;
  voiceCard: string;
  allowedProperNouns: readonly string[];
  sourcePath: string;
  line: number;
  column: number;
  text: string;
  protectedTokens: ProtectedToken[];
}

export type DialogueLintRule =
  | "ending-concentration"
  | "same-ending-run"
  | "same-start"
  | "three-or-more-sentences"
  | "duplicate"
  | "length";

export interface DialogueLintIssue {
  rule: DialogueLintRule;
  severity: "warning";
  speakerId: string;
  message: string;
  entryIds: string[];
  value?: string | number;
}

export interface DialogueSourceDiagnostic {
  speakerId: string;
  sourcePath: string;
  kind: "missing-source" | "read-error";
  message: string;
}

export interface DialogueLintReport {
  generatedAt: string;
  sourceCount: number;
  entryCount: number;
  protectedTokenCount: number;
  entries: DialogueEntry[];
  issues: DialogueLintIssue[];
  diagnostics: DialogueSourceDiagnostic[];
}

export interface WriterAlternativeReview {
  lineId: string;
  alternatives: [string, string, string];
  rationale: string;
}

export interface WriterReviewResult {
  reviews: WriterAlternativeReview[];
}

export type CriticVerdict = "accept" | "revise" | "keep-original";
export type DialogueReviewScore = 1 | 2 | 3 | 4 | 5;

export interface CriticLineReview {
  lineId: string;
  recommendedAlternative: 1 | 2 | 3 | null;
  verdict: CriticVerdict;
  notes: string;
  protectedTokensPreserved: boolean;
  naturalness: DialogueReviewScore;
  characterFit: DialogueReviewScore;
  loreGrounding: DialogueReviewScore;
  protectedFacts: DialogueReviewScore;
}

export interface CriticReviewResult {
  reviews: CriticLineReview[];
}

export interface DialogueReviewBatch {
  speakerId: string;
  entries: DialogueEntry[];
  writer: WriterReviewResult;
  critic: CriticReviewResult;
  writerRepairUsed: boolean;
  criticRepairUsed: boolean;
}

export interface DialogueReviewReport {
  generatedAt: string;
  selection: { mode: "all" } | { mode: "speaker"; speakerId: string };
  models: {
    writer: string;
    critic: string;
  };
  sourceCount: number;
  entryCount: number;
  reviewedEntryCount: number;
  lintIssues: DialogueLintIssue[];
  sourceDiagnostics: DialogueSourceDiagnostic[];
  batches: DialogueReviewBatch[];
}
