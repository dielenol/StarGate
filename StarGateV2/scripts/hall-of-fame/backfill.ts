/**
 * Hall of Fame 2.0 historical materialization tool.
 *
 * Default mode reads U operation reports, performs Cloud analysis, then writes
 * a private manifest only. NOVEX is a live all-time read model and is not
 * materialized into honor_records. Applying an operation manifest is a separate,
 * explicit operation and never creates notifications/webhooks.
 */

import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HONOR_ANALYZER_REVISION,
  buildOperationHonorRecords,
  reduceOperationHonorSource,
  validateOperationHonorResults,
} from "@stargate/core";
import {
  close,
  connect,
  findHonorCandidateCharactersByCodenames,
  getClient,
  honorAnalysisStatesCol,
  honorRecordsCol,
  isHallOfFameV2WritesEnabled,
  sessionReportVisibilityFilter,
  sessionReportsCol,
  upsertHonorRecord,
  withdrawHonorRecordsBySource,
  type HonorRecord,
  type SessionReport,
  type UpsertHonorRecordInput,
} from "@stargate/shared-db";
import type {
  ClientSession,
  IndexDescriptionInfo,
  ObjectId,
} from "mongodb";

import {
  buildHonorRecordMaterializationFingerprint,
  buildSkippedOperationSourceFingerprint,
  createHallOfFameBackfillManifest,
  deserializeManifestRecords,
  parseHallOfFameBackfillManifest,
  serializeHonorRecord,
  type HallOfFameBackfillIssue,
  type HallOfFameBackfillManifest,
  type HallOfFameBackfillSkippedSource,
  type HallOfFameOperationManifestEntry,
} from "./manifest.ts";
import {
  OllamaHonorAnalyzer,
} from "../../../stargate-worker/dist/honor-analysis/ollama.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");

interface CliOptions {
  execute: boolean;
  yes: boolean;
  manifestPath?: string;
  outputPath?: string;
  help: boolean;
}

interface ApplySummary {
  operationsApplied: number;
  operationsNoop: number;
  skippedApplied: number;
  skippedNoop: number;
}

interface BackfillOperationReportRef {
  _id: ObjectId;
  sessionId: string;
  updatedAt: Date;
}

async function loadBackfillOperationReportRevision(
  report: BackfillOperationReportRef,
): Promise<SessionReport | null> {
  return (await sessionReportsCol()).findOne({
    _id: report._id,
    sessionId: report.sessionId,
    updatedAt: report.updatedAt,
    ...sessionReportVisibilityFilter("U"),
  });
}

function usage(): string {
  return [
    "사용법:",
    "  pnpm hall-of-fame:backfill -- [--output <path>]",
    "  pnpm hall-of-fame:backfill -- --execute --manifest <path> --yes",
    "",
    "기본 모드는 DB를 읽고 Cloud 분석 manifest만 생성합니다.",
    "적용 모드는 ERP/worker 원본 쓰기를 중단한 maintenance 구간에서만 실행합니다.",
    "--yes는 해당 쓰기 중단과 별도 운영 승인을 확인했다는 의미입니다.",
    "manifest의 coverage와 모든 원본 hash는 원장 mutation 전에 transaction 안에서 재검증합니다.",
  ].join("\n");
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = args.filter((value) => value !== "--");
  const options: CliOptions = {
    execute: false,
    yes: false,
    help: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (value === "--execute") options.execute = true;
    else if (value === "--yes") options.yes = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--manifest" || value === "--output") {
      const next = values[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`${value} 뒤에 경로가 필요합니다.`);
      }
      if (value === "--manifest") options.manifestPath = resolve(next);
      else options.outputPath = resolve(next);
      index += 1;
    } else {
      throw new Error(`알 수 없는 인자입니다: ${value}`);
    }
  }
  if (options.execute) {
    if (!options.yes || !options.manifestPath || options.outputPath) {
      throw new Error(
        "적용에는 --execute --manifest <path> --yes만 함께 사용해야 합니다.",
      );
    }
  } else if (options.yes || options.manifestPath) {
    throw new Error("--manifest와 --yes는 --execute에서만 사용할 수 있습니다.");
  }
  return options;
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
    const value = normalizeEnvValue(trimmed.slice(separator + 1));
    process.env[key] ??= value;
  }
}

function resolveDatabaseName(execute: boolean): string {
  const web = process.env.DB_NAME?.trim();
  const worker = process.env.MONGODB_DB_NAME?.trim();
  if (web && worker && web !== worker) {
    throw new Error("DB_NAME과 MONGODB_DB_NAME이 일치해야 합니다.");
  }
  if (execute && !web && !worker) {
    throw new Error("적용 모드는 DB_NAME 또는 MONGODB_DB_NAME을 명시해야 합니다.");
  }
  return web || worker || "stargate";
}

function issueCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{2,119}$/u.test(message)
    ? message
    : "ANALYSIS_FAILED";
}

function ollamaTimeoutMs(): number | undefined {
  const raw = process.env.HALL_OF_FAME_OLLAMA_TIMEOUT_MS?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 5_000 || value > 180_000) {
    throw new Error("HALL_OF_FAME_OLLAMA_TIMEOUT_MS_INVALID");
  }
  return value;
}

function manifestOutputPath(generatedAt: Date, explicit?: string): string {
  if (explicit) return explicit;
  const slot = generatedAt.toISOString().replace(/[:.]/gu, "-");
  return resolve(
    tmpdir(),
    `stargate-hall-of-fame-backfill-${slot}.json`,
  );
}

async function createManifest(input: {
  database: string;
  outputPath?: string;
}): Promise<{ manifest: HallOfFameBackfillManifest; outputPath: string }> {
  const generatedAt = new Date();
  const analyzer = new OllamaHonorAnalyzer({
    apiKey: process.env.OLLAMA_API_KEY?.trim() ?? "",
    apiUrl: process.env.HALL_OF_FAME_OLLAMA_API_URL?.trim(),
    proposerModel: process.env.HALL_OF_FAME_PROPOSER_MODEL?.trim(),
    criticModel: process.env.HALL_OF_FAME_CRITIC_MODEL?.trim(),
    timeoutMs: ollamaTimeoutMs(),
  });
  const reportRefs = await (await sessionReportsCol())
    .find(sessionReportVisibilityFilter("U"))
    .project<BackfillOperationReportRef>({
      _id: 1,
      sessionId: 1,
      updatedAt: 1,
    })
    .sort({ createdAt: 1, sessionId: 1 })
    .toArray();

  const novex: [] = [];
  const operations: HallOfFameOperationManifestEntry[] = [];
  const skipped: HallOfFameBackfillSkippedSource[] = [];
  const issues: HallOfFameBackfillIssue[] = [];

  for (const reportRef of reportRefs) {
    try {
      const report = await loadBackfillOperationReportRevision(reportRef);
      if (!report) {
        throw new Error("SOURCE_CHANGED_BEFORE_CLOUD_ANALYSIS");
      }
      const characters = await findHonorCandidateCharactersByCodenames(
        report.relatedPersonnelCodenames ?? [],
      );
      if (characters.length === 0) {
        skipped.push({
          domain: "OPERATION",
          sourceKey: report.sessionId,
          sourceRecordId: String(report._id),
          sourceFingerprint: buildSkippedOperationSourceFingerprint({
            report,
            characters,
          }),
          reason: "NO_ELIGIBLE_AGENT",
        });
        continue;
      }
      const source = reduceOperationHonorSource({ report, characters });
      if (!source) {
        skipped.push({
          domain: "OPERATION",
          sourceKey: report.sessionId,
          sourceRecordId: String(report._id),
          sourceFingerprint: buildSkippedOperationSourceFingerprint({
            report,
            characters,
          }),
          reason: "NO_ANALYZABLE_TEXT",
        });
        continue;
      }
      const beforeEgress = async (): Promise<boolean> => {
        const currentReport = await loadBackfillOperationReportRevision(
          reportRef,
        );
        if (!currentReport) return false;
        const currentCharacters =
          await findHonorCandidateCharactersByCodenames(
            currentReport.relatedPersonnelCodenames ?? [],
          );
        const currentSource = reduceOperationHonorSource({
          report: currentReport,
          characters: currentCharacters,
        });
        return Boolean(
          currentSource &&
          currentSource.sourceRecordId === source.sourceRecordId &&
          currentSource.sourceHash === source.sourceHash,
        );
      };
      const result = await analyzer.analyze(
        source,
        new AbortController().signal,
        beforeEgress,
      );
      const honors = validateOperationHonorResults({
        source,
        proposal: result.proposal,
        critique: result.critique,
      });
      const records = buildOperationHonorRecords({
        source,
        honors,
        analyzerRevision: HONOR_ANALYZER_REVISION,
        issuedAt: generatedAt,
      });
      operations.push({
        sourceKey: source.sourceKey,
        sourceRecordId: source.sourceRecordId,
        sourceHash: source.sourceHash,
        records: records.map(serializeHonorRecord),
      });
    } catch (error) {
      issues.push({
        domain: "OPERATION",
        sourceKey: reportRef.sessionId,
        code: issueCode(error),
      });
    }
  }

  const manifest = createHallOfFameBackfillManifest({
    generatedAt: generatedAt.toISOString(),
    database: input.database,
    novex,
    operations,
    skipped,
    issues,
  });
  const outputPath = manifestOutputPath(generatedAt, input.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return { manifest, outputPath };
}

async function readManifest(path: string): Promise<HallOfFameBackfillManifest> {
  const raw = await readFile(path, "utf8");
  return parseHallOfFameBackfillManifest(JSON.parse(raw));
}

function hasRequiredUniqueIndex(
  indexes: readonly IndexDescriptionInfo[],
  name: string,
): boolean {
  return indexes.some((index) => index.name === name && index.unique === true);
}

async function assertHonorIndexesReady(): Promise<void> {
  let recordIndexes: IndexDescriptionInfo[];
  let analysisIndexes: IndexDescriptionInfo[];
  try {
    [recordIndexes, analysisIndexes] = await Promise.all([
      (await honorRecordsCol()).listIndexes().toArray(),
      (await honorAnalysisStatesCol()).listIndexes().toArray(),
    ]);
  } catch {
    throw new Error("HONOR_INDEXES_NOT_READY");
  }
  if (
    !hasRequiredUniqueIndex(
      recordIndexes,
      "honor_records_logicalKey_unique",
    ) ||
    !hasRequiredUniqueIndex(recordIndexes, "honor_records_publicKey_unique") ||
    !hasRequiredUniqueIndex(
      analysisIndexes,
      "honor_analysis_states_source_unique",
    )
  ) {
    throw new Error("HONOR_INDEXES_NOT_READY");
  }
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((value) => expected.has(value));
}

async function assertManifestCoverageCurrent(
  manifest: HallOfFameBackfillManifest,
  session: ClientSession,
): Promise<void> {
  const reports = await (await sessionReportsCol())
    .find(
      sessionReportVisibilityFilter("U"),
      { projection: { sessionId: 1 }, session },
    )
    .toArray();
  const manifestReportKeys = [
    ...manifest.operations.map((entry) => entry.sourceKey),
    ...manifest.skipped.map((entry) => entry.sourceKey),
  ];
  if (
    manifest.novex.length > 0 ||
    !sameStringSet(
      reports.map((report) => report.sessionId),
      manifestReportKeys,
    )
  ) {
    throw new Error("BACKFILL_MANIFEST_COVERAGE_CHANGED");
  }
}

export function sameLogicalSourceSet(
  existing: readonly HonorRecord[],
  desired: readonly UpsertHonorRecordInput[],
): boolean {
  if (existing.length !== desired.length) return false;
  const currentByLogicalKey = new Map(
    existing.map((record) => [record.logicalKey, record]),
  );
  return desired.every((record) => {
    const current = currentByLogicalKey.get(record.logicalKey);
    return (
      current !== undefined &&
      buildHonorRecordMaterializationFingerprint(current) ===
        buildHonorRecordMaterializationFingerprint(record)
    );
  });
}

async function activeSourceRecords(
  sourceType: "SESSION_REPORT",
  sourceKey: string,
  session: ClientSession,
): Promise<HonorRecord[]> {
  return (await honorRecordsCol())
    .find(
      {
        "source.type": sourceType,
        "source.key": sourceKey,
        status: "ACTIVE",
      },
      { session },
    )
    .toArray();
}

async function loadCurrentOperation(input: {
  entry: HallOfFameOperationManifestEntry;
  session: ClientSession;
}): Promise<void> {
  const report = await (await sessionReportsCol()).findOne(
    {
      sessionId: input.entry.sourceKey,
      ...sessionReportVisibilityFilter("U"),
    },
    { session: input.session },
  );
  if (!report || String(report._id) !== input.entry.sourceRecordId) {
    throw new Error("BACKFILL_OPERATION_SOURCE_CHANGED");
  }
  const characters = await findHonorCandidateCharactersByCodenames(
    report.relatedPersonnelCodenames ?? [],
    { session: input.session },
  );
  const source = reduceOperationHonorSource({ report, characters });
  if (
    !source ||
    source.sourceHash !== input.entry.sourceHash ||
    source.sourceRecordId !== input.entry.sourceRecordId
  ) {
    throw new Error("BACKFILL_OPERATION_SOURCE_CHANGED");
  }
  const candidates = new Map(
    source.candidates.map((candidate) => [
      candidate.characterId,
      candidate.codename,
    ]),
  );
  if (
    input.entry.records.some(
      (record) =>
        candidates.get(record.characterId) !== record.codenameSnapshot,
    )
  ) {
    throw new Error("BACKFILL_OPERATION_CANDIDATE_CHANGED");
  }
}

async function loadCurrentSkipped(input: {
  entry: HallOfFameBackfillSkippedSource;
  session: ClientSession;
}): Promise<void> {
  const report = await (await sessionReportsCol()).findOne(
    {
      sessionId: input.entry.sourceKey,
      ...sessionReportVisibilityFilter("U"),
    },
    { session: input.session },
  );
  if (!report || String(report._id) !== input.entry.sourceRecordId) {
    throw new Error("BACKFILL_SKIPPED_SOURCE_CHANGED");
  }
  const characters = await findHonorCandidateCharactersByCodenames(
    report.relatedPersonnelCodenames ?? [],
    { session: input.session },
  );
  if (
    buildSkippedOperationSourceFingerprint({ report, characters }) !==
      input.entry.sourceFingerprint ||
    reduceOperationHonorSource({ report, characters }) !== null
  ) {
    throw new Error("BACKFILL_SKIPPED_SOURCE_CHANGED");
  }
}

async function markBackfilledAnalysisSucceeded(input: {
  entry: HallOfFameOperationManifestEntry;
  now: Date;
  session: ClientSession;
}): Promise<boolean> {
  const collection = await honorAnalysisStatesCol();
  const id = `session-report:${input.entry.sourceKey}`;
  const current = await collection.findOne({ _id: id }, { session: input.session });
  if (
    current?.sourceRecordId === input.entry.sourceRecordId &&
    current.sourceHash === input.entry.sourceHash &&
    current.analyzerRevision === HONOR_ANALYZER_REVISION &&
    current.status === "SUCCEEDED" &&
    current.analyzedAt instanceof Date &&
    !current.lastError &&
    !current.nextAttemptAt &&
    !current.leaseToken &&
    !current.leaseUntil
  ) {
    return false;
  }
  await collection.updateOne(
    { _id: id },
    {
      $set: {
        sourceType: "SESSION_REPORT",
        sourceKey: input.entry.sourceKey,
        sourceRecordId: input.entry.sourceRecordId,
        sourceHash: input.entry.sourceHash,
        analyzerRevision: HONOR_ANALYZER_REVISION,
        status: "SUCCEEDED",
        analyzedAt: input.now,
        updatedAt: input.now,
      },
      $setOnInsert: { attempts: 0, createdAt: input.now },
      $unset: {
        leaseToken: "",
        leaseUntil: "",
        nextAttemptAt: "",
        lastError: "",
      },
    },
    { upsert: true, session: input.session },
  );
  return true;
}

async function markBackfilledAnalysisSkipped(input: {
  entry: HallOfFameBackfillSkippedSource;
  now: Date;
  session: ClientSession;
}): Promise<boolean> {
  const collection = await honorAnalysisStatesCol();
  const id = `session-report:${input.entry.sourceKey}`;
  const current = await collection.findOne({ _id: id }, { session: input.session });
  const reason = input.entry.reason === "NO_ELIGIBLE_AGENT"
    ? "SOURCE_NOT_ELIGIBLE"
    : "SOURCE_NOT_ANALYZABLE";
  if (
    current?.sourceRecordId === input.entry.sourceRecordId &&
    current.sourceHash === input.entry.sourceFingerprint &&
    current.analyzerRevision === HONOR_ANALYZER_REVISION &&
    current.status === "SKIPPED" &&
    current.lastError === reason &&
    !current.analyzedAt &&
    !current.nextAttemptAt &&
    !current.leaseToken &&
    !current.leaseUntil
  ) {
    return false;
  }
  await collection.updateOne(
    { _id: id },
    {
      $set: {
        sourceType: "SESSION_REPORT",
        sourceKey: input.entry.sourceKey,
        sourceRecordId: input.entry.sourceRecordId,
        sourceHash: input.entry.sourceFingerprint,
        analyzerRevision: HONOR_ANALYZER_REVISION,
        status: "SKIPPED",
        lastError: reason,
        updatedAt: input.now,
      },
      $setOnInsert: { attempts: 0, createdAt: input.now },
      $unset: {
        leaseToken: "",
        leaseUntil: "",
        nextAttemptAt: "",
        analyzedAt: "",
      },
    },
    { upsert: true, session: input.session },
  );
  return true;
}

async function applyManifest(
  manifest: HallOfFameBackfillManifest,
  database: string,
): Promise<ApplySummary> {
  if (manifest.database !== database) {
    throw new Error("BACKFILL_MANIFEST_DATABASE_MISMATCH");
  }
  if (manifest.issues.length > 0) {
    throw new Error("BACKFILL_MANIFEST_HAS_ISSUES");
  }
  if (manifest.novex.length > 0) {
    throw new Error("BACKFILL_NOVEX_SEASON_HONORS_UNSUPPORTED");
  }
  if (isHallOfFameV2WritesEnabled()) {
    throw new Error(
      "BACKFILL_REQUIRES_HALL_OF_FAME_V2_WRITES_ENABLED_FALSE",
    );
  }
  await assertHonorIndexesReady();
  const generatedAt = new Date(manifest.generatedAt);
  const client = await getClient();
  const session = client.startSession();
  const summary: ApplySummary = {
    operationsApplied: 0,
    operationsNoop: 0,
    skippedApplied: 0,
    skippedNoop: 0,
  };
  try {
    await session.withTransaction(async () => {
      await assertManifestCoverageCurrent(manifest, session);
      for (const entry of manifest.operations) {
        await loadCurrentOperation({ entry, session });
      }
      for (const entry of manifest.skipped) {
        await loadCurrentSkipped({ entry, session });
      }

      for (const entry of manifest.operations) {
        const desired = deserializeManifestRecords(entry.records);
        const existing = await activeSourceRecords(
          "SESSION_REPORT",
          entry.sourceKey,
          session,
        );
        const recordsNoop = sameLogicalSourceSet(existing, desired);
        if (!recordsNoop) {
          await withdrawHonorRecordsBySource({
            sourceType: "SESSION_REPORT",
            sourceKey: entry.sourceKey,
            status: "SUPERSEDED",
            now: generatedAt,
            session,
          });
          for (const record of desired) {
            await upsertHonorRecord(record, { session });
          }
        }
        const stateChanged = await markBackfilledAnalysisSucceeded({
          entry,
          now: generatedAt,
          session,
        });
        if (recordsNoop && !stateChanged) summary.operationsNoop += 1;
        else summary.operationsApplied += 1;
      }

      for (const entry of manifest.skipped) {
        const existing = await activeSourceRecords(
          "SESSION_REPORT",
          entry.sourceKey,
          session,
        );
        if (existing.length > 0) {
          await withdrawHonorRecordsBySource({
            sourceType: "SESSION_REPORT",
            sourceKey: entry.sourceKey,
            status: "WITHDRAWN",
            now: generatedAt,
            session,
          });
        }
        const stateChanged = await markBackfilledAnalysisSkipped({
          entry,
          now: generatedAt,
          session,
        });
        if (existing.length === 0 && !stateChanged) summary.skippedNoop += 1;
        else summary.skippedApplied += 1;
      }
    });
    return summary;
  } finally {
    await session.endSession();
  }
}

export async function main(
  rawArgs = process.argv.slice(2),
): Promise<number> {
  const options = parseArgs(rawArgs);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  loadEnvFile(resolve(projectRoot, ".env.local"));
  loadEnvFile(resolve(projectRoot, ".env"));
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");
  const database = resolveDatabaseName(options.execute);
  await connect({ uri, dbName: database, maxPoolSize: 3 });
  try {
    if (options.execute) {
      const manifest = await readManifest(options.manifestPath!);
      const summary = await applyManifest(manifest, database);
      console.log(
        JSON.stringify(
          {
            mode: "execute",
            database,
            manifestHash: manifest.manifestHash,
            ...summary,
            notificationsCreated: 0,
            webhooksSent: 0,
          },
          null,
          2,
        ),
      );
      return 0;
    }
    const { manifest, outputPath } = await createManifest({
      database,
      outputPath: options.outputPath,
    });
    console.log(
      JSON.stringify(
        {
          mode: "dry-run-cloud-analysis",
          database,
          outputPath,
          manifestHash: manifest.manifestHash,
          novexSeasonHonors: 0,
          analyzedReports: manifest.operations.length,
          skippedReports: manifest.skipped.length,
          issues: manifest.issues.length,
          databaseWrites: 0,
          notificationsCreated: 0,
          webhooksSent: 0,
        },
        null,
        2,
      ),
    );
    return manifest.issues.length === 0 ? 0 : 2;
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
      `[hall-of-fame-backfill] ${
        error instanceof Error ? error.message : "알 수 없는 오류"
      }`,
    );
    process.exitCode = 1;
  });
}
