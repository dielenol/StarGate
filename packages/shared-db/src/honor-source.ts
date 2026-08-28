import { createHash } from "node:crypto";

import type {
  HonorCharacterIdentity,
  OperationHonorSourceMaterial,
  OperationHonorSourceSegment,
  SessionReport,
} from "./types/index.js";
import { HONOR_REVIEW_SOURCE_MAX_CHARS } from "./types/index.js";

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

function findBalancedMarkdownEnd(
  value: string,
  start: number,
  open: "[" | "(",
  close: "]" | ")",
): number {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === "\n") return -1;
    let slashCount = 0;
    for (
      let cursor = index - 1;
      cursor >= 0 && value[cursor] === "\\";
      cursor -= 1
    ) {
      slashCount += 1;
    }
    if (slashCount % 2 === 1) continue;
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** 중첩 label/destination과 미종결 링크까지 label을 남기지 않고 제거한다. */
function stripMarkdownLinksAndImages(value: string): string {
  let safe = "";
  for (let index = 0; index < value.length; index += 1) {
    const isImage = value[index] === "!" && value[index + 1] === "[";
    const labelStart = isImage ? index + 1 : index;
    if (value[labelStart] !== "[") {
      safe += value[index];
      continue;
    }
    const labelEnd = findBalancedMarkdownEnd(value, labelStart, "[", "]");
    if (labelEnd < 0) {
      const newline = value.indexOf("\n", labelStart);
      const lineEnd = newline >= 0 ? newline : value.length;
      const remainder = value.slice(labelStart, lineEnd);
      if (/https?:\/\//iu.test(remainder)) {
        safe += " ";
        index = lineEnd - 1;
        continue;
      }
      safe += value[index];
      continue;
    }
    const targetStart = labelEnd + 1;
    const targetMarker = value[targetStart];
    if (targetMarker !== "(" && targetMarker !== "[") {
      if (isImage) {
        safe += " ";
        index = labelEnd;
      } else {
        safe += value[index];
      }
      continue;
    }
    const targetEnd = findBalancedMarkdownEnd(
      value,
      targetStart,
      targetMarker,
      targetMarker === "(" ? ")" : "]",
    );
    safe += " ";
    if (targetEnd >= 0) {
      index = targetEnd;
      continue;
    }
    const newline = value.indexOf("\n", targetStart);
    index = (newline >= 0 ? newline : value.length) - 1;
  }
  return safe;
}

function isRestrictedSourceTitle(value: string): boolean {
  return /^(?:(?:기록\s*)?출처|관련\s*(?:문서|자료|인물|인원|항목)|시각\s*(?:자료|이미지)|이미지|sources?|references?)(?:\s|$|[:：·-])/iu.test(
    value.trim(),
  );
}

function stripRestrictedMarkdownSections(value: string): string {
  const lines = value.normalize("NFC").replace(/\r\n?/g, "\n").split("\n");
  const safe: string[] = [];
  let skippingLevel: number | null = null;
  let skippingPlainBlock = false;
  let fence: "`" | "~" | null = null;
  for (const rawLine of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/u.exec(rawLine);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0] as "`" | "~";
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    if (skippingPlainBlock) {
      if (rawLine.trim().length === 0) skippingPlainBlock = false;
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*$/.exec(rawLine);
    if (heading) {
      const level = heading[1]!.length;
      const title = heading[2]!.trim();
      if (isRestrictedSourceTitle(title)) {
        skippingLevel = level;
        continue;
      }
      if (skippingLevel !== null && level <= skippingLevel) skippingLevel = null;
    }
    const plainLabel =
      /^\s*(?:[-*+>]\s*)?(?:\*\*|__)?(.+?)(?:\*\*|__)?\s*[:：](?:\s|$)/u.exec(
        rawLine,
      );
    if (
      skippingLevel === null &&
      plainLabel &&
      isRestrictedSourceTitle(plainLabel[1]!)
    ) {
      skippingPlainBlock = true;
      continue;
    }
    if (skippingLevel === null) safe.push(rawLine);
  }
  return safe.join("\n");
}

/** 이미지·관련문서·출처 표현과 fenced code를 공적 검토 본문에서 제거한다. */
export function sanitizeOperationHonorSourceText(value: string): string {
  return stripMarkdownLinksAndImages(stripRestrictedMarkdownSections(value))
    .replace(/<a\b[^>]*>[\s\S]*?(?:<\/a>|$)/giu, " ")
    .replace(/<img\b[^>]*(?:>|$)/giu, " ")
    .replace(/\[\[(?:wiki|catalog|personnel|report):[^\]\n]*(?:\]\]|$)/gimu, " ")
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gmu, " ")
    .replace(/<https?:\/\/[^>]+>/giu, " ")
    .replace(/https?:\/\/[^\s)>\]]+/giu, " ")
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
 * 수동 검토와 Web stale 검사가 함께 쓰는 canonical source material/hash helper.
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
    HONOR_REVIEW_SOURCE_MAX_CHARS,
    Math.max(1_000, input.maxChars ?? HONOR_REVIEW_SOURCE_MAX_CHARS),
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
