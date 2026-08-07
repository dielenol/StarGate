import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DIALOGUE_CRITIC_MODEL,
  DIALOGUE_WRITER_MODEL,
} from "../ollama-client.ts";
import { writeDialogueReviewReport } from "../report.ts";

test("JSON과 Markdown 리포트에는 대안과 비자동적용 경계를 기록한다", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "dialogue-review-test-"));
  const entry = {
    id: "test:fixture.ts:1:1",
    speakerId: "test",
    speakerName: "테스트",
    voiceCard: "짧고 정확한 테스트 말투.",
    allowedProperNouns: [],
    sourcePath: "fixture.ts",
    line: 1,
    column: 1,
    text: "원문입니다.",
    protectedTokens: [],
  };
  const writer = {
    lineId: entry.id,
    alternatives: ["첫 대안입니다.", "둘째 대안입니다.", "셋째 대안입니다."],
    rationale: "호흡 검토",
  };
  const critic = {
    lineId: entry.id,
    recommendedAlternative: 1,
    verdict: "accept",
    notes: "첫 대안 권장",
    protectedTokensPreserved: true,
    naturalness: 5,
    characterFit: 4,
    loreGrounding: 5,
    protectedFacts: 5,
  };
  const report = {
    generatedAt: "2026-08-07T00:00:00.000Z",
    selection: { mode: "speaker", speakerId: "test" },
    models: {
      writer: DIALOGUE_WRITER_MODEL,
      critic: DIALOGUE_CRITIC_MODEL,
    },
    sourceCount: 1,
    entryCount: 1,
    reviewedEntryCount: 1,
    lintIssues: [],
    sourceDiagnostics: [],
    batches: [
      {
        speakerId: "test",
        entries: [entry],
        writer: { reviews: [writer] },
        critic: { reviews: [critic] },
        writerRepairUsed: false,
        criticRepairUsed: false,
      },
    ],
  };

  try {
    const paths = await writeDialogueReviewReport(report, { projectRoot });
    const [json, markdown] = await Promise.all([
      readFile(paths.jsonPath, "utf8"),
      readFile(paths.markdownPath, "utf8"),
    ]);

    assert.equal(JSON.parse(json).batches[0].writer.reviews.length, 1);
    assert.match(markdown, /소스 자동 적용: 하지 않음/u);
    assert.match(markdown, /첫 대안입니다/u);
    assert.match(markdown, /naturalness 5\/5/u);
    assert.match(markdown, /protectedFacts 5\/5/u);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
