import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveOllamaApiKey } from "./api-key.ts";
import { analyzeDialogueEntries } from "./lint.ts";
import { DIALOGUE_SPEAKER_IDS } from "./manifest.ts";
import { writeDialogueReviewReport } from "./report.ts";
import { runDialogueReview } from "./review.ts";
import { loadDialogueEntries } from "./source-loader.ts";
import type {
  DialogueLintRule,
  DialogueLintReport,
  DialogueReviewReport,
} from "./types.ts";

const PROJECT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DIALOGUE_SPEAKER_ID_SET = new Set<string>(DIALOGUE_SPEAKER_IDS);
const BLOCKING_DIALOGUE_LINT_RULES = new Set<DialogueLintRule>([
  "duplicate",
  "ending-concentration",
  "same-ending-run",
]);

function usage(): string {
  return [
    "사용법:",
    "  pnpm dialogue:lint",
    "  pnpm dialogue:review -- --all",
    "  pnpm dialogue:review -- --speaker <id>",
    "",
    `speaker ids: ${DIALOGUE_SPEAKER_IDS.join(", ")}`,
  ].join("\n");
}

function selectedLocation(
  lintReport: DialogueLintReport,
  entryId: string,
): string {
  const entry = lintReport.entries.find((candidate) => candidate.id === entryId);
  return entry ? `${entry.sourcePath}:${entry.line}` : entryId;
}

function printLintReport(lintReport: DialogueLintReport): void {
  console.log(
    `[dialogue:lint] ${lintReport.sourceCount} sources / ${lintReport.entryCount} lines / ${lintReport.issues.length} warnings`,
  );
  for (const diagnostic of lintReport.diagnostics) {
    console.error(`[source:${diagnostic.kind}] ${diagnostic.message}`);
  }
  for (const lintIssue of lintReport.issues) {
    const locations = lintIssue.entryIds
      .slice(0, 6)
      .map((entryId) => selectedLocation(lintReport, entryId));
    if (lintIssue.entryIds.length > locations.length) {
      locations.push(`외 ${lintIssue.entryIds.length - locations.length}개`);
    }
    console.log(
      `[${lintIssue.rule}] ${lintIssue.speakerId}: ${lintIssue.message} (${locations.join(", ")})`,
    );
  }
  console.log(
    `[protected-tokens] ${lintReport.protectedTokenCount} tokens`,
  );
  for (const entry of lintReport.entries) {
    if (entry.protectedTokens.length === 0) continue;
    const tokens = entry.protectedTokens
      .map(({ kind, value }) => `${kind}=${JSON.stringify(value)}`)
      .join(", ");
    console.log(
      `[protected-tokens] ${entry.speakerId} ${entry.sourcePath}:${entry.line} ${tokens}`,
    );
  }
}

export function dialogueLintExitCode(
  lintReport: DialogueLintReport,
): 0 | 1 {
  const hasBlockingIssue = lintReport.issues.some((issue) =>
    BLOCKING_DIALOGUE_LINT_RULES.has(issue.rule),
  );
  return lintReport.diagnostics.length === 0 && !hasBlockingIssue ? 0 : 1;
}

function parseReviewSelection(
  args: readonly string[],
): DialogueReviewReport["selection"] {
  const values = args.filter((arg) => arg !== "--");
  if (values.length === 1 && values[0] === "--all") {
    return { mode: "all" };
  }
  const speakerEquals = values.find((arg) => arg.startsWith("--speaker="));
  if (speakerEquals && values.length === 1) {
    const speakerId = speakerEquals.slice("--speaker=".length).toLowerCase();
    if (!DIALOGUE_SPEAKER_ID_SET.has(speakerId)) {
      throw new Error(`알 수 없는 speaker id입니다: ${speakerId}`);
    }
    return { mode: "speaker", speakerId };
  }
  if (values.length === 2 && values[0] === "--speaker") {
    const speakerId = values[1]?.toLowerCase() ?? "";
    if (!DIALOGUE_SPEAKER_ID_SET.has(speakerId)) {
      throw new Error(`알 수 없는 speaker id입니다: ${speakerId}`);
    }
    return { mode: "speaker", speakerId };
  }
  throw new Error("review 대상은 --all 또는 --speaker <id>로 지정해야 합니다.");
}

function relevantDiagnostics(
  lintReport: DialogueLintReport,
  selection: DialogueReviewReport["selection"],
) {
  return lintReport.diagnostics.filter(
    (diagnostic) =>
      selection.mode === "all" || diagnostic.speakerId === selection.speakerId,
  );
}

export async function main(
  rawArgs = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const args = rawArgs.filter((arg) => arg !== "--");
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return 0;
  }

  const command = args[0];
  if (command !== "lint" && command !== "review") {
    console.error(usage());
    return 1;
  }

  const loaded = await loadDialogueEntries({ projectRoot: PROJECT_ROOT });
  const lintReport = analyzeDialogueEntries(
    loaded.entries,
    loaded.diagnostics,
  );
  if (command === "lint") {
    if (args.length > 1) throw new Error("dialogue:lint는 추가 인자를 받지 않습니다.");
    printLintReport(lintReport);
    const exitCode = dialogueLintExitCode(lintReport);
    if (exitCode !== 0) {
      console.error(
        "[dialogue:lint] 중복·종결어미 집중·동일 종결어미 3연속 또는 소스 오류를 먼저 해결하세요.",
      );
    }
    return exitCode;
  }

  const selection = parseReviewSelection(args.slice(1));
  const diagnostics = relevantDiagnostics(lintReport, selection);
  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) console.error(diagnostic.message);
    throw new Error("선택 범위의 대사 소스가 완전하지 않아 리뷰를 중단했습니다.");
  }
  const apiKey = await resolveOllamaApiKey({
    env,
    projectRoot: PROJECT_ROOT,
  });
  if (!apiKey) {
    throw new Error(
      "OLLAMA_API_KEY가 process env 또는 .env.local에 필요합니다.",
    );
  }

  const reviewReport = await runDialogueReview({
    apiKey,
    lintReport,
    selection,
  });
  const paths = await writeDialogueReviewReport(reviewReport, {
    projectRoot: PROJECT_ROOT,
  });
  console.log(
    `[dialogue:review] ${reviewReport.reviewedEntryCount} lines reviewed; source files were not changed.`,
  );
  console.log(
    `[dialogue:review] JSON ${relative(PROJECT_ROOT, paths.jsonPath)}`,
  );
  console.log(
    `[dialogue:review] Markdown ${relative(PROJECT_ROOT, paths.markdownPath)}`,
  );
  return 0;
}

const directEntry = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directEntry) {
  void main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(
        `[dialogue-review] ${
          error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."
        }`,
      );
      process.exitCode = 1;
    });
}
