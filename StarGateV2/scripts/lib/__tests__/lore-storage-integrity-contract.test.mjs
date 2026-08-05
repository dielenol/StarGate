import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STORAGE_SCRIPT = new URL("../../migrate-lore-storage.ts", import.meta.url);
const SEED_SCRIPT = new URL("../../upsert-seed-payload.ts", import.meta.url);
const PROVENANCE_SCRIPT = new URL("../../backfill-report-provenance.ts", import.meta.url);

test("lore storage preflight는 sparse와 internal lock metadata를 진단한다", async () => {
  const source = await readFile(STORAGE_SCRIPT, "utf8");

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
