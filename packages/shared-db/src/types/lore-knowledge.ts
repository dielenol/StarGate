import type { ObjectId } from "mongodb";

import type { RoleLevel } from "./character.js";

/**
 * Existing domain collections remain the source of truth. These kinds only
 * identify records from those collections inside the auxiliary lore graph.
 */
export const LORE_ENTITY_KINDS = [
  "character",
  "faction",
  "institution",
  "wiki",
  "report",
  "session",
  "catalog",
  "lore",
  "place",
  "concept",
  "rule",
  "event",
  "organization",
  "stock",
] as const;

export type LoreEntityKind = (typeof LORE_ENTITY_KINDS)[number];
export type LoreEntityRef = `${LoreEntityKind}:${string}`;

export const LORE_RECORD_STATUSES = [
  "canon-from-source",
  "session-confirmed",
  "review-needed",
  "testimony",
  "discarded",
  "design-proposal",
  "balance-candidate",
  "corporation-candidate",
] as const;

export type LoreRecordStatus = (typeof LORE_RECORD_STATUSES)[number];

export const LORE_VISIBILITIES = [
  "public",
  "authenticated",
  "restricted",
  "gm-only",
] as const;

export type LoreVisibility = (typeof LORE_VISIBILITIES)[number];

export interface LoreAccess {
  visibility: LoreVisibility;
  /** Exact role allowlist for restricted records. GM always bypasses it. */
  allowedRoles?: RoleLevel[];
  /** Exact user-id allowlist for exceptional restricted records. */
  allowedUserIds?: string[];
}

export const LORE_SOURCE_KINDS = [
  "user-instruction",
  "database-record",
  "repository-document",
  "session-log",
  "containment-archive",
  "public-route",
  "legacy-import",
  "manual-entry",
  "generated-proposal",
] as const;

export type LoreSourceKind = (typeof LORE_SOURCE_KINDS)[number];

export const LORE_SOURCE_LOCATOR_KINDS = [
  "user-instruction",
  "database",
  "repository-path",
  "session",
  "route",
  "external",
] as const;

export type LoreSourceLocatorKind =
  (typeof LORE_SOURCE_LOCATOR_KINDS)[number];

export interface LoreSourceLocator {
  kind: LoreSourceLocatorKind;
  /** Private audit locator. Public consumers must never render this directly. */
  value: string;
  anchor?: string;
}

export interface LoreEvidenceRef {
  sourceId: string;
  locator?: string;
  /** Optional SHA-256 of the excerpt, not the raw copyrighted/private excerpt. */
  excerptHash?: string;
  note?: string;
}

export const LORE_LINEAGE_STATES = [
  "active",
  "superseded",
  "retconned",
] as const;

export type LoreLineageState = (typeof LORE_LINEAGE_STATES)[number];

export interface LoreLineage {
  state: LoreLineageState;
  /** Older record ids explicitly replaced by this record. */
  supersedesIds?: string[];
  /** Successor id when this record has been superseded. */
  supersededById?: string;
  retconReason?: string;
  retconnedAt?: Date;
}

export interface LoreSource {
  _id?: ObjectId;
  sourceId: string;
  kind: LoreSourceKind;
  title: string;
  locator: LoreSourceLocator;
  contentHash?: string;
  /** Legacy single-parent lineage. New multi-source projections use parentSourceIds. */
  parentSourceId?: string;
  /** Immutable upstream sources that jointly contributed to this source. */
  parentSourceIds?: string[];
  sessionId?: string;
  ingestionRunId?: string;
  access: LoreAccess;
  capturedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const LORE_ALIAS_TYPES = [
  "canonical-name",
  "codename",
  "nickname",
  "title",
  "translation",
  "speaker-handle",
  "legacy-id",
  "search-keyword",
] as const;

export type LoreAliasType = (typeof LORE_ALIAS_TYPES)[number];

export interface LoreAlias {
  _id?: ObjectId;
  aliasId: string;
  entityRef: LoreEntityRef;
  alias: string;
  normalizedAlias: string;
  aliasType: LoreAliasType;
  /** Canonical active-generation uniqueness key. */
  logicalKey: string;
  language?: string;
  status: LoreRecordStatus;
  confidence: number;
  evidence: LoreEvidenceRef[];
  lineage: LoreLineage;
  access: LoreAccess;
  validFrom?: Date;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoreEdge {
  _id?: ObjectId;
  edgeId: string;
  fromRef: LoreEntityRef;
  relation: string;
  toRef: LoreEntityRef;
  /** Canonical active-generation uniqueness key. */
  logicalKey: string;
  status: LoreRecordStatus;
  confidence: number;
  evidence: LoreEvidenceRef[];
  lineage: LoreLineage;
  access: LoreAccess;
  validFrom?: Date;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type LoreClaimValue =
  | string
  | number
  | boolean
  | null
  | LoreClaimValue[]
  | { [key: string]: LoreClaimValue };

export interface LoreClaim {
  _id?: ObjectId;
  claimId: string;
  subjectRef: LoreEntityRef;
  predicate: string;
  /** Canonical active-generation uniqueness key. */
  logicalKey: string;
  value: LoreClaimValue;
  status: LoreRecordStatus;
  confidence: number;
  evidence: LoreEvidenceRef[];
  lineage: LoreLineage;
  access: LoreAccess;
  validFrom?: Date;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoreSearchFacets {
  categories?: string[];
  tags?: string[];
  factionCodes?: string[];
  institutionCodes?: string[];
  sessionIds?: string[];
  itemCategories?: string[];
  sourceKinds?: LoreSourceKind[];
  statuses?: LoreRecordStatus[];
  custom?: Record<string, string[]>;
}

/** Denormalized search projection; never a second domain source of truth. */
export interface LoreSearchDocument {
  _id?: ObjectId;
  entityRef: LoreEntityRef;
  entityKind: LoreEntityKind;
  title: string;
  subtitle?: string;
  summary?: string;
  aliases: string[];
  searchText: string;
  facets: LoreSearchFacets;
  status: LoreRecordStatus;
  sourceIds: string[];
  access: LoreAccess;
  contentHash: string;
  projectionVersion: number;
  /** Producer that exclusively owns update/delete lifecycle for this row. */
  projectionOwner: string;
  sourceUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const LORE_INGESTION_MODES = [
  "session-ingestion",
  "worldbuilding-library",
  "search-rebuild",
  "reconciliation-audit",
] as const;

export type LoreIngestionMode = (typeof LORE_INGESTION_MODES)[number];

export const LORE_INGESTION_STATUSES = [
  "planned",
  "running",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
] as const;

/** Rebuildable domain search projection의 단일 writer identity. */
export const LORE_DOMAIN_SEARCH_PROJECTION_OWNER = "domain-ssot-v1";

export type LoreIngestionStatus =
  (typeof LORE_INGESTION_STATUSES)[number];

export interface LoreIngestionStats {
  discovered: number;
  processed: number;
  written: number;
  skipped: number;
  blocked: number;
  failed: number;
}

export interface LoreIngestionError {
  code: string;
  message: string;
  entityRef?: LoreEntityRef;
  sourceId?: string;
}

export interface LoreIngestionRun {
  _id?: ObjectId;
  runId: string;
  mode: LoreIngestionMode;
  status: LoreIngestionStatus;
  dryRun: boolean;
  sourceIds: string[];
  manifestHash?: string;
  parserVersion?: string;
  stats: LoreIngestionStats;
  errors: LoreIngestionError[];
  startedAt?: Date;
  heartbeatAt?: Date;
  leaseExpiresAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
