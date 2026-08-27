/**
 * Evidence-grounded historical operation-honor review.
 *
 * This tool never writes MongoDB. It converts a human-reviewed plan into the
 * same hash-locked manifest consumed by backfill.ts. A planned report-linkage
 * payload can be overlaid for preflight only; a materializable manifest always
 * uses the current persisted report revision and candidate links.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildOperationHonorRecords,
  reduceOperationHonorSource,
  sanitizeHonorAnalysisText,
  validateOperationHonorResults,
  type HonorAnalysisSource,
  type HonorModelCandidate,
} from "@stargate/core";
import {
  close,
  connect,
  charactersCol,
  findHonorCandidateCharactersByCodenames,
  HONOR_MANUAL_REVIEW_REVISION,
  sessionReportVisibilityFilter,
  sessionReportsCol,
  type OperationHonorCategory,
  type SessionReport,
} from "@stargate/shared-db";

import {
  buildSkippedOperationSourceFingerprint,
  createHallOfFameBackfillManifest,
  serializeHonorRecord,
  type HallOfFameBackfillManifest,
  type HallOfFameBackfillSkippedSource,
  type HallOfFameOperationManifestEntry,
} from "./manifest.ts";

export const MANUAL_OPERATION_HONOR_REVIEW_VERSION = 1 as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");
const CATEGORY_SET = new Set<OperationHonorCategory>([
  "COMBAT",
  "COMMAND",
  "RESCUE_PROTECTION",
  "RESEARCH_TECH",
  "SUPPORT_TEAMWORK",
  "INTELLIGENCE_JUDGMENT",
]);

export type ManualEvidenceSelector =
  | { section: "HIGHLIGHT"; index: number }
  | { section: "SUMMARY"; contains: string };

export interface ManualOperationHonorReviewItem {
  sourceKey: string;
  codename: string;
  category: OperationHonorCategory;
  title: string;
  citation: string;
  evidence: [ManualEvidenceSelector, ManualEvidenceSelector, ...ManualEvidenceSelector[]];
}

export interface ManualOperationHonorReviewedSource {
  sourceKey: string;
  contentHash: string;
  outcome: "AWARDED" | "NO_AWARD";
}

export interface ManualOperationHonorReviewPlan {
  schemaVersion: typeof MANUAL_OPERATION_HONOR_REVIEW_VERSION;
  reviewedSources: ManualOperationHonorReviewedSource[];
  items: ManualOperationHonorReviewItem[];
}

interface PlannedLinkage {
  codenames: string[];
  expectedUpdatedAt: string;
}

interface CliOptions {
  reviewPath: string;
  outputPath?: string;
  plannedLinkagePath?: string;
  help: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`MANUAL_REVIEW_${field}_INVALID`);
  }
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`MANUAL_REVIEW_${field}_INVALID`);
  }
  return normalized;
}

function isExactIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function parseEvidenceSelector(value: unknown): ManualEvidenceSelector {
  if (!isRecord(value)) throw new Error("MANUAL_REVIEW_EVIDENCE_INVALID");
  if (
    value.section === "HIGHLIGHT" &&
    Number.isInteger(value.index) &&
    Number(value.index) >= 0 &&
    Number(value.index) <= 100
  ) {
    return { section: "HIGHLIGHT", index: Number(value.index) };
  }
  if (value.section === "SUMMARY") {
    return {
      section: "SUMMARY",
      contains: requireText(value.contains, "EVIDENCE_CONTAINS", 160),
    };
  }
  throw new Error("MANUAL_REVIEW_EVIDENCE_INVALID");
}

export function parseManualOperationHonorReviewPlan(
  value: unknown,
): ManualOperationHonorReviewPlan {
  if (
    !isRecord(value) ||
    value.schemaVersion !== MANUAL_OPERATION_HONOR_REVIEW_VERSION ||
    !Array.isArray(value.reviewedSources) ||
    !Array.isArray(value.items)
  ) {
    throw new Error("MANUAL_REVIEW_SCHEMA_INVALID");
  }
  const reviewedSources = value.reviewedSources.map(
    (source): ManualOperationHonorReviewedSource => {
      if (
        !isRecord(source) ||
        (source.outcome !== "AWARDED" && source.outcome !== "NO_AWARD")
      ) {
        throw new Error("MANUAL_REVIEW_SOURCE_INVALID");
      }
      const contentHash = requireText(
        source.contentHash,
        "CONTENT_HASH",
        64,
      );
      if (!/^[a-f0-9]{64}$/u.test(contentHash)) {
        throw new Error("MANUAL_REVIEW_CONTENT_HASH_INVALID");
      }
      return {
        sourceKey: requireText(source.sourceKey, "SOURCE_KEY", 200),
        contentHash,
        outcome: source.outcome,
      };
    },
  );
  if (
    reviewedSources.length === 0 ||
    new Set(reviewedSources.map((source) => source.sourceKey)).size !==
      reviewedSources.length
  ) {
    throw new Error("MANUAL_REVIEW_SOURCE_DUPLICATE");
  }
  const items = value.items.map((item): ManualOperationHonorReviewItem => {
    if (!isRecord(item) || !CATEGORY_SET.has(item.category as OperationHonorCategory)) {
      throw new Error("MANUAL_REVIEW_ITEM_INVALID");
    }
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.map(parseEvidenceSelector)
      : [];
    if (evidence.length < 2 || evidence.length > 8) {
      throw new Error("MANUAL_REVIEW_EVIDENCE_INVALID");
    }
    return {
      sourceKey: requireText(item.sourceKey, "SOURCE_KEY", 200),
      codename: requireText(item.codename, "CODENAME", 200),
      category: item.category as OperationHonorCategory,
      title: requireText(item.title, "TITLE", 60),
      citation: requireText(item.citation, "CITATION", 240),
      evidence: evidence as ManualOperationHonorReviewItem["evidence"],
    };
  });
  const logicalKeys = items.map((item) => `${item.sourceKey}:${item.codename}`);
  if (new Set(logicalKeys).size !== logicalKeys.length) {
    throw new Error("MANUAL_REVIEW_ITEM_DUPLICATE");
  }
  const countBySource = new Map<string, number>();
  for (const item of items) {
    const count = (countBySource.get(item.sourceKey) ?? 0) + 1;
    if (count > 3) throw new Error("MANUAL_REVIEW_SOURCE_LIMIT_INVALID");
    countBySource.set(item.sourceKey, count);
  }
  const sourceByKey = new Map(
    reviewedSources.map((source) => [source.sourceKey, source]),
  );
  if (
    items.some(
      (item) => sourceByKey.get(item.sourceKey)?.outcome !== "AWARDED",
    ) ||
    reviewedSources.some(
      (source) =>
        (source.outcome === "AWARDED") !== countBySource.has(source.sourceKey),
    )
  ) {
    throw new Error("MANUAL_REVIEW_OUTCOME_MISMATCH");
  }
  return {
    schemaVersion: MANUAL_OPERATION_HONOR_REVIEW_VERSION,
    reviewedSources,
    items,
  };
}

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

/**
 * 인물 연결 보강으로 updatedAt/sourceHash가 바뀌어도, 사람이 검토한 실제
 * 서술·발생일·공개 source label이 달라지면 반드시 계획을 다시 만들게 한다.
 */
export function buildManualReviewContentHash(
  report: Pick<
    SessionReport,
    | "sessionId"
    | "sessionTitle"
    | "minRole"
    | "summary"
    | "highlights"
    | "createdAt"
  >,
): string {
  return createHash("sha256")
    .update(
      stableJson({
        sourceKey: report.sessionId.trim(),
        sourceLabel: report.sessionTitle.normalize("NFC").trim(),
        minRole: report.minRole ?? "U",
        occurredAt: report.createdAt.toISOString(),
        summary: sanitizeHonorAnalysisText(report.summary),
        highlights: report.highlights.map(sanitizeHonorAnalysisText),
      }),
    )
    .digest("hex");
}

function summarySentences(value: string): string[] {
  return value
    .split(/\n+/u)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/u))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 4 && sentence.length <= 500);
}

export function resolveManualEvidenceQuote(
  source: HonorAnalysisSource,
  selector: ManualEvidenceSelector,
): string {
  if (selector.section === "HIGHLIGHT") {
    const highlights = source.segments.filter(
      (segment) => segment.section === "HIGHLIGHT",
    );
    const selected = highlights[selector.index]?.text.trim();
    if (!selected || selected.length < 4 || selected.length > 500) {
      throw new Error("MANUAL_REVIEW_EVIDENCE_NOT_FOUND");
    }
    return selected;
  }
  const summary = source.segments.find(
    (segment) => segment.section === "SUMMARY",
  )?.text;
  if (!summary) throw new Error("MANUAL_REVIEW_EVIDENCE_NOT_FOUND");
  const matches = summarySentences(summary).filter((sentence) =>
    sentence.includes(selector.contains),
  );
  if (matches.length !== 1) {
    throw new Error("MANUAL_REVIEW_EVIDENCE_AMBIGUOUS");
  }
  return matches[0]!;
}

export function validateManualReviewItems(input: {
  source: HonorAnalysisSource;
  items: readonly ManualOperationHonorReviewItem[];
}) {
  const modelItems: HonorModelCandidate[] = input.items.map((item) => ({
    codename: item.codename,
    category: item.category,
    title: item.title,
    citation: item.citation,
    confidence: 1,
    evidenceQuotes: item.evidence.map((selector) =>
      resolveManualEvidenceQuote(input.source, selector),
    ),
  }));
  // MANUAL_REVIEW is intentionally distinct from dual-model analysis. Reuse
  // the exact candidate/evidence/public-prose gate without claiming model votes.
  const validated = validateOperationHonorResults({
    source: input.source,
    proposal: { items: modelItems },
    critique: { items: modelItems },
  });
  if (validated.length !== input.items.length) {
    throw new Error("MANUAL_REVIEW_ITEM_REJECTED");
  }
  return validated;
}

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    (quote === `"` || quote === `'`) &&
    trimmed.endsWith(quote) &&
    trimmed.length >= 2
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(path: string): void {
  let contents = "";
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    process.env[key] ??= normalizeEnvValue(trimmed.slice(separator + 1));
  }
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = args.filter((value) => value !== "--");
  let reviewPath: string | undefined;
  let outputPath: string | undefined;
  let plannedLinkagePath: string | undefined;
  let help = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (value === "--help" || value === "-h") help = true;
    else if (
      value === "--review" ||
      value === "--output" ||
      value === "--planned-linkage"
    ) {
      const next = values[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`${value} 뒤에 경로가 필요합니다.`);
      }
      if (value === "--review") reviewPath = resolve(next);
      else if (value === "--output") outputPath = resolve(next);
      else plannedLinkagePath = resolve(next);
      index += 1;
    } else {
      throw new Error(`알 수 없는 인자입니다: ${value}`);
    }
  }
  if (!help && !reviewPath) throw new Error("--review 경로가 필요합니다.");
  if (plannedLinkagePath && outputPath) {
    throw new Error("계획 linkage preflight에서는 manifest를 출력할 수 없습니다.");
  }
  return { reviewPath: reviewPath ?? "", outputPath, plannedLinkagePath, help };
}

function usage(): string {
  return [
    "사용법:",
    "  pnpm hall-of-fame:manual-review -- --review <path> [--output <path>]",
    "  pnpm hall-of-fame:manual-review -- --review <path> --planned-linkage <seed.json>",
    "",
    "기본 모드는 현재 DB를 읽어 hash-locked private manifest만 생성합니다.",
    "--planned-linkage는 아직 적용하지 않은 보고서 인물 연결을 겹쳐 보는 read-only preflight입니다.",
    "두 모드 모두 DB, 알림, 웹훅을 변경하지 않습니다.",
  ].join("\n");
}

function plannedLinkageBySource(value: unknown): Map<string, PlannedLinkage> {
  if (!Array.isArray(value)) throw new Error("PLANNED_LINKAGE_SCHEMA_INVALID");
  const result = new Map<string, PlannedLinkage>();
  for (const envelope of value) {
    if (!isRecord(envelope) || envelope.collection !== "session_reports") {
      throw new Error("PLANNED_LINKAGE_SCHEMA_INVALID");
    }
    const filter = isRecord(envelope.filter) ? envelope.filter : null;
    const update = isRecord(envelope.update) ? envelope.update : null;
    const addToSet = update && isRecord(update.$addToSet) ? update.$addToSet : null;
    const related =
      addToSet && isRecord(addToSet.relatedPersonnelCodenames)
        ? addToSet.relatedPersonnelCodenames
        : null;
    const each = related && Array.isArray(related.$each) ? related.$each : null;
    if (
      typeof filter?.sessionId !== "string" ||
      !isExactIsoDate(filter.updatedAt) ||
      !each ||
      each.some((codename) => typeof codename !== "string" || !codename.trim())
    ) {
      throw new Error("PLANNED_LINKAGE_SCHEMA_INVALID");
    }
    if (result.has(filter.sessionId)) {
      throw new Error("PLANNED_LINKAGE_SOURCE_DUPLICATE");
    }
    result.set(filter.sessionId, {
      codenames: each as string[],
      expectedUpdatedAt: filter.updatedAt,
    });
  }
  return result;
}

async function assertPlannedLinkageEvidence(
  linkage: ReadonlyMap<string, PlannedLinkage>,
): Promise<void> {
  const collection = await charactersCol();
  const reports = await sessionReportsCol();
  for (const [sessionId, planned] of linkage) {
    const persisted = await reports.findOne(
      { sessionId },
      { projection: { updatedAt: 1 } },
    );
    if (persisted?.updatedAt.toISOString() !== planned.expectedUpdatedAt) {
      throw new Error("PLANNED_LINKAGE_SOURCE_REVISION_MISMATCH");
    }
    const codenames = planned.codenames;
    const characters = await collection
      .find(
        { codename: { $in: codenames } },
        {
          projection: {
            codename: 1,
            type: 1,
            ownerId: 1,
            "lore.appearsInEvents": 1,
            "lore.sessionAppearances.sessionId": 1,
          },
        },
      )
      .toArray();
    for (const codename of codenames) {
      const matches = characters.filter(
        (character) => character.codename === codename,
      );
      const character = matches[0];
      const appearsInEvents = character?.lore?.appearsInEvents ?? [];
      const sessionAppearances = character?.lore?.sessionAppearances ?? [];
      if (
        matches.length !== 1 ||
        character?.type !== "AGENT" ||
        typeof character.ownerId !== "string" ||
        (!appearsInEvents.includes(sessionId) &&
          !sessionAppearances.some(
            (appearance) => appearance.sessionId === sessionId,
          ))
      ) {
        throw new Error("PLANNED_LINKAGE_DOSSIER_EVIDENCE_MISMATCH");
      }
    }
  }
}

function manifestOutputPath(generatedAt: Date, explicit?: string): string {
  if (explicit) return explicit;
  const slot = generatedAt.toISOString().replace(/[:.]/gu, "-");
  return resolve(tmpdir(), `stargate-hall-of-fame-manual-${slot}.json`);
}

async function createManualManifest(input: {
  plan: ManualOperationHonorReviewPlan;
  database: string;
  outputPath?: string;
  plannedLinkage?: Map<string, PlannedLinkage>;
}): Promise<{
  manifest: HallOfFameBackfillManifest;
  outputPath?: string;
  awardedRecords: number;
}> {
  const generatedAt = new Date();
  const reports = await (await sessionReportsCol())
    .find(sessionReportVisibilityFilter("U"))
    .sort({ sessionId: 1 })
    .toArray();
  const reportKeys = new Set(reports.map((report) => report.sessionId));
  const reviewedSourceKeys = input.plan.reviewedSources.map(
    (source) => source.sourceKey,
  );
  if (
    reports.length !== reviewedSourceKeys.length ||
    reports.some((report) => !reviewedSourceKeys.includes(report.sessionId)) ||
    reviewedSourceKeys.some((sourceKey) => !reportKeys.has(sourceKey))
  ) {
    throw new Error("MANUAL_REVIEW_COVERAGE_CHANGED");
  }
  const reviewedSourceByKey = new Map(
    input.plan.reviewedSources.map((source) => [source.sourceKey, source]),
  );
  const itemsBySource = new Map<string, ManualOperationHonorReviewItem[]>();
  for (const item of input.plan.items) {
    const items = itemsBySource.get(item.sourceKey) ?? [];
    items.push(item);
    itemsBySource.set(item.sourceKey, items);
  }

  const operations: HallOfFameOperationManifestEntry[] = [];
  const skipped: HallOfFameBackfillSkippedSource[] = [];
  let awardedRecords = 0;
  for (const persisted of reports) {
    const reviewedSource = reviewedSourceByKey.get(persisted.sessionId)!;
    if (
      buildManualReviewContentHash(persisted) !== reviewedSource.contentHash
    ) {
      throw new Error("MANUAL_REVIEW_CONTENT_CHANGED");
    }
    const additions =
      input.plannedLinkage?.get(persisted.sessionId)?.codenames ?? [];
    const report: SessionReport = additions.length > 0
      ? {
          ...persisted,
          relatedPersonnelCodenames: [
            ...new Set([
              ...(persisted.relatedPersonnelCodenames ?? []),
              ...additions,
            ]),
          ],
        }
      : persisted;
    const characters = await findHonorCandidateCharactersByCodenames(
      report.relatedPersonnelCodenames ?? [],
    );
    const source = reduceOperationHonorSource({ report, characters });
    const reviewItems = itemsBySource.get(report.sessionId) ?? [];
    if (!source) {
      if (reviewItems.length > 0) throw new Error("MANUAL_REVIEW_SOURCE_NOT_ANALYZABLE");
      skipped.push({
        domain: "OPERATION",
        sourceKey: report.sessionId,
        sourceRecordId: String(report._id ?? ""),
        sourceRevision: report.updatedAt.toISOString(),
        sourceFingerprint: buildSkippedOperationSourceFingerprint({
          report,
          characters,
        }),
        reason: characters.length === 0
          ? "NO_ELIGIBLE_AGENT"
          : "NO_ANALYZABLE_TEXT",
      });
      continue;
    }
    const honors = validateManualReviewItems({ source, items: reviewItems });
    const records = buildOperationHonorRecords({
      source,
      honors,
      analyzerRevision: HONOR_MANUAL_REVIEW_REVISION,
      issuedAt: generatedAt,
    });
    awardedRecords += records.length;
    operations.push({
      sourceKey: source.sourceKey,
      sourceRecordId: source.sourceRecordId,
      sourceRevision: report.updatedAt.toISOString(),
      sourceHash: source.sourceHash,
      records: records.map(serializeHonorRecord),
    });
  }
  const manifest = createHallOfFameBackfillManifest({
    analyzerRevision: HONOR_MANUAL_REVIEW_REVISION,
    generatedAt: generatedAt.toISOString(),
    database: input.database,
    novex: [],
    operations,
    skipped,
    issues: [],
  });
  if (input.plannedLinkage) return { manifest, awardedRecords };
  const outputPath = manifestOutputPath(generatedAt, input.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return { manifest, outputPath, awardedRecords };
}

export async function main(rawArgs = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(rawArgs);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  loadEnvFile(resolve(projectRoot, ".env.local"));
  loadEnvFile(resolve(projectRoot, ".env"));
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");
  const database =
    process.env.DB_NAME?.trim() ||
    process.env.MONGODB_DB_NAME?.trim() ||
    "stargate";
  if (
    process.env.DB_NAME?.trim() &&
    process.env.MONGODB_DB_NAME?.trim() &&
    process.env.DB_NAME.trim() !== process.env.MONGODB_DB_NAME.trim()
  ) {
    throw new Error("DB_NAME과 MONGODB_DB_NAME이 일치해야 합니다.");
  }
  const plan = parseManualOperationHonorReviewPlan(
    JSON.parse(await readFile(options.reviewPath, "utf8")),
  );
  const plannedLinkage = options.plannedLinkagePath
    ? plannedLinkageBySource(
        JSON.parse(await readFile(options.plannedLinkagePath, "utf8")),
      )
    : undefined;
  await connect({ uri, dbName: database, maxPoolSize: 3 });
  try {
    if (plannedLinkage) await assertPlannedLinkageEvidence(plannedLinkage);
    const result = await createManualManifest({
      plan,
      database,
      outputPath: options.outputPath,
      plannedLinkage,
    });
    console.log(
      JSON.stringify(
        {
          mode: plannedLinkage ? "planned-linkage-preflight" : "manifest",
          database,
          analyzerRevision: result.manifest.analyzerRevision,
          reportCoverage:
            result.manifest.operations.length + result.manifest.skipped.length,
          analyzedReports: result.manifest.operations.length,
          skippedReports: result.manifest.skipped.length,
          awardedRecords: result.awardedRecords,
          ...(result.outputPath
            ? {
                outputPath: result.outputPath,
                manifestHash: result.manifest.manifestHash,
              }
            : {}),
          databaseWrites: 0,
          notificationsCreated: 0,
          webhooksSent: 0,
        },
        null,
        2,
      ),
    );
    return 0;
  } finally {
    await close();
  }
}

const directEntry = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directEntry) {
  void main().catch((error: unknown) => {
    console.error(
      `[hall-of-fame-manual-review] ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    );
    process.exitCode = 1;
  });
}
