import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  CriticLineReview,
  DialogueEntry,
  DialogueReviewReport,
  WriterAlternativeReview,
} from "./types.ts";

function oneLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function markdownQuote(value: string): string {
  return oneLine(value)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function safeInline(value: string): string {
  return value.replace(/`/gu, "\\`");
}

function lineSection(options: {
  entry: DialogueEntry;
  writer: WriterAlternativeReview;
  critic: CriticLineReview;
}): string {
  const { entry, writer, critic } = options;
  const protectedTokens =
    entry.protectedTokens.length === 0
      ? "없음"
      : entry.protectedTokens
          .map(({ kind, value }) => `${kind}: \`${safeInline(value)}\``)
          .join(", ");
  const alternatives = writer.alternatives
    .map(
      (alternative, index) =>
        `${index + 1}. ${oneLine(alternative)}`,
    )
    .join("\n");
  const recommendation =
    critic.recommendedAlternative === null
      ? "원문 유지"
      : `대안 ${critic.recommendedAlternative}`;

  return [
    `### ${entry.id}`,
    "",
    `${entry.sourcePath}:${entry.line}`,
    "",
    "원문:",
    "",
    markdownQuote(entry.text),
    "",
    `보호 토큰: ${protectedTokens}`,
    "",
    "대안:",
    "",
    alternatives,
    "",
    `Writer 근거: ${oneLine(writer.rationale)}`,
    "",
    `Critic 판정: ${critic.verdict} / ${recommendation} / 보호 토큰 ${
      critic.protectedTokensPreserved ? "보존" : "미보존"
    }`,
    "",
    `Critic 점수: naturalness ${critic.naturalness}/5 · characterFit ${critic.characterFit}/5 · loreGrounding ${critic.loreGrounding}/5 · protectedFacts ${critic.protectedFacts}/5`,
    "",
    `Critic 근거: ${oneLine(critic.notes)}`,
  ].join("\n");
}

export function renderDialogueReviewMarkdown(
  report: DialogueReviewReport,
): string {
  const selection =
    report.selection.mode === "all"
      ? "전체 화자"
      : `화자 ${report.selection.speakerId}`;
  const sections = [
    "# Dialogue review",
    "",
    `- 생성 시각: ${report.generatedAt}`,
    `- 선택: ${selection}`,
    `- Writer: ${report.models.writer}`,
    `- Critic: ${report.models.critic}`,
    `- 등록 대사: ${report.entryCount}`,
    `- AI 검토 대사: ${report.reviewedEntryCount}`,
    `- 로컬 린트 경고: ${report.lintIssues.length}`,
    "- 소스 자동 적용: 하지 않음",
  ];

  if (report.sourceDiagnostics.length > 0) {
    sections.push("", "## Source diagnostics", "");
    for (const diagnostic of report.sourceDiagnostics) {
      sections.push(`- ${diagnostic.message}`);
    }
  }

  sections.push("", "## Local lint summary", "");
  if (report.lintIssues.length === 0) {
    sections.push("- 경고 없음");
  } else {
    const counts = new Map<string, number>();
    for (const lintIssue of report.lintIssues) {
      counts.set(lintIssue.rule, (counts.get(lintIssue.rule) ?? 0) + 1);
    }
    for (const [rule, count] of counts) {
      sections.push(`- ${rule}: ${count}`);
    }
  }

  sections.push("", "## Reviews");
  if (report.batches.length === 0) {
    sections.push("", "AI 검토 대상으로 선별된 린트 경고 대사가 없습니다.");
  }

  for (const batch of report.batches) {
    sections.push("", `## ${batch.speakerId}`, "");
    const writerById = new Map(
      batch.writer.reviews.map((review) => [review.lineId, review]),
    );
    const criticById = new Map(
      batch.critic.reviews.map((review) => [review.lineId, review]),
    );
    for (const entry of batch.entries) {
      const writer = writerById.get(entry.id);
      const critic = criticById.get(entry.id);
      if (!writer || !critic) continue;
      sections.push("", lineSection({ entry, writer, critic }));
    }
  }

  sections.push("");
  return sections.join("\n");
}

function artifactBaseName(report: DialogueReviewReport): string {
  const timestamp = report.generatedAt.replace(/[:.]/gu, "-");
  const selection =
    report.selection.mode === "all" ? "all" : report.selection.speakerId;
  const safeSelection = selection.replace(/[^a-zA-Z0-9_-]/gu, "-");
  return `${timestamp}-${safeSelection}`;
}

export async function writeDialogueReviewReport(
  report: DialogueReviewReport,
  options: { projectRoot: string },
): Promise<{ jsonPath: string; markdownPath: string }> {
  const outputDirectory = resolve(
    options.projectRoot,
    ".artifacts/dialogue-review",
  );
  await mkdir(outputDirectory, { recursive: true });
  const baseName = artifactBaseName(report);
  const jsonPath = resolve(outputDirectory, `${baseName}.json`);
  const markdownPath = resolve(outputDirectory, `${baseName}.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderDialogueReviewMarkdown(report), "utf8");

  return { jsonPath, markdownPath };
}
