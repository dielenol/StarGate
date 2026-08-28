import { createHash } from "node:crypto";

import {
  buildHonorPublicKey,
  buildOperationHonorLogicalKey,
  buildOperationHonorSourceMaterial,
  HONOR_LORE_REVIEW_REVISION,
  HONOR_REVIEW_SOURCE_MAX_CHARS,
  type HonorCharacterIdentity,
  type HonorEvidenceAudit,
  type OperationHonorCategory,
  type OperationHonorSourceCandidate,
  type OperationHonorSourceSegment,
  type SessionReport,
  type UpsertHonorRecordInput,
} from "@stargate/shared-db";

export {
  buildOperationHonorSourceMaterial,
  sanitizeOperationHonorSourceText as sanitizeHonorReviewText,
  HONOR_LORE_REVIEW_REVISION,
  HONOR_REVIEW_SOURCE_MAX_CHARS,
} from "@stargate/shared-db";
export type { HonorCharacterIdentity } from "@stargate/shared-db";

export const OPERATION_HONOR_REVIEW_MAX_RECORDS_PER_REPORT = 3;
const OPERATION_HONOR_REVIEW_MAX_EVIDENCE_QUOTES = 8;
const OPERATION_HONOR_EVIDENCE_MAX_OCCURRENCES = 64;

export const OPERATION_HONOR_CATEGORY_LABELS: Record<
  OperationHonorCategory,
  string
> = {
  COMBAT: "전투 공적",
  COMMAND: "지휘 공적",
  RESCUE_PROTECTION: "구조·보호",
  RESEARCH_TECH: "연구·기술",
  SUPPORT_TEAMWORK: "지원·공조",
  INTELLIGENCE_JUDGMENT: "정보·판단",
};

const OPERATION_HONOR_CATEGORIES = new Set<OperationHonorCategory>(
  Object.keys(OPERATION_HONOR_CATEGORY_LABELS) as OperationHonorCategory[],
);

export type OperationHonorReviewCandidateCharacter =
  OperationHonorSourceCandidate;
export type OperationHonorReviewSourceSegment = OperationHonorSourceSegment;

export interface OperationHonorReviewSource {
  sourceKey: string;
  sourceRecordId: string;
  sourceLabel: string;
  sourceHash: string;
  occurredAt: Date;
  candidates: OperationHonorReviewCandidateCharacter[];
  segments: OperationHonorReviewSourceSegment[];
  text: string;
}

export interface OperationHonorReviewItem {
  codename: string;
  category: OperationHonorCategory;
  title: string;
  citation: string;
  evidenceQuotes: string[];
}

export interface ValidatedOperationHonor {
  characterId: string;
  codename: string;
  category: OperationHonorCategory;
  title: string;
  citation: string;
  evidenceAudit: HonorEvidenceAudit[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** U 공개 보고서와 명시적으로 연결된 플레이어 소유 AGENT만 검토 source로 만든다. */
export function reduceOperationHonorSource(input: {
  report: SessionReport;
  characters: readonly HonorCharacterIdentity[];
  maxChars?: number;
}): OperationHonorReviewSource | null {
  if (!input.report._id || !input.report.sessionId.trim()) return null;
  const material = buildOperationHonorSourceMaterial(input);
  if (!material) return null;
  return {
    ...material,
    sourceRecordId: String(input.report._id),
    sourceLabel: input.report.sessionTitle,
    occurredAt: input.report.createdAt,
  };
}

const FORBIDDEN_PUBLIC_PROSE =
  /(?:\b(?:prompt|payload|sourceHash|database|mongodb|ollama|model)\b|_id|\/Users\/|https?:\/\/)/iu;

function safePublicText(value: string, maxLength: number): string | null {
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    FORBIDDEN_PUBLIC_PROSE.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function evidenceAuditForReviewItem(
  source: OperationHonorReviewSource,
  evidenceQuotes: readonly string[],
): HonorEvidenceAudit[] | null {
  if (
    evidenceQuotes.length < 2 ||
    evidenceQuotes.length > OPERATION_HONOR_REVIEW_MAX_EVIDENCE_QUOTES
  ) {
    return null;
  }
  const unique = [
    ...new Set(
      evidenceQuotes
        .map((quote) => quote.normalize("NFC").trim())
        .filter((quote) => quote.length >= 4 && quote.length <= 500),
    ),
  ];
  if (unique.length < 2) return null;

  interface EvidenceRange {
    quote: string;
    segmentIndex: number;
    start: number;
    end: number;
  }

  const rangesByQuote = unique.map((quote) => {
    const ranges: EvidenceRange[] = [];
    let ambiguous = false;
    for (
      let segmentIndex = 0;
      segmentIndex < source.segments.length;
      segmentIndex += 1
    ) {
      const segment = source.segments[segmentIndex]!;
      let offset = 0;
      while (offset <= segment.text.length - quote.length) {
        const start = segment.text.indexOf(quote, offset);
        if (start < 0) break;
        ranges.push({
          quote,
          segmentIndex,
          start,
          end: start + quote.length,
        });
        if (ranges.length > OPERATION_HONOR_EVIDENCE_MAX_OCCURRENCES) {
          ambiguous = true;
          break;
        }
        offset = start + 1;
      }
      if (ambiguous) break;
    }
    return ambiguous ? [] : ranges;
  });
  if (rangesByQuote.some((ranges) => ranges.length === 0)) return null;

  const overlaps = (left: EvidenceRange, right: EvidenceRange): boolean =>
    left.segmentIndex === right.segmentIndex &&
    left.start < right.end &&
    right.start < left.end;
  let selected: EvidenceRange[] | null = null;
  pair: for (let leftIndex = 0; leftIndex < rangesByQuote.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < rangesByQuote.length;
      rightIndex += 1
    ) {
      for (const left of rangesByQuote[leftIndex]!) {
        for (const right of rangesByQuote[rightIndex]!) {
          if (!overlaps(left, right)) {
            selected = [left, right];
            break pair;
          }
        }
      }
    }
  }
  if (!selected) return null;
  for (const ranges of rangesByQuote) {
    if (selected.some((item) => item.quote === ranges[0]?.quote)) continue;
    const range = ranges.find((candidate) =>
      selected!.every((chosen) => !overlaps(candidate, chosen)),
    );
    if (range) selected.push(range);
  }
  return selected.map((range) => ({
    hash: sha256(range.quote),
    section: source.segments[range.segmentIndex]!.section,
  }));
}

/**
 * stargate-lore가 확정한 후보만 허용 AGENT·부문·공개 문구·원문 근거로
 * 다시 검증한다. 외부 모델의 점수나 합의는 입력으로 받지 않는다.
 */
export function validateOperationHonorReview(input: {
  source: OperationHonorReviewSource;
  items: readonly OperationHonorReviewItem[];
}): ValidatedOperationHonor[] {
  if (input.items.length > OPERATION_HONOR_REVIEW_MAX_RECORDS_PER_REPORT) {
    throw new Error("OPERATION_HONOR_REVIEW_SOURCE_LIMIT_INVALID");
  }
  const candidatesByCodename = new Map(
    input.source.candidates.map((candidate) => [candidate.codename, candidate]),
  );
  const seenCodenames = new Set<string>();
  const validated: ValidatedOperationHonor[] = [];
  for (const item of input.items) {
    const character = candidatesByCodename.get(item.codename);
    const title = safePublicText(item.title, 60);
    const citation = safePublicText(item.citation, 240);
    const evidenceAudit = evidenceAuditForReviewItem(
      input.source,
      item.evidenceQuotes,
    );
    if (
      !character ||
      seenCodenames.has(item.codename) ||
      !OPERATION_HONOR_CATEGORIES.has(item.category) ||
      !title ||
      !citation ||
      !evidenceAudit
    ) {
      throw new Error("OPERATION_HONOR_REVIEW_ITEM_REJECTED");
    }
    seenCodenames.add(item.codename);
    validated.push({
      characterId: character.characterId,
      codename: item.codename,
      category: item.category,
      title,
      citation,
      evidenceAudit,
    });
  }
  return validated;
}

export function buildOperationHonorRecords(input: {
  source: OperationHonorReviewSource;
  honors: readonly ValidatedOperationHonor[];
  issuedAt?: Date;
  analyzerRevision?: string;
}): UpsertHonorRecordInput[] {
  const issuedAt = input.issuedAt ?? new Date();
  const analyzerRevision =
    input.analyzerRevision ?? HONOR_LORE_REVIEW_REVISION;
  return input.honors.map((honor) => {
    const logicalKey = buildOperationHonorLogicalKey(
      input.source.sourceKey,
      honor.characterId,
    );
    return {
      publicKey: buildHonorPublicKey(logicalKey),
      logicalKey,
      domain: "OPERATION",
      category: honor.category,
      characterId: honor.characterId,
      codenameSnapshot: honor.codename,
      title: honor.title,
      citation: honor.citation,
      source: {
        type: "SESSION_REPORT",
        key: input.source.sourceKey,
        recordId: input.source.sourceRecordId,
        label: input.source.sourceLabel,
        href: `/erp/sessions/report/${encodeURIComponent(input.source.sourceRecordId)}`,
      },
      sourceHash: input.source.sourceHash,
      analyzerRevision,
      minRole: "U",
      evidenceAudit: honor.evidenceAudit,
      status: "ACTIVE",
      occurredAt: input.source.occurredAt,
      issuedAt,
      updatedAt: issuedAt,
    };
  });
}
