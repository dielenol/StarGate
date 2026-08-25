import { createHash } from "node:crypto";

import type {
  HonorCharacterIdentity,
  OperationHonorSourceMaterial,
  OperationHonorSourceSegment,
  SessionReport,
} from "./types/index.js";
import { HONOR_ANALYSIS_SOURCE_MAX_CHARS } from "./types/index.js";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function stripRestrictedMarkdownSections(value: string): string {
  const lines = value.normalize("NFC").replace(/\r\n?/g, "\n").split("\n");
  const safe: string[] = [];
  let skippingLevel: number | null = null;
  for (const rawLine of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine);
    if (heading) {
      const level = heading[1]!.length;
      const title = heading[2]!.trim();
      if (
        /^(?:출처|관련\s*(?:문서|자료|인물|항목)|이미지|sources?|references?)(?:\s|$|[:：])/iu.test(
          title,
        )
      ) {
        skippingLevel = level;
        continue;
      }
      if (skippingLevel !== null && level <= skippingLevel) skippingLevel = null;
    }
    if (skippingLevel === null) safe.push(rawLine);
  }
  return safe.join("\n");
}

/** 이미지·관련문서·출처 표현과 fenced code를 Cloud 분석 입력에서 제거한다. */
export function sanitizeOperationHonorSourceText(value: string): string {
  return stripRestrictedMarkdownSections(value)
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/<img\b[^>]*>/giu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\[\[(?:wiki|catalog|personnel|report):[^|\]]+\|?([^\]]*)\]\]/giu, "$1")
    .replace(/https?:\/\/[^\s)>\]]+/giu, " ")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/[\t ]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function truncateUtf16(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  let end = maxChars;
  const code = value.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return value.slice(0, end).trimEnd();
}

function fitSegmentsToSourceLimit(
  segments: readonly OperationHonorSourceSegment[],
  maxChars: number,
): { segments: OperationHonorSourceSegment[]; text: string } {
  const fitted: OperationHonorSourceSegment[] = [];
  let text = "";
  for (const segment of segments) {
    const marker = `[${segment.section} ${fitted.length + 1}]\n`;
    const separator = fitted.length > 0 ? "\n\n" : "";
    const remaining = maxChars - text.length - separator.length - marker.length;
    if (remaining <= 0) break;
    const segmentText = truncateUtf16(segment.text, remaining);
    if (!segmentText) break;
    fitted.push({ section: segment.section, text: segmentText });
    text += `${separator}${marker}${segmentText}`;
    if (segmentText.length < segment.text.length) break;
  }
  return { segments: fitted, text };
}

/**
 * worker와 Web stale 검사가 함께 쓰는 canonical source material/hash helper.
 * minRole이 없거나 U인 보고서와 명시적으로 연결된 player-owned AGENT만 허용한다.
 */
export function buildOperationHonorSourceMaterial(input: {
  report: Pick<
    SessionReport,
    | "_id"
    | "sessionId"
    | "minRole"
    | "summary"
    | "highlights"
    | "relatedPersonnelCodenames"
    | "updatedAt"
  >;
  characters: readonly HonorCharacterIdentity[];
  maxChars?: number;
}): OperationHonorSourceMaterial | null {
  if (input.report.minRole != null && input.report.minRole !== "U") return null;
  const sourceKey = input.report.sessionId.trim();
  if (!sourceKey) return null;

  const related = new Set(input.report.relatedPersonnelCodenames ?? []);
  const matchingCharacters = input.characters.filter(
    (character) => related.has(character.codename) && character._id,
  );
  const codenameCounts = new Map<string, number>();
  for (const character of matchingCharacters) {
    codenameCounts.set(
      character.codename,
      (codenameCounts.get(character.codename) ?? 0) + 1,
    );
  }
  const candidates = matchingCharacters
    .filter(
      (character) =>
        codenameCounts.get(character.codename) === 1 &&
        character.type === "AGENT" &&
        typeof character.ownerId === "string" &&
        character.ownerId.length > 0
    )
    .map((character) => ({
      characterId: String(character._id),
      codename: character.codename,
    }))
    .filter(
      (candidate, index, rows) =>
        rows.findIndex(
          (row) =>
            row.characterId === candidate.characterId &&
            row.codename === candidate.codename,
        ) === index,
    )
    // legacy/index rollout 상태에서도 같은 코드네임을 임의 characterId에 귀속하지 않는다.
    .sort((left, right) => left.codename.localeCompare(right.codename, "ko"));
  if (candidates.length === 0) return null;

  const segments: OperationHonorSourceSegment[] = [];
  const summary = sanitizeOperationHonorSourceText(input.report.summary);
  if (summary) segments.push({ section: "SUMMARY", text: summary });
  for (const highlight of input.report.highlights) {
    const text = sanitizeOperationHonorSourceText(highlight);
    if (text) segments.push({ section: "HIGHLIGHT", text });
  }
  if (segments.length === 0) return null;

  const maxChars = Math.min(
    HONOR_ANALYSIS_SOURCE_MAX_CHARS,
    Math.max(1_000, input.maxChars ?? HONOR_ANALYSIS_SOURCE_MAX_CHARS),
  );
  const limited = fitSegmentsToSourceLimit(segments, maxChars);
  if (!limited.text) return null;
  const sourceHash = createHash("sha256")
    .update(
      stableJson({
        sourceRecordId: String(input.report._id ?? ""),
        sourceKey,
        sourceRevision: input.report.updatedAt.toISOString(),
        candidates,
        text: limited.text,
      }),
    )
    .digest("hex");
  return {
    sourceKey,
    sourceHash,
    candidates,
    segments: limited.segments,
    text: limited.text,
  };
}
