import type { ObjectId } from "mongodb";

import type { RoleLevel } from "./character.js";

export const HONOR_ANALYZER_REVISION = "operation-honor-v1";
/**
 * 근거 검증을 마친 과거 보고서의 수동 이관 revision.
 * 같은 sourceHash에서는 worker가 자동 분석으로 덮어쓰지 않는다.
 */
export const HONOR_MANUAL_REVIEW_REVISION = "operation-honor-manual-v1";
export const HONOR_ANALYSIS_SOURCE_MAX_CHARS = 32_000;

export const HONOR_DOMAINS = ["NOVEX", "OPERATION"] as const;
export type HonorDomain = (typeof HONOR_DOMAINS)[number];

export const OPERATION_HONOR_CATEGORIES = [
  "COMBAT",
  "COMMAND",
  "RESCUE_PROTECTION",
  "RESEARCH_TECH",
  "SUPPORT_TEAMWORK",
  "INTELLIGENCE_JUDGMENT",
] as const;
export type OperationHonorCategory =
  (typeof OPERATION_HONOR_CATEGORIES)[number];

export type HonorCategory = OperationHonorCategory | "NOVEX_PODIUM";
export type HonorRecordStatus = "ACTIVE" | "SUPERSEDED" | "WITHDRAWN";
export type HonorSourceType = "STOCK_SEASON" | "SESSION_REPORT";

export interface HonorRecordSource {
  type: HonorSourceType;
  /** stock season id 또는 session_reports.sessionId. */
  key: string;
  /** 서버 내부 원본 조회용 식별자. 공개 응답에는 포함하지 않는다. */
  recordId?: string;
  label: string;
  href?: string;
}

export interface HonorEvidenceAudit {
  /** 원문을 중복 저장하지 않는 SHA-256 근거 해시. */
  hash: string;
  section: "SUMMARY" | "HIGHLIGHT";
}

export interface HonorCharacterIdentity {
  _id?: ObjectId;
  type: "AGENT" | "NPC";
  ownerId: string | null;
  codename: string;
}

export interface OperationHonorSourceCandidate {
  characterId: string;
  codename: string;
}

export interface OperationHonorSourceSegment {
  section: "SUMMARY" | "HIGHLIGHT";
  text: string;
}

export interface OperationHonorSourceMaterial {
  sourceKey: string;
  sourceHash: string;
  candidates: OperationHonorSourceCandidate[];
  segments: OperationHonorSourceSegment[];
  text: string;
}

export interface NovexHonorFallbackPerformance {
  characterId: string;
  codename: string;
  linkedReturn: number;
  rank: 1 | 2 | 3;
  title?: string;
  badge?: string;
}

/**
 * 여러 ERP 화면이 함께 읽는 공적 원장. 내부 식별자와 분석 감사 필드는 공개
 * read model에서 반드시 제거한다.
 */
export interface HonorRecord {
  _id?: ObjectId;
  /** API에 노출 가능한 불투명하고 안정적인 키. */
  publicKey: string;
  /** 도메인 멱등 키: season/report + character. */
  logicalKey: string;
  domain: HonorDomain;
  category: HonorCategory;
  characterId: string;
  codenameSnapshot: string;
  title: string;
  citation: string;
  rank?: 1 | 2 | 3;
  source: HonorRecordSource;
  sourceHash: string;
  analyzerRevision?: string;
  /** 작전 공적은 U만 허용한다. NOVEX는 필드가 없다. */
  minRole?: RoleLevel;
  evidenceAudit?: HonorEvidenceAudit[];
  status: HonorRecordStatus;
  occurredAt: Date;
  issuedAt: Date;
  updatedAt: Date;
}

export interface UpsertHonorRecordInput extends Omit<HonorRecord, "_id"> {}

export const HONOR_ANALYSIS_STATUSES = [
  "PENDING",
  "LEASED",
  "RETRY",
  "SUCCEEDED",
  "SKIPPED",
] as const;
export type HonorAnalysisStatus =
  (typeof HONOR_ANALYSIS_STATUSES)[number];

/** 원문은 저장하지 않고 sourceHash/revision과 lease 상태만 보존한다. */
export interface HonorAnalysisState {
  _id: string;
  sourceType: "SESSION_REPORT";
  sourceKey: string;
  sourceRecordId: string;
  sourceHash: string;
  analyzerRevision: string;
  status: HonorAnalysisStatus;
  attempts: number;
  leaseToken?: string;
  leaseUntil?: Date;
  nextAttemptAt?: Date;
  lastError?: string;
  analyzedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface HonorRecordQuery {
  domain?: HonorDomain;
  category?: HonorCategory;
  characterId?: string;
  sourceType?: HonorSourceType;
  sourceKey?: string;
  status?: HonorRecordStatus;
  minRole?: RoleLevel;
  cursor?: string;
  limit?: number;
}

export interface HonorRecordPage {
  items: HonorRecord[];
  nextCursor?: string;
}
