import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STORAGE_SCRIPT = new URL("../../migrate-lore-storage.ts", import.meta.url);
const COMPATIBILITY_SCRIPT = new URL("../lore-seed-compatibility.ts", import.meta.url);
const EXECUTION_SCRIPT = new URL("../lore-storage-execution.ts", import.meta.url);
const SEED_SCRIPT = new URL("../../upsert-seed-payload.ts", import.meta.url);
const PROVENANCE_SCRIPT = new URL("../../backfill-report-provenance.ts", import.meta.url);

test("lore storage preflight는 sparse와 internal lock metadata를 진단한다", async () => {
  const [source, compatibilitySource, executionSource] = await Promise.all([
    readFile(STORAGE_SCRIPT, "utf8"),
    readFile(COMPATIBILITY_SCRIPT, "utf8"),
    readFile(EXECUTION_SCRIPT, "utf8"),
  ]);

  assert.match(
    source,
    /\(expected\.sparse === true\) !== \(actual\.sparse === true\)/u,
  );
  assert.match(source, /uniqueIndex\.sparse === true \? \["sparse"\]/u);
  assert.match(source, /invalid_report_reference_lock_timestamp/u);
  assert.match(source, /legacy_report_reference_version/u);
  assert.match(source, /missing_historical_report_provenance/u);
  assert.match(source, /characterNestedDateRows/u);
  assert.match(source, /characterRequiredFieldRows/u);
  assert.match(source, /masterItemNullableManagedRows/u);
  assert.match(source, /wikiMissingAuthorRows/u);
  assert.match(source, /applySeedCompatibilityRepairs/u);
  assert.match(source, /seedCompatibilityAutomaticRepairs/u);
  assert.match(source, /seedCompatibilityAppliedRepairs/u);
  assert.match(source, /seedCompatibilityRemainingRepairs/u);
  assert.match(source, /--expected-plan-digest/u);
  assert.match(source, /executionPlanDigest/u);
  assert.match(source, /\{ dbName, host: targetHost \}/u);
  assert.match(source, /seedCompatibilityPlanDigest/u);
  assert.match(source, /모든 data plan을 첫 mutation 전에 같은 transaction snapshot/u);
  assert.match(source, /storageIndexPlanDigest\(beforeDdl\) !== indexPlanDigest/u);
  assert.match(source, /runLoreStorageExecutionPhases/u);
  assert.match(executionSource, /status: "partial-apply"/u);
  assert.match(executionSource, /UnknownTransactionCommitResult/u);
  assert.match(executionSource, /status: commitUnknown \? "commit-unknown"/u);
  assert.match(executionSource, /reconcileDataTransactionCommit/u);
  assert.match(executionSource, /appliedDataPlan/u);
  assert.match(source, /onEnsured: recordEnsuredIndex/u);
  assert.match(source, /postflightInspectionError/u);
  assert.match(source, /state-consistent-with-commit/u);
  assert.match(source, /verifyStorageDataPlanPostconditions/u);
  assert.match(source, /seedCompatibilityRepairPostconditionIssues/u);
  assert.match(source, /observeCommitUnknownDataState/u);
  assert.match(executionSource, /readConcern: \{ level: "snapshot" \}/u);
  assert.match(source, /BSON Date -> ISO-8601 string/u);
  assert.match(source, /null -> absent/u);
  assert.match(compatibilitySource, /seed compatibility inspection\/CAS snapshot/u);
  assert.match(compatibilitySource, /seedCompatibilityRepairDigest\(currentRepairs\)/u);
  assert.match(compatibilitySource, /\$currentDate: \{ updatedAt: true \}/u);
  assert.match(source, /if \(!session\) return Promise\.all/u);
  assert.match(source, /for \(const operation of operations\) results\.push\(await operation\(\)\)/u);
});

test("historical report provenance는 domain/economy 재실행 없는 전용 멱등 backfill을 쓴다", async () => {
  const source = await readFile(PROVENANCE_SCRIPT, "utf8");
  assert.match(source, /EXECUTE = process\.argv\.includes\("--execute"\)/u);
  assert.match(source, /--execute에는 --yes/u);
  assert.match(source, /session\.withTransaction/u);
  assert.match(source, /provenanceSourceIds/u);
  assert.match(source, /buildReportProvenanceUpdate/u);
  assert.match(source, /immutable source collision/u);
  assert.match(source, /inspectCommittedRepositorySource/u);
  assert.match(source, /assertSourcePlansStillCommitted/u);
  assert.match(source, /indexContractIssues/u);
  assert.match(source, /duplicate_unique_key/u);
  assert.match(source, /postflight blocker/u);
  assert.match(source, /validateSeedStoredDocument\("session_reports", saved\)/u);
  assert.doesNotMatch(source, /master_items|credit_transactions|character_inventory/u);
});

test("generic seed runner도 shared report/target integrity gate와 provenance를 사용한다", async () => {
  const source = await readFile(SEED_SCRIPT, "utf8");

  assert.match(source, /validateAndLockSessionReportWrite\(/u);
  assert.match(source, /validateAndLockSessionReportReferences\(/u);
  assert.match(source, /lockAndAssertNoSessionReportInboundReference\(/u);
  assert.match(source, /findSessionReportReferenceTargetIssues\(/u);
  assert.match(source, /hasSessionReportInboundReference\(/u);
  assert.match(source, /provenanceSourceIds/u);
  assert.match(source, /\$addToSet: \{ provenanceSourceIds:/u);
  assert.match(source, /assertSingleFileExecutionScope\(files, EXECUTE\)/u);
  assert.match(source, /assertCommittedRepositorySource/u);
  assert.match(source, /withSeedRunnerInsertUpdatedAt/u);
  assert.match(source, /findSeedAuditIndexIssues\(db\)/u);
  assert.match(source, /report provenance source를 찾을 수 없습니다/u);
  const dryRunGate = source.slice(
    source.indexOf("async function auditSeedReferenceIntegrity("),
    source.indexOf("async function dryRunWithDb("),
  );
  const writeGate = source.slice(
    source.indexOf("async function enforceSessionReportReferenceIntegrity("),
    source.indexOf("function verifyEvaluatedPipeline("),
  );
  for (const gate of [dryRunGate, writeGate]) {
    assert.match(gate, /if \(ObjectId\.isValid\(sessionId\)\)/u);
    assert.doesNotMatch(gate, /!before && ObjectId\.isValid/u);
  }
});
