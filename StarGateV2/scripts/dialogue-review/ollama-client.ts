import { extractProtectedTokens } from "./source-loader.ts";
import type {
  CriticLineReview,
  CriticReviewResult,
  DialogueEntry,
  DialogueLintIssue,
  DialogueReviewBatch,
  ProtectedToken,
  WriterAlternativeReview,
  WriterReviewResult,
} from "./types.ts";

export const OLLAMA_API_BASE_URL = "https://ollama.com";
export const DIALOGUE_WRITER_MODEL = "qwen3.5:397b";
export const DIALOGUE_CRITIC_MODEL = "gpt-oss:120b";
export const OLLAMA_PREFLIGHT_TIMEOUT_MS = 30_000;
export const OLLAMA_CHAT_TIMEOUT_MS = 10 * 60 * 1_000;

type FetchImplementation = typeof fetch;
type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ValidatedChatResult<T> {
  value: T;
  repairUsed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isReviewScore(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;
}

function extractFirstJsonObject(value: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (start < 0) {
      if (character !== "{") continue;
      start = index;
      depth = 1;
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }

  return null;
}

export function parsePlainJson(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const objectText = extractFirstJsonObject(trimmed);
    if (!objectText) throw new Error("응답에서 JSON 객체를 찾지 못했습니다.");
    try {
      return JSON.parse(objectText) as unknown;
    } catch {
      throw new Error("응답의 JSON 객체를 파싱하지 못했습니다.");
    }
  }
}

async function fetchJson(
  fetchImpl: FetchImplementation,
  url: string,
  init: RequestInit,
  requestTimeoutMs: number,
): Promise<unknown> {
  const abortController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, Math.max(1, requestTimeoutMs));
  let response: Response;
  try {
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: abortController.signal,
      });
    } catch {
      if (timedOut) {
        throw new Error(
          `Ollama Cloud 요청이 ${requestTimeoutMs}ms 안에 완료되지 않았습니다.`,
        );
      }
      throw new Error("Ollama Cloud 요청에 실패했습니다.");
    }
    if (!response.ok) {
      throw new Error(
        `Ollama Cloud 요청이 HTTP ${response.status}로 실패했습니다.`,
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new Error("Ollama Cloud 응답이 JSON이 아닙니다.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

function authorizationHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function preflightOllamaCloud(options: {
  apiKey: string;
  fetchImpl?: FetchImplementation;
  requestTimeoutMs?: number;
}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const payload = await fetchJson(
    fetchImpl,
    `${OLLAMA_API_BASE_URL}/api/tags`,
    {
      method: "GET",
      headers: authorizationHeaders(options.apiKey),
    },
    options.requestTimeoutMs ?? OLLAMA_PREFLIGHT_TIMEOUT_MS,
  );
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    throw new Error("Ollama Cloud 모델 목록 응답 형식이 올바르지 않습니다.");
  }
  const names = new Set(
    payload.models.flatMap((model) =>
      isRecord(model) && nonEmptyString(model.name) ? [model.name] : [],
    ),
  );
  const missingModels = [DIALOGUE_WRITER_MODEL, DIALOGUE_CRITIC_MODEL].filter(
    (model) => !names.has(model),
  );
  if (missingModels.length > 0) {
    throw new Error(
      `Ollama Cloud에서 필요한 모델을 확인하지 못했습니다: ${missingModels.join(", ")}`,
    );
  }
}

async function chat(options: {
  apiKey: string;
  model: string;
  messages: readonly ChatMessage[];
  fetchImpl: FetchImplementation;
  requestTimeoutMs?: number;
}): Promise<string> {
  const payload = await fetchJson(
    options.fetchImpl,
    `${OLLAMA_API_BASE_URL}/api/chat`,
    {
      method: "POST",
      headers: authorizationHeaders(options.apiKey),
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: false,
      }),
    },
    options.requestTimeoutMs ?? OLLAMA_CHAT_TIMEOUT_MS,
  );
  if (
    !isRecord(payload) ||
    !isRecord(payload.message) ||
    !nonEmptyString(payload.message.content)
  ) {
    throw new Error("Ollama Cloud chat 응답 형식이 올바르지 않습니다.");
  }
  return payload.message.content;
}

async function chatWithOneRepair<T>(options: {
  apiKey: string;
  model: string;
  messages: readonly ChatMessage[];
  validate: (value: unknown) => T;
  fetchImpl: FetchImplementation;
  requestTimeoutMs?: number;
}): Promise<ValidatedChatResult<T>> {
  const firstContent = await chat(options);
  try {
    return {
      value: options.validate(parsePlainJson(firstContent)),
      repairUsed: false,
    };
  } catch (error) {
    const repairReason =
      error instanceof Error ? error.message : "JSON 계약 검증 실패";
    const repairContent = await chat({
      ...options,
      messages: [
        ...options.messages,
        { role: "assistant", content: firstContent },
        {
          role: "user",
          content: `직전 응답은 JSON 파싱 또는 계약 검증에 실패했습니다: ${repairReason} 누락·중복 없이 계약을 고쳐 JSON 객체만 다시 출력하세요. 마크다운 코드 펜스와 설명은 금지합니다.`,
        },
      ],
    });
    try {
      return {
        value: options.validate(parsePlainJson(repairContent)),
        repairUsed: true,
      };
    } catch {
      throw new Error(
        `${options.model} 응답이 1회 repair 뒤에도 JSON 계약을 충족하지 못했습니다.`,
      );
    }
  }
}

function assertExactLineIds(
  reviews: readonly { lineId: string }[],
  expectedEntries: readonly DialogueEntry[],
): void {
  const expectedIds = new Set(expectedEntries.map((entry) => entry.id));
  const receivedIds = new Set(reviews.map((review) => review.lineId));
  if (
    receivedIds.size !== reviews.length ||
    receivedIds.size !== expectedIds.size ||
    [...expectedIds].some((lineId) => !receivedIds.has(lineId))
  ) {
    throw new Error("리뷰 lineId 목록이 요청한 대사 목록과 일치하지 않습니다.");
  }
}

const TOKEN_BOUNDARY_CHARACTER = /[A-Za-z0-9_]/u;

function protectedTokenKey(token: ProtectedToken): string {
  return `${token.kind}\u0000${token.value}`;
}

function countExactTokenOccurrences(text: string, value: string): number {
  if (!value) return 0;
  const requireLeadingBoundary = TOKEN_BOUNDARY_CHARACTER.test(value[0] ?? "");
  const requireTrailingBoundary = TOKEN_BOUNDARY_CHARACTER.test(
    value[value.length - 1] ?? "",
  );
  let count = 0;
  let offset = 0;

  while (offset <= text.length - value.length) {
    const index = text.indexOf(value, offset);
    if (index < 0) break;
    const precedingCharacter = index > 0 ? text[index - 1] ?? "" : "";
    const followingCharacter = text[index + value.length] ?? "";
    const leadingBoundaryValid =
      !requireLeadingBoundary ||
      !precedingCharacter ||
      !TOKEN_BOUNDARY_CHARACTER.test(precedingCharacter);
    const trailingBoundaryValid =
      !requireTrailingBoundary ||
      !followingCharacter ||
      !TOKEN_BOUNDARY_CHARACTER.test(followingCharacter);
    if (leadingBoundaryValid && trailingBoundaryValid) count += 1;
    offset = index + Math.max(1, value.length);
  }

  return count;
}

function protectedTokensForEntry(entry: DialogueEntry): ProtectedToken[] {
  const tokens = [
    ...entry.protectedTokens,
    ...extractProtectedTokens(entry.text, entry.allowedProperNouns),
  ];
  return [
    ...new Map(tokens.map((token) => [protectedTokenKey(token), token])).values(),
  ];
}

function validateProtectedTokens(
  entry: DialogueEntry,
  alternative: string,
): void {
  const expectedTokens = protectedTokensForEntry(entry);
  for (const token of expectedTokens) {
    const originalCount = countExactTokenOccurrences(entry.text, token.value);
    const alternativeCount = countExactTokenOccurrences(
      alternative,
      token.value,
    );
    if (alternativeCount !== originalCount) {
      throw new Error(
        "writer 대안에서 보호 토큰의 정확한 값 또는 출현 횟수가 바뀌었습니다.",
      );
    }
  }

  const expectedTokenKeys = new Set(expectedTokens.map(protectedTokenKey));
  const unexpectedToken = extractProtectedTokens(
    alternative,
    entry.allowedProperNouns,
  ).find(
    (token) =>
      token.kind !== "proper-noun" &&
      !expectedTokenKeys.has(protectedTokenKey(token)),
  );
  if (unexpectedToken) {
    throw new Error("writer 대안에 원문에 없던 수치·버튼명·placeholder가 추가되었습니다.");
  }
}

function validateWriterResult(
  value: unknown,
  entries: readonly DialogueEntry[],
): WriterReviewResult {
  if (!isRecord(value) || !Array.isArray(value.reviews)) {
    throw new Error("writer 응답에 reviews 배열이 없습니다.");
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const reviews: WriterAlternativeReview[] = value.reviews.map((review) => {
    if (
      !isRecord(review) ||
      !nonEmptyString(review.lineId) ||
      !Array.isArray(review.alternatives) ||
      review.alternatives.length !== 3 ||
      !review.alternatives.every(nonEmptyString) ||
      !nonEmptyString(review.rationale)
    ) {
      throw new Error("writer 리뷰 항목 형식이 올바르지 않습니다.");
    }
    const entry = byId.get(review.lineId);
    if (!entry) throw new Error("writer가 알 수 없는 lineId를 반환했습니다.");
    const alternatives = review.alternatives as [string, string, string];
    if (new Set(alternatives).size !== 3) {
      throw new Error("writer 대안 3개가 서로 달라야 합니다.");
    }
    for (const alternative of alternatives) {
      validateProtectedTokens(entry, alternative);
      const originalUppercaseTerms = new Set(
        entry.text.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/gu) ?? [],
      );
      const allowedProperNouns = new Set([
        ...entry.allowedProperNouns,
        ...originalUppercaseTerms,
      ]);
      const unexpectedTerm = (
        alternative.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/gu) ?? []
      ).find((term) => !allowedProperNouns.has(term));
      if (unexpectedTerm) {
        throw new Error("writer 대안에 허용되지 않은 고유명사가 추가되었습니다.");
      }
    }
    return {
      lineId: review.lineId,
      alternatives,
      rationale: review.rationale,
    };
  });
  assertExactLineIds(reviews, entries);
  return { reviews };
}

function validateCriticResult(
  value: unknown,
  entries: readonly DialogueEntry[],
): CriticReviewResult {
  if (!isRecord(value) || !Array.isArray(value.reviews)) {
    throw new Error("critic 응답에 reviews 배열이 없습니다.");
  }
  const verdicts = new Set(["accept", "revise", "keep-original"]);
  const recommendations = new Set<unknown>([1, 2, 3, null]);
  const reviews: CriticLineReview[] = value.reviews.map((review) => {
    if (
      !isRecord(review) ||
      !nonEmptyString(review.lineId) ||
      !recommendations.has(review.recommendedAlternative) ||
      !nonEmptyString(review.verdict) ||
      !verdicts.has(review.verdict) ||
      !nonEmptyString(review.notes) ||
      review.protectedTokensPreserved !== true ||
      !isReviewScore(review.naturalness) ||
      !isReviewScore(review.characterFit) ||
      !isReviewScore(review.loreGrounding) ||
      !isReviewScore(review.protectedFacts)
    ) {
      throw new Error("critic 리뷰 항목 형식이 올바르지 않습니다.");
    }
    return {
      lineId: review.lineId,
      recommendedAlternative: review.recommendedAlternative as
        | 1
        | 2
        | 3
        | null,
      verdict: review.verdict as CriticLineReview["verdict"],
      notes: review.notes,
      protectedTokensPreserved: review.protectedTokensPreserved,
      naturalness: review.naturalness,
      characterFit: review.characterFit,
      loreGrounding: review.loreGrounding,
      protectedFacts: review.protectedFacts,
    };
  });
  assertExactLineIds(reviews, entries);
  return { reviews };
}

function lintRulesByEntry(
  entries: readonly DialogueEntry[],
  issues: readonly DialogueLintIssue[],
): Record<string, string[]> {
  const selected = new Set(entries.map((entry) => entry.id));
  const result: Record<string, string[]> = {};
  for (const issue of issues) {
    for (const entryId of issue.entryIds) {
      if (!selected.has(entryId)) continue;
      result[entryId] = [...(result[entryId] ?? []), issue.rule];
    }
  }
  return result;
}

function writerMessages(
  entries: readonly DialogueEntry[],
  contextEntries: readonly DialogueEntry[],
  issues: readonly DialogueLintIssue[],
): ChatMessage[] {
  const lintRules = lintRulesByEntry(entries, issues);
  const speaker = entries[0];
  return [
    {
      role: "system",
      content:
        "당신은 한국어 게임 NPC 대사 편집자입니다. voiceCard와 같은 화자의 문맥을 따르며 반복·장문·호흡 문제만 최소 수정합니다. 숫자, 따옴표 버튼명, ${...} placeholder, 원문의 허용 고유명사는 철자와 구두점까지 그대로 보존합니다. 소스 패치나 자동 적용 지시는 만들지 않습니다.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "각 lineId마다 서로 다른 대안 3개를 작성하세요.",
        speaker: {
          speakerId: speaker?.speakerId,
          speakerName: speaker?.speakerName,
          voiceCard: speaker?.voiceCard,
          allowedProperNouns: speaker?.allowedProperNouns ?? [],
        },
        voiceContext: contextEntries.map((entry) => ({
          lineId: entry.id,
          speakerId: entry.speakerId,
          text: entry.text,
        })),
        outputContract: {
          reviews: [
            {
              lineId: "요청에 있는 정확한 id",
              alternatives: ["대안 1", "대안 2", "대안 3"],
              rationale: "짧은 한국어 근거",
            },
          ],
        },
        constraints: [
          "JSON 객체만 출력",
          "모든 lineId를 정확히 한 번 포함",
          "alternatives는 정확히 3개",
          "protectedTokens의 모든 value를 각 대안에 그대로 포함",
          "allowedProperNouns 밖의 새 고유명사를 만들지 않음",
          "새 설정·수치·버튼명을 만들지 않음",
        ],
        lines: entries.map((entry) => ({
          lineId: entry.id,
          speakerId: entry.speakerId,
          original: entry.text,
          lintRules: lintRules[entry.id] ?? [],
          protectedTokens: entry.protectedTokens,
        })),
      }),
    },
  ];
}

function criticMessages(
  entries: readonly DialogueEntry[],
  contextEntries: readonly DialogueEntry[],
  writer: WriterReviewResult,
): ChatMessage[] {
  const originals = new Map(entries.map((entry) => [entry.id, entry]));
  const speaker = entries[0];
  return [
    {
      role: "system",
      content:
        "당신은 한국어 게임 NPC 대사 비평가입니다. voiceCard와 같은 화자의 문맥을 기준으로 원문 사실성, 캐릭터 말투, 자연스러운 호흡, 보호 토큰과 허용 고유명사 보존을 엄격히 검토합니다. 소스 변경 지시는 하지 않습니다.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "각 lineId의 대안 3개를 평가하고 하나를 추천하거나 원문 유지를 판정하세요.",
        speaker: {
          speakerId: speaker?.speakerId,
          speakerName: speaker?.speakerName,
          voiceCard: speaker?.voiceCard,
          allowedProperNouns: speaker?.allowedProperNouns ?? [],
        },
        voiceContext: contextEntries.map((entry) => ({
          lineId: entry.id,
          speakerId: entry.speakerId,
          text: entry.text,
        })),
        outputContract: {
          reviews: [
            {
              lineId: "요청에 있는 정확한 id",
              recommendedAlternative: 1,
              verdict: "accept",
              notes: "짧은 한국어 근거",
              protectedTokensPreserved: true,
              naturalness: 5,
              characterFit: 5,
              loreGrounding: 5,
              protectedFacts: 5,
            },
          ],
        },
        constraints: [
          "JSON 객체만 출력",
          "모든 lineId를 정확히 한 번 포함",
          "recommendedAlternative는 1, 2, 3, null 중 하나",
          "verdict는 accept, revise, keep-original 중 하나",
          "추천할 대안이 없으면 recommendedAlternative는 null",
          "보호 토큰을 하나라도 바꾼 대안은 추천하지 않음",
          "네 평가 점수는 각각 1~5 정수",
        ],
        lines: writer.reviews.map((review) => {
          const entry = originals.get(review.lineId);
          return {
            lineId: review.lineId,
            original: entry?.text,
            protectedTokens: entry?.protectedTokens ?? [],
            alternatives: review.alternatives,
            writerRationale: review.rationale,
          };
        }),
      }),
    },
  ];
}

export async function reviewDialogueBatch(options: {
  apiKey: string;
  speakerId: string;
  entries: readonly DialogueEntry[];
  contextEntries: readonly DialogueEntry[];
  issues: readonly DialogueLintIssue[];
  fetchImpl?: FetchImplementation;
  requestTimeoutMs?: number;
}): Promise<DialogueReviewBatch> {
  if (options.entries.length === 0) {
    throw new Error("빈 대사 묶음은 Ollama 리뷰에 보낼 수 없습니다.");
  }
  if (
    options.contextEntries.length < 8 ||
    options.contextEntries.length > 12
  ) {
    throw new Error("writer 화자 context는 8~12문장이어야 합니다.");
  }
  if (
    [...options.entries, ...options.contextEntries].some(
      (entry) => entry.speakerId !== options.speakerId,
    )
  ) {
    throw new Error("writer 대상과 context는 모두 같은 화자여야 합니다.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const writer = await chatWithOneRepair({
    apiKey: options.apiKey,
    model: DIALOGUE_WRITER_MODEL,
    messages: writerMessages(
      options.entries,
      options.contextEntries,
      options.issues,
    ),
    validate: (value) => validateWriterResult(value, options.entries),
    fetchImpl,
    requestTimeoutMs: options.requestTimeoutMs,
  });
  const critic = await chatWithOneRepair({
    apiKey: options.apiKey,
    model: DIALOGUE_CRITIC_MODEL,
    messages: criticMessages(
      options.entries,
      options.contextEntries,
      writer.value,
    ),
    validate: (value) => validateCriticResult(value, options.entries),
    fetchImpl,
    requestTimeoutMs: options.requestTimeoutMs,
  });

  return {
    speakerId: options.speakerId,
    entries: [...options.entries],
    writer: writer.value,
    critic: critic.value,
    writerRepairUsed: writer.repairUsed,
    criticRepairUsed: critic.repairUsed,
  };
}
