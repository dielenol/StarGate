import assert from "node:assert/strict";
import test from "node:test";

import {
  DIALOGUE_CRITIC_MODEL,
  DIALOGUE_WRITER_MODEL,
  OLLAMA_API_BASE_URL,
  parsePlainJson,
  reviewDialogueBatch,
} from "../ollama-client.ts";
import { runDialogueReview, selectReviewEntries } from "../review.ts";

const API_KEY = "mock-api-key";
const ENTRY = {
  id: "test:fixture.ts:1:1",
  speakerId: "test",
  speakerName: "테스트",
  voiceCard: "짧고 단호한 전술 교관 말투.",
  allowedProperNouns: ["R-05"],
  sourcePath: "fixture.ts",
  line: 1,
  column: 1,
  text: "R-05는 3초 안에 “승인”을 누르라고 지시합니다.",
  protectedTokens: [
    { kind: "number", value: "3초" },
    { kind: "quoted-label", value: "“승인”" },
    { kind: "proper-noun", value: "R-05" },
  ],
};
const CONTEXT_ENTRIES = [
  ENTRY,
  ...Array.from({ length: 11 }, (_, index) => ({
    ...ENTRY,
    id: `test:fixture.ts:${index + 2}:1`,
    line: index + 2,
    text: `같은 화자의 전술 안내 문장 ${index + 1}입니다.`,
    protectedTokens: [],
  })),
];

function writerPayload(entries = [ENTRY]) {
  return {
    reviews: entries.map((entry) => ({
      lineId: entry.id ?? entry.lineId,
      alternatives: [
        entry.text ?? entry.original,
        `확인했습니다. ${entry.text ?? entry.original}`,
        `${entry.text ?? entry.original} 다시 확인해 주세요.`,
      ],
      rationale: "호흡을 달리한 대안입니다.",
    })),
  };
}

function criticPayload(entries = [ENTRY]) {
  return {
    reviews: entries.map((entry) => ({
      lineId: entry.id ?? entry.lineId,
      recommendedAlternative: 2,
      verdict: "accept",
      notes: "보호 토큰과 의미를 유지했습니다.",
      protectedTokensPreserved: true,
      naturalness: 5,
      characterFit: 5,
      loreGrounding: 4,
      protectedFacts: 5,
    })),
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("plain JSON은 코드 펜스나 앞뒤 설명이 있어도 객체만 파싱한다", () => {
  assert.deepEqual(parsePlainJson('설명\n```json\n{"ok":true}\n```'), {
    ok: true,
  });
});

test("tags 프리플라이트 뒤 writer와 critic을 순차 호출하고 format에 의존하지 않는다", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/tags")) {
      return jsonResponse({
        models: [
          { name: DIALOGUE_WRITER_MODEL },
          { name: DIALOGUE_CRITIC_MODEL },
        ],
      });
    }
    const body = JSON.parse(String(init?.body));
    const request = JSON.parse(body.messages[1].content);
    return jsonResponse({
      message: {
        content: JSON.stringify(
          body.model === DIALOGUE_WRITER_MODEL
            ? writerPayload(request.lines)
            : criticPayload(request.lines),
        ),
      },
    });
  };

  const result = await runDialogueReview({
    apiKey: API_KEY,
    lintReport: {
      generatedAt: "2026-08-07T00:00:00.000Z",
      sourceCount: 1,
      entryCount: CONTEXT_ENTRIES.length,
      protectedTokenCount: 3,
      entries: CONTEXT_ENTRIES,
      issues: [
        {
          rule: "length",
          severity: "warning",
          speakerId: "test",
          message: "길이 검토",
          entryIds: [ENTRY.id],
        },
      ],
      diagnostics: [],
    },
    selection: { mode: "all" },
    fetchImpl,
  });

  assert.deepEqual(
    calls.map(({ url }) => url),
    [
      `${OLLAMA_API_BASE_URL}/api/tags`,
      `${OLLAMA_API_BASE_URL}/api/chat`,
      `${OLLAMA_API_BASE_URL}/api/chat`,
    ],
  );
  assert.deepEqual(
    calls.slice(1).map(({ init }) => JSON.parse(String(init.body)).model),
    [DIALOGUE_WRITER_MODEL, DIALOGUE_CRITIC_MODEL],
  );
  assert.ok(
    calls.slice(1).every(({ init }) => !("format" in JSON.parse(String(init.body)))),
  );
  const writerRequest = JSON.parse(
    JSON.parse(String(calls[1].init.body)).messages[1].content,
  );
  const criticRequest = JSON.parse(
    JSON.parse(String(calls[2].init.body)).messages[1].content,
  );
  assert.equal(writerRequest.speaker.voiceCard, ENTRY.voiceCard);
  assert.deepEqual(writerRequest.speaker.allowedProperNouns, ["R-05"]);
  assert.ok(
    writerRequest.voiceContext.length >= 8 &&
      writerRequest.voiceContext.length <= 12,
  );
  assert.deepEqual(
    new Set(writerRequest.voiceContext.map(({ speakerId }) => speakerId)),
    new Set([ENTRY.speakerId]),
  );
  assert.equal(criticRequest.speaker.voiceCard, ENTRY.voiceCard);
  assert.deepEqual(criticRequest.speaker.allowedProperNouns, ["R-05"]);
  assert.ok(
    calls.every(
      ({ init }) => new Headers(init.headers).get("authorization") === `Bearer ${API_KEY}`,
    ),
  );
  assert.equal(result.batches[0].writerRepairUsed, false);
  assert.equal(result.batches[0].criticRepairUsed, false);
  assert.equal(result.reviewedEntryCount, CONTEXT_ENTRIES.length);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(API_KEY, "u"));
});

test("--all과 --speaker는 린트 경고가 없는 문장도 리뷰 대상으로 포함한다", () => {
  const r05Entry = {
    ...ENTRY,
    id: "r05:fixture.ts:2:1",
    speakerId: "r05",
    speakerName: "R-05",
  };
  const lintReport = {
    generatedAt: "2026-08-08T00:00:00.000Z",
    sourceCount: 2,
    entryCount: 2,
    protectedTokenCount: 3,
    entries: [ENTRY, r05Entry],
    issues: [],
    diagnostics: [],
  };

  assert.deepEqual(
    selectReviewEntries(lintReport, { mode: "all" }).map(({ id }) => id),
    [ENTRY.id, r05Entry.id],
  );
  assert.deepEqual(
    selectReviewEntries(lintReport, {
      mode: "speaker",
      speakerId: "r05",
    }).map(({ id }) => id),
    [r05Entry.id],
  );
});

test("형식이 잘못된 writer 응답은 같은 모델로 정확히 한 번 repair한다", async () => {
  const models = [];
  const responses = [
    { message: { content: "not json" } },
    { message: { content: JSON.stringify(writerPayload()) } },
    { message: { content: JSON.stringify(criticPayload()) } },
  ];
  const fetchImpl = async (_url, init) => {
    models.push(JSON.parse(String(init?.body)).model);
    return jsonResponse(responses.shift());
  };

  const result = await reviewDialogueBatch({
    apiKey: API_KEY,
    speakerId: "test",
    entries: [ENTRY],
    contextEntries: CONTEXT_ENTRIES,
    issues: [],
    fetchImpl,
  });

  assert.deepEqual(models, [
    DIALOGUE_WRITER_MODEL,
    DIALOGUE_WRITER_MODEL,
    DIALOGUE_CRITIC_MODEL,
  ]);
  assert.equal(result.writerRepairUsed, true);
  assert.equal(result.criticRepairUsed, false);
});

test("repair 뒤에도 보호 토큰이 빠지면 실패하고 추가 호출하지 않는다", async () => {
  const invalidWriter = writerPayload();
  invalidWriter.reviews[0].alternatives = ["눌러 주세요.", "선택하세요.", "확인하세요."];
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return jsonResponse({
      message: { content: JSON.stringify(invalidWriter) },
    });
  };

  await assert.rejects(
    reviewDialogueBatch({
      apiKey: API_KEY,
      speakerId: "test",
      entries: [ENTRY],
      contextEntries: CONTEXT_ENTRIES,
      issues: [],
      fetchImpl,
    }),
    /1회 repair/u,
  );
  assert.equal(callCount, 2);
});

test("보호 수치의 부분 문자열이 남아 있어도 값이 바뀌면 거부한다", async () => {
  const invalidWriter = writerPayload();
  invalidWriter.reviews[0].alternatives = invalidWriter.reviews[0].alternatives.map(
    (alternative) => alternative.replace("3초", "13초"),
  );
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return jsonResponse({
      message: { content: JSON.stringify(invalidWriter) },
    });
  };

  await assert.rejects(
    reviewDialogueBatch({
      apiKey: API_KEY,
      speakerId: "test",
      entries: [ENTRY],
      contextEntries: CONTEXT_ENTRIES,
      issues: [],
      fetchImpl,
    }),
    /1회 repair/u,
  );
  assert.equal(callCount, 2);
});

test("보호 수치 뒤에 한국어 조사가 붙는 자연스러운 대안은 허용한다", async () => {
  const validWriter = writerPayload();
  validWriter.reviews[0].alternatives = [
    "R-05는 3초 안에 “승인”을 누르라고 지시합니다.",
    "R-05 지시입니다. 3초 안에 “승인”을 누르십시오.",
    "3초가 지나기 전 “승인”을 누르십시오. R-05 지시입니다.",
  ];
  const responses = [
    { message: { content: JSON.stringify(validWriter) } },
    { message: { content: JSON.stringify(criticPayload()) } },
  ];
  const fetchImpl = async () => jsonResponse(responses.shift());

  const result = await reviewDialogueBatch({
    apiKey: API_KEY,
    speakerId: "test",
    entries: [ENTRY],
    contextEntries: CONTEXT_ENTRIES,
    issues: [],
    fetchImpl,
  });

  assert.equal(result.writerRepairUsed, false);
});

test("허용 목록 밖의 새 영문 고유명사는 repair 뒤에도 거부한다", async () => {
  const invalidWriter = writerPayload();
  invalidWriter.reviews[0].alternatives = invalidWriter.reviews[0].alternatives.map(
    (alternative) => `${alternative} UNLISTED`,
  );
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return jsonResponse({
      message: { content: JSON.stringify(invalidWriter) },
    });
  };

  await assert.rejects(
    reviewDialogueBatch({
      apiKey: API_KEY,
      speakerId: "test",
      entries: [ENTRY],
      contextEntries: CONTEXT_ENTRIES,
      issues: [],
      fetchImpl,
    }),
    /1회 repair/u,
  );
  assert.equal(callCount, 2);
});

test("critic 4개 점수가 빠지면 같은 모델로 한 번 repair한다", async () => {
  const invalidCritic = criticPayload();
  delete invalidCritic.reviews[0].protectedFacts;
  const models = [];
  const responses = [
    { message: { content: JSON.stringify(writerPayload()) } },
    { message: { content: JSON.stringify(invalidCritic) } },
    { message: { content: JSON.stringify(criticPayload()) } },
  ];
  const fetchImpl = async (_url, init) => {
    models.push(JSON.parse(String(init?.body)).model);
    return jsonResponse(responses.shift());
  };

  const result = await reviewDialogueBatch({
    apiKey: API_KEY,
    speakerId: "test",
    entries: [ENTRY],
    contextEntries: CONTEXT_ENTRIES,
    issues: [],
    fetchImpl,
  });

  assert.deepEqual(models, [
    DIALOGUE_WRITER_MODEL,
    DIALOGUE_CRITIC_MODEL,
    DIALOGUE_CRITIC_MODEL,
  ]);
  assert.equal(result.criticRepairUsed, true);
  assert.equal(result.critic.reviews[0].protectedFacts, 5);
});

test("Ollama 요청이 시간 제한을 넘으면 중단한다", async () => {
  const fetchImpl = async (_url, init) =>
    await new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });

  await assert.rejects(
    reviewDialogueBatch({
      apiKey: API_KEY,
      speakerId: "test",
      entries: [ENTRY],
      contextEntries: CONTEXT_ENTRIES,
      issues: [],
      fetchImpl,
      requestTimeoutMs: 5,
    }),
    /5ms 안에 완료되지 않았습니다/u,
  );
});
