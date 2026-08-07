/**
 * session_reports CRUD
 */

import { ObjectId, type ClientSession, type Db, type Document } from "mongodb";

import {
  ROLE_LEVEL_RANK,
  ROLE_LEVELS,
  type CreateSessionReportInput,
  type RoleLevel,
  type SessionReport,
} from "../types/index.js";

import { sessionReportsCol } from "../collections.js";
import { getClient, getDb } from "../client.js";
import { lockReportSessionSource } from "./sessions.js";
import {
  SESSION_REPORT_REFERENCE_FIELDS,
  lockSessionReportReferenceTarget,
  type SessionReportReferenceField,
} from "./session-report-reference-integrity.js";

export {
  assertNoSessionReportInboundReference,
  hasSessionReportInboundReference,
  lockAndAssertNoSessionReportInboundReference,
  SessionReportInboundReferenceError,
  SessionReportReferenceConflictError,
} from "./session-report-reference-integrity.js";
export type { SessionReportReferenceField } from "./session-report-reference-integrity.js";

const REPORT_REFERENCE_MAX_COUNT = 200;
const REPORT_REFERENCE_MAX_LENGTH = 160;
const REPORT_REFERENCE_FIELDS = SESSION_REPORT_REFERENCE_FIELDS;

/** 미설정 legacy 보고서는 전체 인증 사용자에게 열려 있던 기존 계약(U)을 유지한다. */
export function normalizeSessionReportMinRole(value: unknown): RoleLevel | null {
  if (value === undefined || value === null) return "U";
  if (
    typeof value === "string" &&
    (ROLE_LEVELS as readonly string[]).includes(value)
  ) {
    return value as RoleLevel;
  }
  return null;
}

export function isSessionReportVisibleToRole(
  report: { minRole?: unknown },
  viewerRole: RoleLevel,
): boolean {
  const minRole = normalizeSessionReportMinRole(report.minRole);
  return minRole !== null && ROLE_LEVEL_RANK[viewerRole] >= ROLE_LEVEL_RANK[minRole];
}

/** Mongo 조회 단계에서 제한 보고서의 제목·본문·존재 자체를 fail-closed 한다. */
export function sessionReportVisibilityFilter(viewerRole: RoleLevel): Document {
  const allowedMinRoles = ROLE_LEVELS.filter(
    (minRole) => ROLE_LEVEL_RANK[viewerRole] >= ROLE_LEVEL_RANK[minRole],
  );
  return {
    $or: [
      { minRole: { $exists: false } },
      { minRole: null },
      { minRole: { $in: allowedMinRoles } },
    ],
  };
}

export interface SessionReportReferenceTargetIssue {
  field: SessionReportReferenceField;
  value: string;
  reason: "missing" | "ambiguous";
}

export class SessionReportSourceNotFoundError extends Error {
  readonly code = "SESSION_REPORT_SOURCE_NOT_FOUND";

  constructor(readonly sessionId: string) {
    super("연결할 세션을 찾을 수 없습니다.");
    this.name = "SessionReportSourceNotFoundError";
  }
}

export class SessionReportReferenceTargetError extends Error {
  readonly code = "SESSION_REPORT_REFERENCE_TARGET";

  constructor(readonly issues: SessionReportReferenceTargetIssue[]) {
    super("구조화 로어 링크 target이 유효하지 않습니다.");
    this.name = "SessionReportReferenceTargetError";
  }
}

export class SessionReportAlreadyExistsError extends Error {
  readonly code = "SESSION_REPORT_ALREADY_EXISTS";

  constructor(readonly sessionId: string) {
    super("같은 sessionId의 작전 보고서가 이미 존재합니다.");
    this.name = "SessionReportAlreadyExistsError";
  }
}

export type SessionReportReferences = Partial<
  Pick<SessionReport, SessionReportReferenceField>
>;

type ResolvedSessionReportReferences = Record<
  SessionReportReferenceField,
  string[]
>;

function uniqueReferenceValues(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

async function resolveSessionReportReferencesForMinRole(
  references: SessionReportReferences,
  reportMinRole: unknown,
  options: { session?: ClientSession; db?: Db } = {},
): Promise<ResolvedSessionReportReferences> {
  const relatedWikiSlugs = uniqueReferenceValues(
    references.relatedWikiSlugs ?? [],
  );
  const relatedPersonnelCodenames = uniqueReferenceValues(
    references.relatedPersonnelCodenames ?? [],
  );
  const relatedCatalogSlugs = uniqueReferenceValues(
    references.relatedCatalogSlugs ?? [],
  );

  const resolved: ResolvedSessionReportReferences = {
    relatedWikiSlugs: [],
    relatedPersonnelCodenames: [],
    relatedCatalogSlugs: [],
  };
  const minRole = normalizeSessionReportMinRole(reportMinRole);
  if (minRole === null) return resolved;

  const canViewPrivateWikiAndCatalog =
    ROLE_LEVEL_RANK[minRole] >= ROLE_LEVEL_RANK.V;
  const canViewPrivatePersonnel = minRole === "GM";
  const db = options.db ?? await getDb();
  if (relatedWikiSlugs.length > 0) {
    const rows = await db
      .collection("wiki_pages")
      .find(
        {
          slug: { $in: relatedWikiSlugs },
          ...(canViewPrivateWikiAndCatalog ? {} : { isPublic: true }),
        },
        { projection: { slug: 1 }, session: options.session },
      )
      .toArray();
    resolved.relatedWikiSlugs = rows.flatMap((row) =>
      typeof row.slug === "string" ? [row.slug] : [],
    );
  }
  if (relatedPersonnelCodenames.length > 0) {
    const rows = await db
      .collection("characters")
      .find(
        {
          codename: { $in: relatedPersonnelCodenames },
          ...(canViewPrivatePersonnel ? {} : { isPublic: { $ne: false } }),
        },
        { projection: { codename: 1 }, session: options.session },
      )
      .toArray();
    resolved.relatedPersonnelCodenames = rows.map((row) => row.codename);
  }
  if (relatedCatalogSlugs.length > 0) {
    const rows = await db
      .collection("master_items")
      .find(
        {
          slug: { $in: relatedCatalogSlugs },
          ...(canViewPrivateWikiAndCatalog
            ? {}
            : { isPublic: { $ne: false } }),
        },
        { projection: { slug: 1 }, session: options.session },
      )
      .toArray();
    resolved.relatedCatalogSlugs = rows.flatMap((row) =>
      typeof row.slug === "string" ? [row.slug] : [],
    );
  }
  return resolved;
}

/**
 * 이미 해석된 공개 target 집합으로 보고서의 구조화 참조를 정제한다.
 * 비공개 전환·삭제·legacy drift가 있어도 API/RSC 응답이 식별자를 노출하지 않는다.
 */
export function filterSessionReportReferencesToResolvedTargets<
  T extends SessionReportReferences,
>(
  reports: readonly T[],
  resolved: ResolvedSessionReportReferences,
): T[] {
  const allowed = {
    relatedCatalogSlugs: new Set(resolved.relatedCatalogSlugs),
    relatedPersonnelCodenames: new Set(resolved.relatedPersonnelCodenames),
    relatedWikiSlugs: new Set(resolved.relatedWikiSlugs),
  };

  return reports.map((report) => {
    const {
      provenanceSourceId: _legacyProvenanceSourceId,
      provenanceSourceIds: _provenanceSourceIds,
      ...publicReport
    } = report as T & {
      provenanceSourceId?: string;
      provenanceSourceIds?: string[];
    };
    void _legacyProvenanceSourceId;
    void _provenanceSourceIds;
    const filtered: SessionReportReferences = {};
    for (const field of REPORT_REFERENCE_FIELDS) {
      const values = report[field];
      if (values !== undefined) {
        filtered[field] = values.filter((value) => allowed[field].has(value));
      }
    }
    return { ...publicReport, ...filtered } as T;
  });
}

/**
 * 모든 보고서 출력 표면에 적용하는 target 기반 fail-closed 정제.
 * legacy(U) 보고서는 공개 target만, V+ 제한 보고서는 그 최소 역할로 열람 가능한
 * 비공개 wiki/catalog까지 보존한다. 함수명은 기존 호출 호환을 위해 유지한다.
 */
export async function sanitizeSessionReportReferencesForPublicTargets<
  T extends SessionReportReferences & { minRole?: unknown },
>(
  reports: readonly T[],
  options: { session?: ClientSession; db?: Db } = {},
): Promise<T[]> {
  if (reports.length === 0) return [];
  const roles = new Set<RoleLevel>();
  for (const report of reports) {
    const minRole = normalizeSessionReportMinRole(report.minRole);
    if (minRole !== null) roles.add(minRole);
  }
  const resolvedByRole = new Map<
    RoleLevel,
    ResolvedSessionReportReferences
  >();
  await Promise.all(
    [...roles].map(async (minRole) => {
      const group = reports.filter(
        (report) => normalizeSessionReportMinRole(report.minRole) === minRole,
      );
      const references: SessionReportReferences = {};
      for (const field of REPORT_REFERENCE_FIELDS) {
        references[field] = uniqueReferenceValues(
          group.flatMap((report) => report[field] ?? []),
        );
      }
      resolvedByRole.set(
        minRole,
        await resolveSessionReportReferencesForMinRole(
          references,
          minRole,
          options,
        ),
      );
    }),
  );
  const emptyResolved: ResolvedSessionReportReferences = {
    relatedWikiSlugs: [],
    relatedPersonnelCodenames: [],
    relatedCatalogSlugs: [],
  };
  return reports.flatMap((report) => {
    const minRole = normalizeSessionReportMinRole(report.minRole);
    const resolved =
      minRole === null
        ? emptyResolved
        : resolvedByRole.get(minRole) ?? emptyResolved;
    return filterSessionReportReferencesToResolvedTargets([report], resolved);
  });
}

export function collectSessionReportReferenceTargetIssues(
  references: SessionReportReferences,
  resolved: ResolvedSessionReportReferences,
): SessionReportReferenceTargetIssue[] {
  const issues: SessionReportReferenceTargetIssue[] = [];
  for (const field of REPORT_REFERENCE_FIELDS) {
    const counts = new Map<string, number>();
    for (const value of resolved[field]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    for (const value of references[field] ?? []) {
      const count = counts.get(value) ?? 0;
      if (count === 0) issues.push({ field, value, reason: "missing" });
      else if (count > 1) issues.push({ field, value, reason: "ambiguous" });
    }
  }
  return issues;
}

/**
 * 구조화 보고서 참조가 각 도메인 SSOT의 exact identity로 유일하게 해석되는지 확인한다.
 * report write와 같은 transaction session을 전달해 동일 snapshot에서 검증한다.
 */
export async function findSessionReportReferenceTargetIssues(
  references: SessionReportReferences,
  options: {
    session?: ClientSession;
    db?: Db;
    reportMinRole?: unknown;
  } = {},
): Promise<SessionReportReferenceTargetIssue[]> {
  const resolved = await resolveSessionReportReferencesForMinRole(
    references,
    options.reportMinRole,
    options,
  );
  return collectSessionReportReferenceTargetIssues(references, resolved);
}

/**
 * report write와 target lifecycle mutation이 같은 target document를 쓰게 해
 * 검증 이후 삭제/identity·visibility 변경 TOCTTOU를 Mongo transaction 충돌로 막는다.
 */
export async function lockSessionReportReferenceTargets(
  references: SessionReportReferences,
  session: ClientSession,
  options: { db?: Db } = {},
): Promise<void> {
  const relatedWikiSlugs = uniqueReferenceValues(
    references.relatedWikiSlugs ?? [],
  );
  const relatedPersonnelCodenames = uniqueReferenceValues(
    references.relatedPersonnelCodenames ?? [],
  );
  const relatedCatalogSlugs = uniqueReferenceValues(
    references.relatedCatalogSlugs ?? [],
  );

  if (relatedWikiSlugs.length > 0) {
    for (const slug of relatedWikiSlugs) {
      await lockSessionReportReferenceTarget(
        "relatedWikiSlugs",
        slug,
        session,
        options,
      );
    }
  }
  if (relatedPersonnelCodenames.length > 0) {
    for (const codename of relatedPersonnelCodenames) {
      await lockSessionReportReferenceTarget(
        "relatedPersonnelCodenames",
        codename,
        session,
        options,
      );
    }
  }
  if (relatedCatalogSlugs.length > 0) {
    for (const slug of relatedCatalogSlugs) {
      await lockSessionReportReferenceTarget(
        "relatedCatalogSlugs",
        slug,
        session,
        options,
      );
    }
  }
}

/**
 * 신규 운영 report create가 공유하는 source + reference 불변조건 게이트.
 *
 * - 등록된 sessions/trpg_sessions source를 같은 transaction에서 write-lock
 * - 최종 3개 reference 배열을 보고서 최소 역할이 볼 수 있는 exact identity로 검증
 * - target lifecycle mutation과 같은 document를 touch해 TOCTTOU 차단
 * - 표시 제목은 source SSOT에서만 파생
 */
export async function validateAndLockSessionReportWrite(
  sessionId: string,
  references: SessionReportReferences,
  session: ClientSession,
  options: { db?: Db; reportMinRole?: unknown } = {},
): Promise<{ sessionTitle: string }> {
  const source = await lockReportSessionSource(sessionId, session, options);
  if (!source) throw new SessionReportSourceNotFoundError(sessionId);

  await validateAndLockSessionReportReferences(references, session, options);
  return { sessionTitle: source.title.slice(0, 200) };
}

/** immutable source가 이미 확정된 기존 report update용 final-reference gate. */
export async function validateAndLockSessionReportReferences(
  references: SessionReportReferences,
  session: ClientSession,
  options: { db?: Db; reportMinRole?: unknown } = {},
): Promise<void> {
  const issues = await findSessionReportReferenceTargetIssues(references, {
    ...options,
    session,
  });
  if (issues.length > 0) {
    throw new SessionReportReferenceTargetError(issues);
  }
  await lockSessionReportReferenceTargets(references, session, options);
}

function normalizeReportReferences(
  value: unknown,
  field: (typeof REPORT_REFERENCE_FIELDS)[number],
): string[] {
  if (!Array.isArray(value) || value.length > REPORT_REFERENCE_MAX_COUNT) {
    throw new Error(`${field} 형식 오류`);
  }
  const normalized = value.map((entry) => {
    if (typeof entry !== "string") throw new Error(`${field} 형식 오류`);
    const text = entry.trim();
    if (!text || text.length > REPORT_REFERENCE_MAX_LENGTH) {
      throw new Error(`${field} 형식 오류`);
    }
    return text;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${field} 중복 오류`);
  }
  return normalized;
}

export async function listSessionReports(): Promise<SessionReport[]> {
  const col = await sessionReportsCol();
  const reports = await col.find().sort({ createdAt: -1 }).toArray();
  return sanitizeSessionReportReferencesForPublicTargets(reports);
}

export async function listVisibleSessionReports(
  viewerRole: RoleLevel,
): Promise<SessionReport[]> {
  const col = await sessionReportsCol();
  const reports = await col
    .find(sessionReportVisibilityFilter(viewerRole))
    .sort({ createdAt: -1 })
    .toArray();
  return sanitizeSessionReportReferencesForPublicTargets(reports);
}

export async function findReportBySessionId(
  sessionId: string
): Promise<SessionReport | null> {
  const col = await sessionReportsCol();
  const report = await col.findOne({ sessionId });
  if (!report) return null;
  const [safeReport] =
    await sanitizeSessionReportReferencesForPublicTargets([report]);
  return safeReport;
}

/** 세션 연관 카드 표시용 경량 리포트 행. */
export type SessionReportRefLite = Pick<
  SessionReport,
  "_id" | "sessionId" | "sessionTitle" | "locationLabel" | "createdAt"
>;

/**
 * 여러 sessionId 의 리포트를 연관 표시 필드만으로 일괄 조회.
 *
 * 신원조회(Dossier) 등장 이벤트 카드처럼 sessionId → 제목/장소 매핑만 필요한 경로 전용
 * (`listSessionReports()` 전체 로드 + JS 필터 대체).
 * - 정렬은 `listSessionReports` 와 동일한 `{ createdAt: -1 }` — 목록 대체 시 표시 순서 보존.
 * - 빈 배열 입력은 즉시 short-circuit.
 */
export async function findSessionReportsBySessionIds(
  sessionIds: string[]
): Promise<SessionReportRefLite[]> {
  if (sessionIds.length === 0) return [];
  const col = await sessionReportsCol();
  return col
    .find({ sessionId: { $in: sessionIds } })
    .project<SessionReportRefLite>({
      sessionId: 1,
      sessionTitle: 1,
      locationLabel: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();
}

/** dossier의 세션 근거와 명시적 personnel codename 역참조를 함께 조회한다. */
export async function findSessionReportsForPersonnel(
  sessionIds: string[],
  codename: string,
  viewerRole: RoleLevel,
): Promise<SessionReportRefLite[]> {
  const clauses: Record<string, unknown>[] = [];
  if (sessionIds.length > 0) clauses.push({ sessionId: { $in: sessionIds } });
  const normalizedCodename = codename.trim();
  if (normalizedCodename) {
    clauses.push({ relatedPersonnelCodenames: normalizedCodename });
  }
  if (clauses.length === 0) return [];

  const col = await sessionReportsCol();
  return col
    .find({
      $and: [
        sessionReportVisibilityFilter(viewerRole),
        clauses.length === 1 ? clauses[0] : { $or: clauses },
      ],
    })
    .project<SessionReportRefLite>({
      sessionId: 1,
      sessionTitle: 1,
      locationLabel: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();
}

/** 자동링크/연관 문서/보고서 넘버링용 참조 행 — summary/highlights 등 본문성 필드 제외. */
export type SessionReportRef = Pick<
  SessionReport,
  | "_id"
  | "sessionId"
  | "sessionTitle"
  | "reportNumber"
  | "minRole"
  | "locationLabel"
  | "participants"
  | "relatedCatalogSlugs"
  | "relatedPersonnelCodenames"
  | "relatedWikiSlugs"
  | "createdAt"
>;

/**
 * 위키/보고서 상세의 자동링크 타깃·연관 보고서·넘버링 전용 참조 list —
 * `listSessionReports()` 대체.
 *
 * 포함 필드 근거:
 * - `buildWikiAutoLinkTargets` — _id/sessionId/sessionTitle
 * - `relatedReportsForWiki`(+`toRelatedReportLink`) — sessionId/sessionTitle/
 *   locationLabel/participants/related* 명시 참조/createdAt
 * - `findOperationReportNumberMeta` — _id/sessionId/sessionTitle/createdAt/reportNumber
 *
 * **summary/highlights 가 매칭에 참여하는 경로는 사용 금지** — 카탈로그 상세의
 * `relatedReportsForCatalogItem`, 세력 보드의 시그널 카운트는 `listSessionReports()` 유지.
 * 정렬은 `listSessionReports` 와 동일한 `{ createdAt: -1 }` — 목록 대체 시 순서 보존.
 */
export async function listSessionReportRefs(): Promise<SessionReportRef[]> {
  const col = await sessionReportsCol();
  const reports = await col
    .find()
    .project<SessionReportRef>({
      _id: 1,
      sessionId: 1,
      sessionTitle: 1,
      reportNumber: 1,
      minRole: 1,
      locationLabel: 1,
      participants: 1,
      relatedCatalogSlugs: 1,
      relatedPersonnelCodenames: 1,
      relatedWikiSlugs: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();
  return sanitizeSessionReportReferencesForPublicTargets(reports);
}

export async function listVisibleSessionReportRefs(
  viewerRole: RoleLevel,
): Promise<SessionReportRef[]> {
  const col = await sessionReportsCol();
  const reports = await col
    .find(sessionReportVisibilityFilter(viewerRole))
    .project<SessionReportRef>({
      _id: 1,
      sessionId: 1,
      sessionTitle: 1,
      reportNumber: 1,
      minRole: 1,
      locationLabel: 1,
      participants: 1,
      relatedCatalogSlugs: 1,
      relatedPersonnelCodenames: 1,
      relatedWikiSlugs: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();
  return sanitizeSessionReportReferencesForPublicTargets(reports);
}

export async function findReportById(
  id: string,
  options: { session?: ClientSession } = {},
): Promise<SessionReport | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await sessionReportsCol();
  return col.findOne({ _id: new ObjectId(id) }, { session: options.session });
}

export async function findVisibleReportById(
  id: string,
  viewerRole: RoleLevel,
  options: { session?: ClientSession } = {},
): Promise<SessionReport | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await sessionReportsCol();
  const report = await col.findOne(
    {
      $and: [
        { _id: new ObjectId(id) },
        sessionReportVisibilityFilter(viewerRole),
      ],
    },
    { session: options.session },
  );
  if (!report) return null;
  const [safeReport] =
    await sanitizeSessionReportReferencesForPublicTargets([report], options);
  return safeReport;
}

export async function createSessionReport(
  input: CreateSessionReportInput,
  options: { session?: ClientSession; db?: Db } = {},
): Promise<SessionReport> {
  if (!options.session) {
    const session = (await getClient()).startSession();
    let created: SessionReport | null = null;
    try {
      await session.withTransaction(async () => {
        created = await createSessionReport(input, { session });
      });
      if (!created) throw new Error("세션 리포트 transaction 결과가 없습니다.");
      return created;
    } finally {
      await session.endSession();
    }
  }

  const sessionId = input.sessionId.trim();
  if (!sessionId) {
    throw new Error("sessionId는 필수입니다.");
  }
  const col = await sessionReportsCol();
  const now = new Date();
  const normalizedReferences: Partial<SessionReport> = {};
  for (const field of REPORT_REFERENCE_FIELDS) {
    if (input[field] !== undefined) {
      normalizedReferences[field] = normalizeReportReferences(input[field], field);
    }
  }
  const integrity = await validateAndLockSessionReportWrite(
    sessionId,
    normalizedReferences,
    options.session,
    { ...options, reportMinRole: input.minRole },
  );
  // Source document lock serializes concurrent creates. The in-transaction
  // existence check therefore remains race-safe even before the unique index
  // rollout, while the index stays the final storage-level defense.
  const duplicate = await col.findOne(
    { sessionId },
    { projection: { _id: 1 }, session: options.session },
  );
  if (duplicate) throw new SessionReportAlreadyExistsError(sessionId);
  const {
    provenanceSourceId: _legacyProvenanceSourceId,
    provenanceSourceIds: _provenanceSourceIds,
    ...safeInput
  } = input as CreateSessionReportInput & {
    provenanceSourceId?: string;
    provenanceSourceIds?: string[];
  };
  void _legacyProvenanceSourceId;
  void _provenanceSourceIds;
  const doc: SessionReport = {
    ...safeInput,
    ...normalizedReferences,
    sessionId,
    sessionTitle: integrity.sessionTitle,
    createdAt: now,
    updatedAt: now,
  };
  const result = await col.insertOne(doc, { session: options.session });
  return { ...doc, _id: result.insertedId };
}

const ALLOWED_REPORT_FIELDS = new Set([
  "summary",
  "highlights",
  "participants",
  "locationLabel",
  "mapX",
  "mapY",
  "mapPrecision",
  ...REPORT_REFERENCE_FIELDS,
]);

export async function updateSessionReport(
  id: string,
  update: Record<string, unknown>,
  expectedUpdatedAt?: Date | null,
  options: { session?: ClientSession; db?: Db } = {},
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  if (!options.session) {
    const session = (await getClient()).startSession();
    let updated = false;
    try {
      await session.withTransaction(async () => {
        updated = await updateSessionReport(id, update, expectedUpdatedAt, {
          session,
        });
      });
      return updated;
    } finally {
      await session.endSession();
    }
  }

  const toSet: Record<string, unknown> = {};
  const toUnset: Record<string, ""> = {};
  for (const key of Object.keys(update)) {
    if (!ALLOWED_REPORT_FIELDS.has(key)) continue;
    if (update[key] === null) toUnset[key] = "";
    else if (REPORT_REFERENCE_FIELDS.includes(key as never)) {
      toSet[key] = normalizeReportReferences(
        update[key],
        key as (typeof REPORT_REFERENCE_FIELDS)[number],
      );
    } else toSet[key] = update[key];
  }
  if (Object.keys(toSet).length === 0 && Object.keys(toUnset).length === 0) {
    return false;
  }

  const col = await sessionReportsCol();
  const filter: Record<string, unknown> = { _id: new ObjectId(id) };
  if (expectedUpdatedAt !== undefined) {
    filter.updatedAt = expectedUpdatedAt;
  }
  const current = await col.findOne(filter, { session: options.session });
  if (!current) return false;

  const finalReferences: SessionReportReferences = {};
  for (const field of REPORT_REFERENCE_FIELDS) {
    finalReferences[field] = Object.hasOwn(toSet, field)
      ? (toSet[field] as string[])
      : Object.hasOwn(toUnset, field)
        ? []
        : current[field] ?? [];
  }
  await validateAndLockSessionReportReferences(
    finalReferences,
    options.session,
    { ...options, reportMinRole: current.minRole },
  );

  const updateDoc: Record<string, unknown> = {
    $set: {
      ...toSet,
      updatedAt: new Date(),
    },
  };
  if (Object.keys(toUnset).length > 0) updateDoc.$unset = toUnset;

  const result = await col.updateOne(
    filter,
    updateDoc,
    { session: options.session },
  );
  return result.matchedCount > 0;
}

export async function deleteSessionReport(
  id: string,
  expectedUpdatedAt?: Date | null,
  options: { session?: ClientSession } = {},
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await sessionReportsCol();
  const filter: Record<string, unknown> = { _id: new ObjectId(id) };
  if (expectedUpdatedAt !== undefined) filter.updatedAt = expectedUpdatedAt;
  const result = await col.deleteOne(filter, { session: options.session });
  return result.deletedCount > 0;
}
