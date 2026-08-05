import type { ClientSession, Db, Filter } from "mongodb";

import { getDb } from "../client.js";
import type { SessionReport } from "../types/index.js";

export const SESSION_REPORT_REFERENCE_FIELDS = [
  "relatedCatalogSlugs",
  "relatedPersonnelCodenames",
  "relatedWikiSlugs",
] as const;

export type SessionReportReferenceField =
  (typeof SESSION_REPORT_REFERENCE_FIELDS)[number];

export class SessionReportReferenceConflictError extends Error {
  readonly code = "SESSION_REPORT_REFERENCE_CONFLICT";

  constructor() {
    super("구조화 로어 링크 대상이 동시에 변경되었습니다.");
    this.name = "SessionReportReferenceConflictError";
  }
}

export class SessionReportInboundReferenceError extends Error {
  readonly code = "SESSION_REPORT_INBOUND_REFERENCE";

  constructor(
    readonly field: SessionReportReferenceField,
    readonly value: string,
  ) {
    super("작전 보고서가 참조 중인 로어 대상은 식별자 변경·비공개·삭제할 수 없습니다.");
    this.name = "SessionReportInboundReferenceError";
  }
}

const SESSION_REPORT_REFERENCE_LOCK_FIELD =
  "__sessionReportReferenceLockAt" as const;

async function resolveDb(options: { db?: Db }): Promise<Db> {
  return options.db ?? getDb();
}

/**
 * 보고서 write와 target lifecycle write가 동일 target document를 갱신하게 하는
 * transaction conflict anchor. `$currentDate`는 legacy/오염된 값의 BSON type과
 * 무관하게 안전하게 덮어쓰며, 공개 domain DTO에는 이 필드를 포함하지 않는다.
 */
export async function lockSessionReportReferenceTarget(
  field: SessionReportReferenceField,
  value: string,
  session: ClientSession,
  options: { db?: Db } = {},
): Promise<void> {
  const db = await resolveDb(options);
  const collection =
    field === "relatedWikiSlugs"
      ? "wiki_pages"
      : field === "relatedPersonnelCodenames"
        ? "characters"
        : "master_items";
  const identity =
    field === "relatedPersonnelCodenames" ? "codename" : "slug";
  const result = await db.collection(collection).updateOne(
    { [identity]: value },
    { $currentDate: { [SESSION_REPORT_REFERENCE_LOCK_FIELD]: true } },
    { session },
  );
  if (result.matchedCount !== 1) {
    throw new SessionReportReferenceConflictError();
  }
}

export async function hasSessionReportInboundReference(
  field: SessionReportReferenceField,
  value: string,
  options: { session?: ClientSession; db?: Db } = {},
): Promise<boolean> {
  const report = await (await resolveDb(options))
    .collection<SessionReport>("session_reports")
    .findOne(
      { [field]: value } as Filter<SessionReport>,
      { projection: { _id: 1 }, session: options.session },
    );
  return report !== null;
}

export async function assertNoSessionReportInboundReference(
  field: SessionReportReferenceField,
  value: string,
  options: { session?: ClientSession; db?: Db } = {},
): Promise<void> {
  if (await hasSessionReportInboundReference(field, value, options)) {
    throw new SessionReportInboundReferenceError(field, value);
  }
}

/**
 * target의 식별자/공개상태/존재를 바꾸기 직전에 호출한다. report write도 같은
 * target document를 touch하므로 검증과 실제 target mutation 사이의 TOCTTOU는
 * transaction write conflict로 중단된다.
 */
export async function lockAndAssertNoSessionReportInboundReference(
  field: SessionReportReferenceField,
  value: string,
  session: ClientSession,
  options: { db?: Db } = {},
): Promise<void> {
  await lockSessionReportReferenceTarget(field, value, session, options);
  await assertNoSessionReportInboundReference(field, value, {
    ...options,
    session,
  });
}
