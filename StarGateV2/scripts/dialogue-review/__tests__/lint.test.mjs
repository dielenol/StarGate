import assert from "node:assert/strict";
import test from "node:test";

import { dialogueLintExitCode } from "../cli.ts";
import { analyzeDialogueEntries } from "../lint.ts";
import {
  extractDialogueEntriesFromText,
  extractProtectedTokens,
  loadDialogueEntries,
} from "../source-loader.ts";

const SOURCE = {
  speakerId: "test",
  displayName: "테스트",
  voiceCard: "짧고 정확한 테스트 말투.",
  allowedProperNouns: ["R-05"],
  relativePath: "fixture/dialogue.ts",
  minimumCharacters: 1,
};

function entry(id, text) {
  return {
    id,
    speakerId: "test",
    speakerName: "테스트",
    voiceCard: SOURCE.voiceCard,
    allowedProperNouns: SOURCE.allowedProperNouns,
    sourcePath: "fixture/dialogue.ts",
    line: Number(id.replace(/\D/gu, "")) || 1,
    column: 1,
    text,
    protectedTokens: extractProtectedTokens(text),
  };
}

test("TypeScript source에서 한국어 문자열과 template placeholder를 등록한다", () => {
  const sourceText = [
    'const first = "확인 버튼을 누르면 12초 뒤에 시작합니다.";',
    "const second = `장비 ${item.name}을 선택해 주세요.`;",
    'const ignored = "english only";',
  ].join("\n");

  const entries = extractDialogueEntriesFromText(SOURCE, sourceText);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].line, 1);
  assert.match(entries[1].text, /\$\{item\.name\}/u);
  assert.deepEqual(entries[1].protectedTokens, [
    { kind: "placeholder", value: "${item.name}" },
  ]);
});

test("manifest propertyNames가 있으면 해당 필드의 문자열만 등록한다", () => {
  const sourceText = [
    "const brief = {",
    '  title: "화면 제목은 등록하지 않습니다.",',
    '  speech: "교관이 직접 말하는 대사는 등록합니다.",',
    '  instruction: "다음 조작을 안내하는 문장도 등록합니다.",',
    "};",
  ].join("\n");
  const entries = extractDialogueEntriesFromText(
    { ...SOURCE, propertyNames: ["speech", "instruction"] },
    sourceText,
  );

  assert.deepEqual(entries.map(({ line }) => line), [3, 4]);
});

test("manifest variableNames와 propertyNames를 함께 적용한다", () => {
  const sourceText = [
    'const SELECTED = { speech: "선택된 화자의 대사입니다.", instruction: "제외할 안내입니다." };',
    'const OTHER = { speech: "다른 변수의 대사는 제외합니다." };',
  ].join("\n");
  const entries = extractDialogueEntriesFromText(
    {
      ...SOURCE,
      propertyNames: ["speech"],
      variableNames: ["SELECTED"],
    },
    sourceText,
  );

  assert.deepEqual(entries.map(({ text }) => text), [
    "선택된 화자의 대사입니다.",
  ]);
});

test("세력별 상수와 R-05 speech만 manifest corpus에 포함한다", async () => {
  const { entries, diagnostics } = await loadDialogueEntries();
  assert.deepEqual(diagnostics, []);
  const factionSpeakerIds = [
    "council",
    "military",
    "civil",
    "white-rose",
    "space-zero",
    "golden-dawn",
    "ahnenerbe",
  ];
  const factionTexts = entries
    .filter(({ speakerId }) => factionSpeakerIds.includes(speakerId))
    .map(({ text }) => text);
  const r05Texts = entries
    .filter(({ speakerId }) => speakerId === "r05")
    .map(({ text }) => text);

  for (const speakerId of factionSpeakerIds) {
    assert.equal(
      entries.filter((entry) => entry.speakerId === speakerId).length,
      9,
      `${speakerId} 대사가 독립된 9문장 묶음이어야 합니다.`,
    );
  }

  assert.ok(
    factionTexts.includes(
      "선택 내용은 확인했습니다. 아직 의결 기록에 올릴 단계는 아니군요.",
    ),
  );
  assert.ok(
    factionTexts.includes(
      "접수선이 막혔습니다. 기록은 남기지 않았으니 조건부터 다시 보시죠.",
    ),
  );
  assert.ok(
    !factionTexts.includes(
      "불필요한 움직임은 기록됩니다. 다음 선택은 더 신중해야 합니다.",
    ),
  );
  assert.ok(r05Texts.length >= 8);
  assert.ok(
    !r05Texts.includes("왼쪽 장비 목록에서 시험할 장비를 선택하세요."),
  );
});

test("숫자와 따옴표 버튼명, placeholder를 보호 토큰으로 추출한다", () => {
  assert.deepEqual(
    extractProtectedTokens(
      '3초 안에 “승인”을 누르고 ${agentName}의 RF2 장비를 확인하세요.',
      ["RF2"],
    ),
    [
      { kind: "placeholder", value: "${agentName}" },
      { kind: "number", value: "3초" },
      { kind: "number", value: "RF2" },
      { kind: "quoted-label", value: "“승인”" },
      { kind: "proper-noun", value: "RF2" },
    ],
  );
});

test("종결어미, 시작어, 3문장, 중복, 길이를 함께 보고한다", () => {
  const entries = [
    entry("line-1", "다시 확인했습니다. 다시 기록했습니다. 다시 제출했습니다."),
    entry("line-2", "다시 확인했습니다."),
    entry("line-3", "다시 확인했습니다."),
    entry("line-4", "이 문장은 길이 제한을 충분히 넘기도록 작성했습니다."),
    entry("line-5", "별도 항목을 확인했습니다."),
  ];

  const report = analyzeDialogueEntries(entries, [], {
    maximumCharacters: 20,
    sentenceWarningCount: 3,
    sameStartMinimum: 3,
    endingMinimumCount: 3,
    endingConcentrationRatio: 0.4,
  });
  const rules = new Set(report.issues.map(({ rule }) => rule));

  assert.deepEqual(rules, new Set([
    "three-or-more-sentences",
    "length",
    "duplicate",
    "same-start",
    "same-ending-run",
    "ending-concentration",
  ]));
  assert.equal(report.entryCount, entries.length);
});

test("동일 종결어미가 소스 순서에서 세 문장 연속되면 직접 경고한다", () => {
  const report = analyzeDialogueEntries([
    entry("line-1", "첫째를 확인했습니다."),
    entry("line-2", "둘째를 기록했습니다."),
    entry("line-3", "셋째를 제출했습니다."),
    entry("line-4", "여기서 흐름을 바꿔요."),
    entry("line-5", "다시 확인했습니다."),
  ]);
  const runs = report.issues.filter(({ rule }) => rule === "same-ending-run");

  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].entryIds, ["line-1", "line-2", "line-3"]);
});

test("린트 종료 코드는 후보 경고는 허용하고 고위험 규칙과 소스 오류를 차단한다", () => {
  const candidateOnly = analyzeDialogueEntries([
    entry("line-1", "첫 문장입니다. 둘째를 확인해요. 셋째로 마칩니다."),
  ]);
  const duplicated = analyzeDialogueEntries([
    entry("line-1", "같은 안내를 확인해 주세요."),
    entry("line-2", "같은 안내를 확인해 주세요."),
  ]);
  const sourceError = {
    ...candidateOnly,
    diagnostics: [
      {
        speakerId: "test",
        sourcePath: "fixture/dialogue.ts",
        kind: "missing-source",
        message: "소스 없음",
      },
    ],
  };

  assert.equal(dialogueLintExitCode(candidateOnly), 0);
  assert.equal(dialogueLintExitCode(duplicated), 1);
  assert.equal(dialogueLintExitCode(sourceError), 1);
});
