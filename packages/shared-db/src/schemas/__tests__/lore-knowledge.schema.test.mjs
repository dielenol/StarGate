import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildLoreEntityRef,
  loreAccessSchema,
  loreAliasSchema,
  loreClaimSchema,
  loreEdgeSchema,
  loreEntityRefSchema,
  loreIngestionRunSchema,
  loreSearchDocumentSchema,
  loreSearchQuerySchema,
  loreSourceDocumentSchema,
  normalizeLoreAlias,
  parseLoreEntityRef,
} from "../../../dist/schemas/lore-knowledge.schema.js";
import {
  buildLoreIngestionTransitionCandidate,
  buildLoreAccessFilter,
  isLoreAliasSuccessor,
  isLoreClaimSuccessor,
  isLoreEdgeSuccessor,
  isLoreIngestionTransitionAllowed,
} from "../../../dist/crud/lore-knowledge.js";

const NOW = new Date("2026-08-05T00:00:00.000Z");
const LATER = new Date("2026-08-05T01:00:00.000Z");
const HASH = "a".repeat(64);
const PUBLIC_ACCESS = { visibility: "public" };
const EVIDENCE = [{ sourceId: "source:session:nosb-s1e1", excerptHash: HASH }];
const ACTIVE_LINEAGE = { state: "active" };

test("ingestion transition은 running lease를 만들고 terminal에서 제거한다", () => {
  const planned = loreIngestionRunSchema.parse({
    runId: "search-rebuild:transition-test",
    mode: "search-rebuild",
    status: "planned",
    dryRun: false,
    sourceIds: [],
    stats: {
      discovered: 1,
      processed: 0,
      written: 0,
      skipped: 0,
      blocked: 0,
      failed: 0,
    },
    errors: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
  const running = buildLoreIngestionTransitionCandidate(
    planned,
    "running",
    {},
    LATER,
  );
  assert.equal(running.heartbeatAt?.getTime(), LATER.getTime());
  assert.ok(running.leaseExpiresAt > running.heartbeatAt);

  const completed = buildLoreIngestionTransitionCandidate(
    running,
    "succeeded",
    {
      stats: {
        discovered: 1,
        processed: 1,
        written: 1,
        skipped: 0,
        blocked: 0,
        failed: 0,
      },
    },
    new Date("2026-08-05T02:00:00.000Z"),
  );
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.leaseExpiresAt, undefined);
  assert.ok(completed.completedAt);
});

test("canonical entity ref는 알려진 kind와 안정 key만 허용한다", () => {
  const ref = buildLoreEntityRef("report", "NOSB-S1E1-MINI");
  assert.equal(ref, "report:NOSB-S1E1-MINI");
  assert.deepEqual(parseLoreEntityRef(ref), {
    kind: "report",
    key: "NOSB-S1E1-MINI",
  });
  assert.throws(() => loreEntityRefSchema.parse("unknown:foo"));
  assert.throws(() => loreEntityRefSchema.parse("wiki:has whitespace"));
  assert.throws(() => loreEntityRefSchema.parse("wiki:contains:colon"));
});

test("restricted access는 role/user allowlist를 요구하고 다른 visibility는 allowlist를 거부한다", () => {
  assert.deepEqual(loreAccessSchema.parse(PUBLIC_ACCESS), PUBLIC_ACCESS);
  assert.throws(() =>
    loreAccessSchema.parse({ visibility: "restricted" }),
  );
  assert.throws(() =>
    loreAccessSchema.parse({ visibility: "public", allowedRoles: ["GM"] }),
  );
  assert.deepEqual(
    loreAccessSchema.parse({
      visibility: "restricted",
      allowedRoles: ["V"],
      allowedUserIds: ["user-1"],
    }),
    {
      visibility: "restricted",
      allowedRoles: ["V"],
      allowedUserIds: ["user-1"],
    },
  );
});

test("source 문서는 private locator, checksum, ingestion provenance를 검증한다", () => {
  const source = loreSourceDocumentSchema.parse({
    sourceId: "source:repo:wiki-combat",
    kind: "repository-document",
    title: "전투 근간 규칙",
    locator: {
      kind: "repository-path",
      value: "StarGateV2/scripts/seed-payloads/wiki-combat-foundations.json",
      anchor: "wiki_pages:combat-foundations",
    },
    contentHash: HASH,
    ingestionRunId: "run:2026-08-05:lore-audit",
    access: { visibility: "gm-only" },
    capturedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(source.kind, "repository-document");
  assert.throws(() =>
    loreSourceDocumentSchema.parse({
      ...source,
      parentSourceId: source.sourceId,
    }),
  );
  assert.deepEqual(
    loreSourceDocumentSchema.parse({
      ...source,
      parentSourceIds: ["source:seed:a", "source:seed:b"],
    }).parentSourceIds,
    ["source:seed:a", "source:seed:b"],
  );
  assert.throws(() =>
    loreSourceDocumentSchema.parse({
      ...source,
      parentSourceIds: [source.sourceId],
    }),
  );
  assert.throws(() =>
    loreSourceDocumentSchema.parse({
      ...source,
      parentSourceId: "source:seed:a",
      parentSourceIds: ["source:seed:b"],
    }),
  );
  assert.throws(() =>
    loreSourceDocumentSchema.parse({ ...source, contentHash: undefined }),
  );
  assert.throws(() =>
    loreSourceDocumentSchema.parse({
      ...source,
      access: { visibility: "public" },
    }),
  );
});

test("alias는 결정적 normalization과 evidence를 요구한다", () => {
  const alias = "  Agent   Order  ";
  const parsed = loreAliasSchema.parse({
    aliasId: "alias:character:order:agent-order",
    entityRef: "character:ORDER",
    alias,
    normalizedAlias: normalizeLoreAlias(alias),
    aliasType: "speaker-handle",
    logicalKey: "character:ORDER|speaker-handle|agent order",
    language: "en",
    status: "session-confirmed",
    confidence: 0.95,
    evidence: EVIDENCE,
    lineage: ACTIVE_LINEAGE,
    access: PUBLIC_ACCESS,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(parsed.normalizedAlias, "agent order");
  assert.throws(() => loreAliasSchema.parse({ ...parsed, evidence: [] }));
  assert.throws(() =>
    loreAliasSchema.parse({ ...parsed, normalizedAlias: "AGENT ORDER" }),
  );
});

test("edge는 canonical refs, relation, evidence와 lineage를 함께 검증한다", () => {
  const edge = loreEdgeSchema.parse({
    edgeId: "edge:order:appears-in:nosb-s1e1",
    fromRef: "character:ORDER",
    relation: "appears-in",
    toRef: "report:NOSB-S1E1-MINI",
    logicalKey: "character:ORDER|appears-in|report:NOSB-S1E1-MINI",
    status: "session-confirmed",
    confidence: 1,
    evidence: EVIDENCE,
    lineage: ACTIVE_LINEAGE,
    access: PUBLIC_ACCESS,
    validFrom: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(edge.relation, "appears-in");
  assert.throws(() => loreEdgeSchema.parse({ ...edge, relation: "Appears In" }));
  assert.throws(() =>
    loreEdgeSchema.parse({
      ...edge,
      lineage: { state: "superseded" },
    }),
  );
});

test("claim은 JSON value와 supersedes/retcon 불변식을 검증한다", () => {
  const claim = loreClaimSchema.parse({
    claimId: "claim:order:affiliation:1",
    subjectRef: "character:ORDER",
    predicate: "affiliation.primary",
    logicalKey: "character:ORDER|affiliation.primary",
    value: { factionCode: "COUNCIL", active: true },
    status: "canon-from-source",
    confidence: 1,
    evidence: EVIDENCE,
    lineage: ACTIVE_LINEAGE,
    access: { visibility: "authenticated" },
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.deepEqual(claim.value, { factionCode: "COUNCIL", active: true });
  assert.throws(() =>
    loreClaimSchema.parse({
      ...claim,
      lineage: {
        state: "retconned",
        retconReason: "정정됨",
      },
    }),
  );
  assert.throws(() =>
    loreClaimSchema.parse({
      ...claim,
      lineage: {
        state: "retconned",
        retconReason: "정정됨",
        retconnedAt: NOW,
        supersededById: "claim:order:successor",
      },
    }),
  );
  assert.throws(() =>
    loreClaimSchema.parse({
      ...claim,
      lineage: { state: "active", supersedesIds: [claim.claimId] },
    }),
  );
});

test("successor는 같은 logical identity와 reciprocal lineage만 허용한다", () => {
  const alias = loreAliasSchema.parse({
    aliasId: "alias:order:old",
    entityRef: "character:ORDER",
    alias: "오더",
    normalizedAlias: "오더",
    aliasType: "canonical-name",
    logicalKey: "character:ORDER|canonical-name|오더",
    status: "canon-from-source",
    confidence: 1,
    evidence: EVIDENCE,
    lineage: ACTIVE_LINEAGE,
    access: PUBLIC_ACCESS,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const aliasSuccessor = loreAliasSchema.parse({
    ...alias,
    aliasId: "alias:order:new",
    lineage: { state: "active", supersedesIds: [alias.aliasId] },
  });
  assert.equal(isLoreAliasSuccessor(alias, aliasSuccessor), true);
  assert.equal(
    isLoreAliasSuccessor(alias, {
      ...aliasSuccessor,
      entityRef: "character:OTHER",
    }),
    false,
  );

  const edge = loreEdgeSchema.parse({
    edgeId: "edge:order:old",
    fromRef: "character:ORDER",
    relation: "member-of",
    toRef: "faction:COUNCIL",
    logicalKey: "character:ORDER|member-of|faction:COUNCIL",
    status: "canon-from-source",
    confidence: 1,
    evidence: EVIDENCE,
    lineage: ACTIVE_LINEAGE,
    access: PUBLIC_ACCESS,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const edgeSuccessor = loreEdgeSchema.parse({
    ...edge,
    edgeId: "edge:order:new",
    lineage: { state: "active", supersedesIds: [edge.edgeId] },
  });
  assert.equal(isLoreEdgeSuccessor(edge, edgeSuccessor), true);
  assert.equal(
    isLoreEdgeSuccessor(edge, {
      ...edgeSuccessor,
      toRef: "faction:MILITARY",
    }),
    false,
  );

  const claim = loreClaimSchema.parse({
    claimId: "claim:order:old",
    subjectRef: "character:ORDER",
    predicate: "identity.role",
    logicalKey: "character:ORDER|identity.role",
    value: "요원",
    status: "canon-from-source",
    confidence: 1,
    evidence: EVIDENCE,
    lineage: ACTIVE_LINEAGE,
    access: PUBLIC_ACCESS,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const claimSuccessor = loreClaimSchema.parse({
    ...claim,
    claimId: "claim:order:new",
    value: "감독관",
    lineage: { state: "active", supersedesIds: [claim.claimId] },
  });
  assert.equal(isLoreClaimSuccessor(claim, claimSuccessor), true);
  assert.equal(
    isLoreClaimSuccessor(claim, {
      ...claimSuccessor,
      predicate: "identity.type",
    }),
    false,
  );
});

test("search projection은 source entity를 대체하지 않고 hash/version/facet을 요구한다", () => {
  const document = loreSearchDocumentSchema.parse({
    entityRef: "wiki:combat-foundations",
    entityKind: "wiki",
    title: "전투 근간 규칙",
    summary: "전투 체계의 백과사전 검색 요약",
    aliases: ["전투 규칙"],
    searchText: "전투 근간 규칙 행동 판정",
    facets: {
      categories: ["개념"],
      tags: ["전투"],
      sourceKinds: ["repository-document"],
      statuses: ["canon-from-source"],
      custom: { season: ["S1"] },
    },
    status: "canon-from-source",
    sourceIds: ["source:repo:wiki-combat"],
    access: PUBLIC_ACCESS,
    contentHash: HASH,
    projectionVersion: 1,
    projectionOwner: "test-suite",
    sourceUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(document.entityRef, "wiki:combat-foundations");
  assert.throws(() =>
    loreSearchDocumentSchema.parse({ ...document, entityKind: "report" }),
  );
  assert.throws(() =>
    loreSearchDocumentSchema.parse({
      ...document,
      facets: { tags: ["전투", "전투"] },
    }),
  );
});

test("ingestion run은 카운트와 terminal 상태를 일관되게 검증한다", () => {
  const run = loreIngestionRunSchema.parse({
    runId: "run:2026-08-05:lore-audit",
    mode: "reconciliation-audit",
    status: "succeeded",
    dryRun: true,
    sourceIds: ["source:repo:wiki-combat"],
    manifestHash: HASH,
    stats: {
      discovered: 1,
      processed: 1,
      written: 0,
      skipped: 1,
      blocked: 0,
      failed: 0,
    },
    errors: [],
    startedAt: NOW,
    completedAt: LATER,
    createdAt: NOW,
    updatedAt: LATER,
  });
  assert.equal(run.status, "succeeded");
  assert.throws(() =>
    loreIngestionRunSchema.parse({
      ...run,
      stats: { ...run.stats, blocked: 1 },
    }),
  );
  assert.throws(() =>
    loreIngestionRunSchema.parse({
      ...run,
      status: "failed",
      errors: [],
    }),
  );
  assert.throws(() =>
    loreIngestionRunSchema.parse({
      ...run,
      stats: { ...run.stats, processed: 0, skipped: 0 },
    }),
  );
});

test("공통 access filter는 public/auth/restricted/GM 경계를 보존한다", () => {
  assert.deepEqual(buildLoreAccessFilter({ isAuthenticated: false }), {
    $or: [{ "access.visibility": "public" }],
  });
  const authenticated = buildLoreAccessFilter({
    isAuthenticated: true,
    role: "U",
    userId: "user-1",
  });
  assert.equal(authenticated.$or.length, 3);
  assert.deepEqual(
    buildLoreAccessFilter({ isAuthenticated: true, role: "GM" }),
    {},
  );
  assert.deepEqual(
    buildLoreAccessFilter({ isAuthenticated: false, role: "GM" }),
    { $or: [{ "access.visibility": "public" }] },
  );
  assert.deepEqual(
    buildLoreAccessFilter({ isAuthenticated: "false", role: "GM" }),
    { $or: [{ "access.visibility": "public" }] },
  );
});

test("search query는 외부 필터와 limit을 런타임에서 제한한다", () => {
  assert.deepEqual(
    loreSearchQuerySchema.parse({
      query: "  노부스 오르도  ",
      entityKinds: ["wiki", "report"],
      statuses: ["canon-from-source"],
      tags: ["전투"],
      limit: 25,
    }),
    {
      query: "노부스 오르도",
      entityKinds: ["wiki", "report"],
      statuses: ["canon-from-source"],
      tags: ["전투"],
      limit: 25,
    },
  );
  assert.throws(() => loreSearchQuerySchema.parse({ limit: 101 }));
  assert.throws(() =>
    loreSearchQuerySchema.parse({ entityKinds: ["wiki", "unknown"] }),
  );
  assert.throws(() => loreSearchQuerySchema.parse({ tags: ["전투", "전투"] }));
});

test("ingestion lifecycle은 terminal 재개를 금지한다", () => {
  assert.equal(isLoreIngestionTransitionAllowed("planned", "running"), true);
  assert.equal(isLoreIngestionTransitionAllowed("running", "partial"), true);
  assert.equal(isLoreIngestionTransitionAllowed("running", "running"), true);
  assert.equal(isLoreIngestionTransitionAllowed("planned", "succeeded"), false);
  assert.equal(isLoreIngestionTransitionAllowed("succeeded", "running"), false);
  assert.equal(isLoreIngestionTransitionAllowed("failed", "failed"), false);
  assert.equal(isLoreIngestionTransitionAllowed("unknown", "failed"), false);
});
